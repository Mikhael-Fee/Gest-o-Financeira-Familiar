import {
  addMonths,
  cents,
  date,
  remaining,
  type Card,
  type State,
} from "./finance";
import type { Command, Identity } from "../data/store";
export type CardCycle = {
  card_id: string;
  month: string;
  closing_on: string;
  due_on: string;
  version: number;
};
/** Cycle months are advanced independently so one bank exception does not change later due days. */
export function cardDueAt(
  card: Card,
  state: State,
  purchase: string,
  index = 0,
) {
  date.parse(purchase);
  let cycle = purchase.slice(0, 7) + "-01";
  const day = (month: string, number: number) => {
    const [y, m] = month.split("-").map(Number);
    return (
      month.slice(0, 7) +
      "-" +
      String(
        Math.min(number, new Date(Date.UTC(y, m, 0)).getUTCDate()),
      ).padStart(2, "0")
    );
  };
  const exception = (month: string) =>
    state.card_cycles?.find(
      (c) => c.card_id === card.id && c.month === month.slice(0, 7),
    );
  if (purchase > (exception(cycle)?.closing_on ?? day(cycle, card.closing)))
    cycle = addMonths(cycle, 1);
  cycle = addMonths(cycle, index);
  const override = exception(cycle);
  if (override) return override.due_on;
  if (card.due <= card.closing) cycle = addMonths(cycle, 1);
  return day(cycle, card.due);
}
export function cardLimit(card: Card, state: State) {
  const committed = state.obligations
    .filter((o) => o.card_id === card.id)
    .reduce((sum, o) => sum + remaining(o, state.payments), 0);
  return {
    committed,
    available: card.credit_limit == null ? null : card.credit_limit - committed,
  };
}
export function applyCardSettings(
  state: State,
  command: Command,
  user: Identity,
): State | null {
  if (!["card_settings", "card_cycle", "card_reassign"].includes(command.type))
    return null;
  const n = structuredClone(state),
    p = command.payload;
  const card = n.cards.find(
    (c) => c.id === p.card_id && c.owner_id === user.id,
  );
  if (!card) throw Error("Somente o titular pode ajustar o cartão.");
  if (!String(p.reason ?? "").trim())
    throw Error("Informe o motivo do ajuste.");
  if (command.type === "card_settings") {
    if ((card.version ?? 1) !== p.version)
      throw Error("Cartão alterado. Atualize.");
    const closing = Number(p.closing),
      due = Number(p.due);
    if (![closing, due].every((v) => Number.isInteger(v) && v >= 1 && v <= 31))
      throw Error("Dia inválido.");
    card.closing = closing;
    card.due = due;
    card.credit_limit =
      p.credit_limit == null ? null : cents.parse(p.credit_limit);
    card.version = (card.version ?? 1) + 1;
  } else if (command.type === "card_cycle") {
    const month = String(p.month),
      closing = date.parse(p.closing_on),
      due = date.parse(p.due_on);
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
      !closing.startsWith(month) ||
      due < closing
    )
      throw Error("Calendário inválido.");
    const cycles = (n.card_cycles ??= []),
      old = cycles.find((c) => c.card_id === card.id && c.month === month);
    if ((old?.version ?? 0) !== p.version)
      throw Error("Ciclo alterado. Atualize.");
    const row = {
      card_id: card.id,
      month,
      closing_on: closing,
      due_on: due,
      version: (old?.version ?? 0) + 1,
    };
    if (old) Object.assign(old, row);
    else cycles.push(row);
  } else {
    const o = n.obligations.find((o) => o.id === p.id && o.card_id === card.id);
    if (!o || o.version !== p.version || o.replaced_by)
      throw Error("Parcela alterada. Atualize.");
    o.due_on = date.parse(p.due_on);
    o.version++;
  }
  return n;
}
