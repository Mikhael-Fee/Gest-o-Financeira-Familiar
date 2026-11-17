import {
  bankCredit,
  obligationFunding,
  openFunding,
  takeFunding,
  type FundingPart,
} from "../domain/funding";
import { today, type State } from "../domain/finance";
import type { Command, Identity } from "./store";
export function checkFundingCommand(s: State, c: Command, user: Identity) {
  const p = c.payload;
  if (c.type === "purchase_split")
    for (const part of p.parts as Record<string, unknown>[])
      checkFundingCommand(
        s,
        { key: c.key, type: "entry", payload: part },
        user,
      );
  if (c.type === "entry" || c.type === "purchase_v2") {
    const holder = s.cards.find((x) => x.id === p.card_id)?.owner_id;
    const responsible = p.responsible_id || p.consumer_id;
    if (responsible !== user.id && responsible !== holder)
      throw Error(
        "Somente você pode assumir uma dívida pessoal. O titular já responde pelo cartão.",
      );
  }
  if (c.type === "replace") {
    const sources = s.obligations.filter((o) =>
      (p.sources as string[]).includes(o.id),
    );
    if (
      new Set(sources.map((o) => o.house)).size > 1 ||
      new Set(sources.map((o) => o.card_id)).size > 1
    )
      throw Error(
        "Renegocie separadamente cartões e despesas pessoais ou da Casa.",
      );
    if (sources.some((o) => o.cancelled_on))
      throw Error("Obrigação cancelada.");
    if (
      p.quote &&
      sources.some((o) =>
        obligationFunding(s, o).some((f) =>
          s.settlements.some((x) => (x.entry_id ?? x.id) === f.entry_id),
        ),
      )
    ) {
      const total =
        sources
          .flatMap((o) => openFunding(s, o))
          .reduce((n, f) => n + f.amount, 0) + Number(p.fee);
      if (Number(p.quote) !== total)
        throw Error(
          "Desconto com reembolso vinculado exige conciliação dos participantes.",
        );
    }
  }
  if (c.type === "adjust_due") {
    const o = s.obligations.find((o) => o.id === p.id);
    if (o?.card_id && Number(p.amount) !== o.amount)
      throw Error(
        "Corrija a compra e concilie o reembolso antes de alterar o valor da fatura.",
      );
  }
}
export function attachFundingChanges(before: State, next: State, c: Command) {
  for (const o of next.obligations.filter(
    (o) => !before.obligations.some((b) => b.id === o.id) && o.card_id,
  ))
    o.funding_parts = obligationFunding(next, o);
  for (const x of next.settlements.filter(
    (x) => !before.settlements.some((b) => b.id === x.id),
  ))
    x.entry_id = next.entries.find((e) => e.id === x.id)?.id ?? null;
  if (c.type === "replace") {
    const p = c.payload,
      sources = before.obligations
        .filter((o) => (p.sources as string[]).includes(o.id))
        .sort((a, b) => a.id.localeCompare(b.id)),
      first = sources[0];
    let pool: FundingPart[] = sources.flatMap((o) => openFunding(before, o));
    const fee = next.entries.find((e) => e.id === p.id);
    if (fee) {
      fee.house = first.house;
      fee.card_id = first.card_id;
      if (first.card_id) pool.push({ entry_id: fee.id, amount: fee.amount });
    }
    const merged = new Map<string, number>();
    for (const part of pool)
      merged.set(part.entry_id, (merged.get(part.entry_id) ?? 0) + part.amount);
    pool = [...merged].map(([entry_id, amount]) => ({ entry_id, amount }));
    for (const o of next.obligations
      .filter((o) => o.id.startsWith(p.id + ":"))
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))) {
      o.house = first.house;
      o.card_id = first.card_id;
      o.funding_parts = takeFunding(pool, o.amount);
      let consumed = o.amount;
      pool = pool
        .map((f) => {
          const v = Math.min(consumed, f.amount);
          consumed -= v;
          return { ...f, amount: f.amount - v };
        })
        .filter((f) => f.amount > 0);
    }
    for (const o of next.obligations.filter((o) =>
      (p.sources as string[]).includes(o.id),
    ))
      o.replaced_on = String(p.occurred_on ?? today());
  }
  for (const p of next.payments.filter(
    (p) => !before.payments.some((b) => b.id === p.id),
  )) {
    const o = before.obligations.find((o) => o.id === p.obligation_id);
    if (o) p.funding_parts = takeFunding(openFunding(before, o), p.amount);
  }
  for (const x of next.settlements) {
    const credit = bankCredit(next, x);
    if (credit + x.confirmed + x.sent > x.amount)
      throw Error(
        "Valor já financiado ou enviado. Concilie o acerto antes de pagar por outra pessoa.",
      );
    if (credit !== (x.bank_credit ?? 0)) x.version++;
    x.bank_credit = credit;
  }
  return next;
}
