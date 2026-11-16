import { z } from "zod";
import {
  addMonths,
  cents,
  date,
  remaining,
  today,
  type Entry,
  type Obligation,
  type State,
} from "./finance";

export type RecurrenceRule = State["recurrences"][number] & {
  interval_unit?: "days" | "months";
  interval_count?: number;
  anchor_index?: number;
  version?: number;
  category?: string;
};
export type RecurrenceOccurrence = Obligation & {
  occurrence_index?: number;
  recurrence_category?: string;
  occurrence_override?: boolean;
  cancelled_on?: string | null;
};
export const cadences = [
  { name: "Semanal", unit: "days", step: 7 },
  { name: "Quinzenal (a cada 15 dias)", unit: "days", step: 15 },
  { name: "Mensal", unit: "months", step: 1 },
  { name: "Bimestral", unit: "months", step: 2 },
  { name: "Trimestral", unit: "months", step: 3 },
  { name: "Semestral", unit: "months", step: 6 },
  { name: "Anual", unit: "months", step: 12 },
] as const;

export function recurrenceDate(
  anchor: string,
  index: number,
  unit = "months",
  step = 1,
) {
  date.parse(anchor);
  z.number().int().min(0).max(599).parse(index);
  z.number().int().min(1).max(366).parse(step);
  if (unit === "months") return addMonths(anchor, index * step);
  if (unit !== "days") throw Error("Periodicidade inválida.");
  const value = new Date(`${anchor}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + index * step);
  return value.toISOString().slice(0, 10);
}

export function variableEstimate(
  state: State,
  ruleId: string,
  before: string,
  fallback: number,
) {
  const values = (state.obligations as RecurrenceOccurrence[])
    .filter(
      (o) =>
        o.recurrence_id === ruleId &&
        o.due_on &&
        o.due_on < before &&
        !o.unknown &&
        !o.cancelled_on,
    )
    .sort((a, b) => b.due_on!.localeCompare(a.due_on!))
    .slice(0, 6)
    .map((o) => o.amount)
    .sort((a, b) => a - b);
  return values.length ? values[Math.floor((values.length - 1) / 2)] : fallback;
}

function generate(
  state: State,
  rule: RecurrenceRule,
  count: number,
  family: string,
) {
  z.number().int().min(1).max(600).parse(count);
  for (let i = rule.anchor_index ?? 0; i < count; i++) {
    const id = `${rule.id}:${i}`;
    if (state.obligations.some((o) => o.id === id)) continue;
    const due = recurrenceDate(
      rule.first_due,
      i - (rule.anchor_index ?? 0),
      rule.interval_unit,
      rule.interval_count,
    );
    state.obligations.push({
      id,
      owner_id: rule.owner_id,
      family_id: family,
      description: rule.description,
      amount: rule.variable
        ? variableEstimate(state, rule.id, due, rule.amount)
        : rule.amount,
      due_on: due,
      house: rule.house,
      confirmed: 0,
      unknown: rule.variable,
      recurrence_id: rule.id,
      plan_id: null,
      number: null,
      card_id: null,
      replaced_by: null,
      version: 1,
      occurrence_index: i,
      recurrence_category: rule.category ?? "Outros",
      occurrence_override: false,
    } as RecurrenceOccurrence);
  }
}

export function purchaseSummary(amounts: number[], original?: number | null) {
  z.array(cents.positive()).min(1).max(600).parse(amounts);
  const total = cents.positive().parse(amounts.reduce((n, x) => n + x, 0));
  if (original != null) cents.parse(original);
  return {
    total,
    original: original ?? null,
    difference: original != null ? total - original : null,
  };
}

/** Demo adapter. Production uses the transaction/authorization boundary in migration 013. */
export function applyRecurrenceCommand(
  state: State,
  command: { key: string; type: string; payload: Record<string, unknown> },
  user: { id: string; family_id: string },
): State | null {
  if (
    ![
      "recurrence_v2",
      "generate_v2",
      "recurrence_edit",
      "purchase_v2",
    ].includes(command.type)
  )
    return null;
  const n = structuredClone(state),
    p = command.payload;
  const rules = n.recurrences as RecurrenceRule[];
  const occurrences = n.obligations as RecurrenceOccurrence[];
  if (command.type === "recurrence_v2") {
    const rule: RecurrenceRule = {
      id: String(p.id),
      owner_id: user.id,
      description: z.string().trim().min(1).max(120).parse(p.description),
      amount: cents.positive().parse(p.amount),
      first_due: date.parse(p.date),
      house: !!p.house,
      variable: !!p.variable,
      active: true,
      interval_unit: z
        .enum(["months", "days"])
        .parse(p.interval_unit ?? "months"),
      interval_count: z
        .number()
        .int()
        .min(1)
        .max(366)
        .parse(p.interval_count ?? 1),
      anchor_index: 0,
      category: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .parse(p.category ?? "Outros"),
      version: 1,
    };
    if (rules.some((r) => r.id === rule.id))
      throw Error("Recorrência já cadastrada.");
    rules.push(rule);
    generate(n, rule, Number(p.count ?? 12), user.family_id);
  } else if (command.type === "purchase_v2") {
    const amounts = z.array(cents.positive()).min(1).max(600).parse(p.amounts);
    const summary = purchaseSummary(
      amounts,
      p.original_amount == null ? null : Number(p.original_amount),
    );
    const card = n.cards.find(
      (c) =>
        c.id === p.card_id &&
        (c.owner_id === user.id || c.authorized.includes(user.id)),
    );
    const consumer = String(p.consumer_id ?? user.id),
      responsible = String(p.responsible_id || consumer);
    if (
      !card ||
      (consumer !== user.id &&
        !(card.owner_id === user.id && card.authorized.includes(consumer)))
    )
      throw Error("Cartão ou consumidor não autorizado.");
    if (
      !n.profiles.some(
        (x) =>
          x.id === responsible && x.family_id === user.family_id && x.active,
      )
    )
      throw Error("Responsável não autorizado.");
    const occurred = date.parse(p.occurred_on),
      first = date.parse(p.first_due);
    if (occurred > today())
      throw Error("A compra não pode ser confirmada no futuro.");
    const entry = {
      ...p,
      id: String(p.id),
      owner_id: user.id,
      family_id: user.family_id,
      consumer_id: consumer,
      responsible_id: responsible,
      card_id: card.id,
      kind: "expense",
      amount: summary.total,
      occurred_on: occurred,
      category: String(p.category || "Outros"),
      description: z.string().trim().min(1).max(120).parse(p.description),
      house: !!p.house,
      splits: [],
      version: 1,
      voided: false,
      installment_amounts: amounts,
      interest_kind: z
        .enum(["none", "included", "unknown"])
        .parse(p.interest_kind),
      original_amount: summary.original,
    } as Entry;
    if (n.entries.some((e) => e.id === entry.id))
      throw Error("Compra já cadastrada.");
    n.entries.push(entry);
    const history = z
      .array(
        z.object({
          number: z.number().int().min(1).max(amounts.length),
          amount: cents,
          paid_on: date,
        }),
      )
      .max(amounts.length)
      .parse(p.history ?? []);
    if (new Set(history.map((h) => h.number)).size !== history.length)
      throw Error("Histórico duplicado.");
    amounts.forEach((amount, i) => {
      const known = history.find((h) => h.number === i + 1);
      if (known && (known.amount > amount || known.paid_on > today()))
        throw Error("Histórico inválido.");
      n.obligations.push({
        id: `${entry.id}:${i + 1}`,
        owner_id: card.owner_id,
        family_id: user.family_id,
        description: `${entry.description} · ${i + 1}/${amounts.length}`,
        amount,
        due_on: addMonths(first, i),
        house: entry.house,
        confirmed: known?.amount ?? 0,
        unknown: !known && addMonths(first, i) < today(),
        card_id: card.id,
        plan_id: null,
        number: i + 1,
        replaced_by: null,
        version: 1,
      });
    });
    if (responsible !== card.owner_id)
      n.settlements.push({
        id: entry.id,
        debtor_id: responsible,
        creditor_id: card.owner_id,
        description: entry.description,
        amount: summary.total,
        sent: 0,
        confirmed: 0,
        sent_on: null,
        version: 1,
      });
  } else {
    const r = rules.find((r) => r.id === p.id && r.owner_id === user.id);
    if (!r || (r.version ?? 1) !== p.version)
      throw Error("Recorrência alterada. Atualize os dados.");
    if (command.type === "generate_v2") {
      if (!r.active) throw Error("Recorrência inativa.");
      generate(n, r, Number(p.count), user.family_id);
    } else {
      if (String(p.reason ?? "").trim().length < 5)
        throw Error("Explique a alteração.");
      const occurrence = occurrences.find(
        (o) => o.id === p.occurrence_id && o.recurrence_id === r.id,
      );
      if (p.scope === "this") {
        if (
          !occurrence ||
          occurrence.version !== p.occurrence_version ||
          occurrence.cancelled_on ||
          occurrence.replaced_by
        )
          throw Error("Ocorrência alterada.");
        const paid = occurrence.amount - remaining(occurrence, n.payments);
        if (p.cancel) {
          if (paid) throw Error("Estorne os pagamentos antes de cancelar.");
          occurrence.cancelled_on = today();
        } else {
          const amount = cents.positive().parse(p.amount);
          if (amount < paid) throw Error("Valor menor que o já pago.");
          occurrence.amount = amount;
          occurrence.due_on = date.parse(p.date);
          occurrence.description = String(
            p.description || occurrence.description,
          );
          occurrence.unknown = !!p.variable;
          const e = n.entries.find(
            (e) =>
              (e as Entry & { obligation_id?: string }).obligation_id ===
                occurrence.id || e.id === occurrence.id,
          );
          if (e) {
            e.amount = amount;
            e.version++;
          }
        }
        occurrence.occurrence_override = true;
        occurrence.version++;
      } else if (p.scope === "next" || p.scope === "rule") {
        const anchor = z
          .number()
          .int()
          .min(0)
          .max(599)
          .parse(p.from_index ?? 0);
        const first = date.parse(p.date);
        if (first < today())
          throw Error(
            "A nova regra começa hoje ou no futuro; o histórico será preservado.",
          );
        r.first_due = first;
        r.anchor_index = anchor;
        r.description = z.string().trim().min(1).max(120).parse(p.description);
        r.amount = cents.positive().parse(p.amount);
        r.interval_unit = z
          .enum(["days", "months"])
          .parse(p.interval_unit ?? r.interval_unit ?? "months");
        r.interval_count = z
          .number()
          .int()
          .min(1)
          .max(366)
          .parse(p.interval_count ?? r.interval_count ?? 1);
        r.variable = !!p.variable;
        r.category = String(p.category || r.category || "Outros");
        r.active = !p.cancel;
        occurrences
          .filter(
            (o) =>
              o.recurrence_id === r.id &&
              (o.occurrence_index ?? Number(o.id.split(":").at(-1))) >=
                anchor &&
              o.due_on &&
              o.due_on >= today() &&
              !o.cancelled_on &&
              !o.replaced_by &&
              !o.confirmed &&
              (!o.occurrence_override || p.scope === "next") &&
              !n.payments.some(
                (pay) => pay.obligation_id === o.id && !pay.reversed_on,
              ),
          )
          .forEach((o) => {
            const index = o.occurrence_index ?? Number(o.id.split(":").at(-1));
            o.due_on = recurrenceDate(
              r.first_due,
              index - anchor,
              r.interval_unit,
              r.interval_count,
            );
            o.amount = r.amount;
            o.description = r.description;
            o.unknown = r.variable;
            o.recurrence_category = r.category;
            o.cancelled_on = r.active ? null : today();
            o.version++;
          });
      } else throw Error("Escolha o alcance da alteração.");
      r.version = (r.version ?? 1) + 1;
    }
  }
  return n;
}
