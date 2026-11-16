import { z } from "zod";
import {
  addMonths,
  cents,
  date,
  remaining,
  today,
  type Plan,
  type State,
} from "./finance";
import type { Identity } from "../data/store";

export const loanModalities = {
  personal: "Empréstimo pessoal",
  payroll: "Consignado",
  financing: "Financiamento",
  store: "Carnê / crediário",
  statement: "Parcelamento de fatura",
  other: "Outro / não informado",
} as const;
export type LoanDetails = {
  version?: number;
  institution?: string | null;
  modality?: keyof typeof loanModalities;
  interest_kind?: "with" | "without" | "unknown";
  original_amount?: number | null;
  cet_basis_points?: number | null;
  signed_on?: string | null;
  contract_notes?: string | null;
  cadence_unit?: "days" | "months";
  cadence_count?: number;
  calendar_anchor_number?: number | null;
  calendar_anchor_due?: string | null;
};
export function loanDue(
  anchor: string,
  offset: number,
  unit: "days" | "months",
  step: number,
) {
  date.parse(anchor);
  z.number().int().nonnegative().max(600).parse(offset);
  z.number().int().min(1).max(120).parse(step);
  if (unit === "months") return date.parse(addMonths(anchor, offset * step));
  const value = new Date(`${anchor}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset * step);
  return date.parse(value.toISOString().slice(0, 10));
}
export function applyLoanDetails(
  state: State,
  command: { type: string; payload: Record<string, unknown> },
  user: Identity,
): State | null {
  if (command.type !== "loan_details") return null;
  const n = structuredClone(state),
    p = command.payload;
  const plan = n.plans.find(
    (pn) => pn.id === p.id && pn.owner_id === user.id,
  ) as (Plan & LoanDetails) | undefined;
  if (!plan || plan.kind === "purchase")
    throw Error("Contrato não autorizado.");
  if ((plan.version ?? 1) !== p.version)
    throw Error("Contrato alterado. Atualize os dados.");
  z.string().trim().min(5).max(500).parse(p.reason);
  const details = {
    institution: z
      .string()
      .trim()
      .max(160)
      .parse(p.institution ?? ""),
    modality: z
      .enum(["personal", "payroll", "financing", "store", "statement", "other"])
      .parse(p.modality ?? "other"),
    interest_kind: z
      .enum(["with", "without", "unknown"])
      .parse(p.interest_kind ?? "unknown"),
    original_amount:
      p.original_amount == null ? null : cents.parse(p.original_amount),
    cet_basis_points:
      p.cet_basis_points == null
        ? null
        : z.number().int().min(0).max(100000).parse(p.cet_basis_points),
    signed_on: p.signed_on ? date.parse(p.signed_on) : null,
    contract_notes: z
      .string()
      .trim()
      .max(2000)
      .parse(p.contract_notes ?? ""),
    cadence_unit: z.enum(["days", "months"]).parse(p.cadence_unit ?? "months"),
    cadence_count: z
      .number()
      .int()
      .min(1)
      .max(120)
      .parse(p.cadence_count ?? 1),
  };
  if (details.signed_on && details.signed_on > today())
    throw Error("Data de contratação futura.");
  if (p.apply_calendar) {
    const anchor = z
      .number()
      .int()
      .min(1)
      .max(plan.count)
      .parse(p.anchor_number);
    const due = date.parse(p.anchor_due);
    const anchorItem = n.obligations.find(
      (o) => o.plan_id === plan.id && o.number === anchor,
    );
    if (
      due < today() ||
      !anchorItem ||
      (anchorItem.due_on && anchorItem.due_on < today()) ||
      anchorItem.confirmed ||
      anchorItem.replaced_by ||
      anchorItem.cancelled_on ||
      n.payments.some(
        (pay) => pay.obligation_id === anchorItem.id && !pay.reversed_on,
      )
    )
      throw Error(
        "Escolha uma parcela aberta, futura e sem pagamento como âncora.",
      );
    const start = plan.first_due ?? plan.next_due;
    if (start && due < start)
      throw Error("A âncora não pode preceder o início conhecido.");
    n.obligations
      .filter(
        (o) =>
          o.plan_id === plan.id &&
          o.number != null &&
          o.number >= anchor &&
          !o.replaced_by &&
          !o.cancelled_on &&
          !o.confirmed &&
          (!o.due_on || o.due_on >= today()) &&
          remaining(o, n.payments) > 0 &&
          !n.payments.some(
            (pay) => pay.obligation_id === o.id && !pay.reversed_on,
          ),
      )
      .forEach((o) => {
        o.due_on = loanDue(
          due,
          o.number! - anchor,
          details.cadence_unit,
          details.cadence_count,
        );
        o.version++;
      });
    plan.calendar_anchor_number = anchor;
    plan.calendar_anchor_due = due;
  }
  Object.assign(plan, details, { version: (plan.version ?? 1) + 1 });
  return n;
}
