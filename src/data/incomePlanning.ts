import {
  balance,
  cents,
  date,
  today,
  type State,
  type Entry,
} from "../domain/finance";
import {
  validateFutureReceipt,
  type FutureReceipt,
  type IncomePlanningState,
} from "../domain/availability";

type PlanningCommand = {
  type: string;
  key: string;
  payload: Record<string, unknown>;
};
type User = { id: string; family_id: string };
/** Called before ordinary demo commands. Remote commands are implemented transactionally in migration 014. */
export function applyIncomePlanning(
  state: State,
  command: PlanningCommand,
  user: User,
  applyEntry: (state: State, entry: Entry, key: string) => State,
): State | null {
  const n = structuredClone(state) as IncomePlanningState,
    p = command.payload;
  n.future_receipts ??= [];
  n.account_checks ??= [];
  n.obligation_reservations ??= [];
  if (command.type === "future_receipt") {
    const old = n.future_receipts.find((r) => r.id === p.id);
    if (
      (old?.version ?? 0) !== p.version ||
      (old && (old.owner_id !== user.id || old.status !== "planned"))
    )
      throw Error("Previsão alterada ou não autorizada.");
    const next: FutureReceipt = {
      id: String(p.id),
      owner_id: user.id,
      description: String(p.description).trim(),
      amount: cents.positive().parse(p.amount),
      expected_on: date.parse(p.expected_on),
      month: String(p.month),
      kind: p.kind as FutureReceipt["kind"],
      certainty: p.certainty as FutureReceipt["certainty"],
      status: "planned",
      account_id: p.account_id ? String(p.account_id) : null,
      entry_id: null,
      version: (old?.version ?? 0) + 1,
    };
    validateFutureReceipt(next);
    if (next.account_id) {
      const a = n.accounts.find(
        (a) => a.id === next.account_id && a.owner_id === user.id,
      );
      if (
        !a ||
        (next.kind === "benefit"
          ? !["VA", "VR"].includes(a.kind)
          : !["bank", "cash"].includes(a.kind))
      )
        throw Error("Conta incompatível com o recebimento.");
    }
    if (old) Object.assign(old, next);
    else n.future_receipts.push(next);
  } else if (
    ["confirm_future_receipt", "cancel_future_receipt"].includes(command.type)
  ) {
    const f = n.future_receipts.find(
      (r) => r.id === p.id && r.owner_id === user.id,
    );
    if (!f || f.version !== p.version || f.status !== "planned")
      throw Error("Previsão alterada ou não autorizada.");
    if (command.type === "cancel_future_receipt") {
      f.status = "cancelled";
      f.version++;
    } else {
      const on = date.parse(p.date);
      if (on > today()) throw Error("Confirme somente valores já recebidos.");
      const a = n.accounts.find(
        (a) => a.id === p.account_id && a.owner_id === user.id,
      );
      if (
        !a ||
        (f.kind === "benefit"
          ? !["VA", "VR"].includes(a.kind)
          : !["bank", "cash"].includes(a.kind))
      )
        throw Error("Conta incompatível com o recebimento.");
      const amount = cents.positive().parse(p.amount ?? f.amount);
      const entry: Entry = {
        id: command.key,
        owner_id: user.id,
        family_id: user.family_id,
        description: f.description,
        kind: f.kind === "benefit" ? "benefit" : "income",
        amount,
        occurred_on: on,
        category:
          f.kind === "benefit"
            ? "Alimentação"
            : f.kind === "salary"
              ? "Salário"
              : "Extras",
        income_type: f.kind === "salary" ? "salary" : "extra",
        salary_month: f.month,
        house: false,
        consumer_id: user.id,
        responsible_id: null,
        card_id: null,
        splits: [{ account_id: a.id, amount }],
        version: 1,
        voided: false,
      };
      f.status = "received";
      f.entry_id = command.key;
      f.account_id = a.id;
      f.version++;
      return applyEntry(n, entry, command.key);
    }
  } else if (command.type === "account_check") {
    const a = n.accounts.find(
      (a) => a.id === p.account_id && a.owner_id === user.id,
    );
    const on = date.parse(p.date);
    if (!a || on !== today() || on < a.cutoff)
      throw Error("Confira o saldo atual de sua conta.");
    const old = n.account_checks.find((c) => c.account_id === a.id);
    if ((old?.version ?? 0) !== p.version) throw Error("Conferência alterada.");
    if (balance(a, n) !== p.confirmed_balance)
      throw Error("Faça a conciliação antes de confirmar um saldo diferente.");
    const check = {
      account_id: a.id,
      owner_id: user.id,
      checked_on: on,
      confirmed_balance: Number(p.confirmed_balance),
      version: (old?.version ?? 0) + 1,
    };
    if (old) Object.assign(old, check);
    else n.account_checks.push(check);
  } else if (command.type === "reserve_obligation") {
    const ob = n.obligations.find(
      (o) =>
        o.id === p.obligation_id && o.owner_id === user.id && !o.replaced_by,
    );
    const a = n.accounts.find(
      (a) =>
        a.id === p.account_id &&
        a.owner_id === user.id &&
        ["bank", "cash"].includes(a.kind),
    );
    if (!ob || !a) throw Error("Obrigação ou conta não autorizada.");
    const old = n.obligation_reservations.find(
      (r) => r.obligation_id === ob.id,
    );
    if ((old?.version ?? 0) !== p.version) throw Error("Reserva alterada.");
    const amount = cents.parse(p.amount),
      left =
        ob.amount -
        ob.confirmed -
        n.payments
          .filter((x) => x.obligation_id === ob.id && !x.reversed_on)
          .reduce((n, x) => n + x.amount, 0);
    if (amount > left || amount > Math.max(0, balance(a, n)))
      throw Error("Reserva maior que a obrigação ou o saldo registrado.");
    const next = {
      obligation_id: ob.id,
      account_id: a.id,
      owner_id: user.id,
      amount,
      version: (old?.version ?? 0) + 1,
    };
    if (old) Object.assign(old, next);
    else n.obligation_reservations.push(next);
  } else return null;
  return n;
}
