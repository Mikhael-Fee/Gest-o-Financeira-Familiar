import {
  remaining,
  today,
  type Obligation,
  type Payment,
  type Settlement,
  type State,
} from "./finance";
export type FundingPart = { entry_id: string; amount: number };
export type HouseFunding = {
  entry_id: string | null;
  member_id: string;
  creditor_id: string | null;
  amount: number;
  occurred_on: string;
  kind: "direct" | "payment" | "advance" | "reimbursement";
};
/** Ordered cent allocation. Every cent belongs to exactly one original purchase. */
export function takeFunding(
  parts: FundingPart[],
  amount: number,
): FundingPart[] {
  const result: FundingPart[] = [];
  for (const p of parts) {
    const v = Math.min(amount, p.amount);
    if (v > 0) result.push({ entry_id: p.entry_id, amount: v });
    amount -= v;
    if (!amount) break;
  }
  return result;
}
export function obligationFunding(s: State, o: Obligation): FundingPart[] {
  if (o.funding_parts) return o.funding_parts;
  const entry = s.entries.find((e) => e.card_id && o.id.startsWith(e.id + ":"));
  return entry ? [{ entry_id: entry.id, amount: o.amount }] : [];
}
export function paymentFunding(s: State, p: Payment): FundingPart[] {
  if (p.funding_parts) return p.funding_parts;
  const o = s.obligations.find((o) => o.id === p.obligation_id);
  return o ? takeFunding(obligationFunding(s, o), p.amount) : [];
}
export function openFunding(s: State, o: Obligation): FundingPart[] {
  const parts = obligationFunding(s, o).map((p) => ({ ...p }));
  for (const pay of s.payments.filter(
    (p) => p.obligation_id === o.id && !p.reversed_on,
  ))
    for (const funded of paymentFunding(s, pay)) {
      let rest = funded.amount;
      for (const part of parts.filter((p) => p.entry_id === funded.entry_id)) {
        const v = Math.min(rest, part.amount);
        part.amount -= v;
        rest -= v;
      }
    }
  // Historical opening payments have no identified financing account.
  return takeFunding(
    parts.filter((p) => p.amount > 0),
    remaining(o, s.payments),
  );
}
export function bankCredit(s: State, settlement: Settlement, asOf?: string) {
  return s.payments
    .filter(
      (p) =>
        p.payer_id !== settlement.creditor_id &&
        (!asOf || p.paid_on <= asOf) &&
        (!p.reversed_on || (!!asOf && p.reversed_on > asOf)),
    )
    .reduce(
      (n, p) =>
        n +
        paymentFunding(s, p)
          .filter((f) => f.entry_id === (settlement.entry_id ?? settlement.id))
          .reduce((v, f) => v + f.amount, 0),
      0,
    );
}
export function settlementPending(s: State, x: Settlement, asOf?: string) {
  let confirmed = x.confirmed;
  if (asOf) {
    const transfers = s.settlement_transfers.filter(
      (t) => t.settlement_id === x.id && t.confirmed_on,
    );
    const allocations = (s.advance_allocations ?? []).filter(
      (a) => a.settlement_id === x.id,
    );
    const currentEvidence =
      transfers
        .filter((t) => !t.reversed_on)
        .reduce((n, t) => n + t.amount, 0) +
      allocations
        .filter((a) => !a.reversed_on)
        .reduce((n, a) => n + a.amount, 0);
    confirmed =
      Math.max(0, x.confirmed - currentEvidence) +
      transfers
        .filter(
          (t) =>
            t.confirmed_on! <= asOf && (!t.reversed_on || t.reversed_on > asOf),
        )
        .reduce((n, t) => n + t.amount, 0) +
      allocations
        .filter(
          (a) =>
            a.allocated_on <= asOf && (!a.reversed_on || a.reversed_on > asOf),
        )
        .reduce((n, a) => n + a.amount, 0);
  }
  return Math.max(0, x.amount - confirmed - bankCredit(s, x, asOf));
}
export function houseFunding(s: State): HouseFunding[] {
  if (s.house_funding) return s.house_funding;
  const events: HouseFunding[] = [];
  for (const e of s.entries.filter(
    (e) => e.house && !e.voided && e.kind === "expense" && !e.card_id,
  )) {
    const amount = e.splits.reduce((n, p) => n + p.amount, 0);
    if (amount)
      events.push({
        entry_id: e.id,
        member_id: e.owner_id,
        creditor_id: null,
        amount,
        occurred_on: e.occurred_on,
        kind: "direct",
      });
  }
  for (const p of s.payments) {
    const o = s.obligations.find((o) => o.id === p.obligation_id);
    if (!o) continue;
    const parts = paymentFunding(s, p);
    const shares: HouseFunding[] = parts.flatMap((f) => {
      const e = s.entries.find(
        (e) => e.id === f.entry_id && e.house && !e.voided,
      );
      if (!e) return [];
      const x = s.settlements.find((x) => (x.entry_id ?? x.id) === e.id);
      return [
        {
          entry_id: e.id,
          member_id: p.payer_id,
          creditor_id: x?.creditor_id ?? null,
          amount: f.amount,
          occurred_on: p.paid_on,
          kind: x?.creditor_id === p.payer_id ? "advance" : "payment",
        },
      ];
    });
    if (!parts.length && o.house && !o.card_id)
      shares.push({
        entry_id: null,
        member_id: p.payer_id,
        creditor_id: null,
        amount: p.amount,
        occurred_on: p.paid_on,
        kind: "payment",
      });
    events.push(...shares);
    if (p.reversed_on)
      events.push(
        ...shares.map((f) => ({
          ...f,
          amount: -f.amount,
          occurred_on: p.reversed_on!,
        })),
      );
  }
  for (const x of s.settlements) {
    const e = s.entries.find(
      (e) => e.id === (x.entry_id ?? x.id) && e.house && !e.voided,
    );
    if (!e) continue;
    for (const t of s.settlement_transfers.filter(
      (t) => t.settlement_id === x.id && t.confirmed_on,
    )) {
      const event: HouseFunding = {
        entry_id: e.id,
        member_id: x.debtor_id,
        creditor_id: x.creditor_id,
        amount: t.amount,
        occurred_on: t.confirmed_on!,
        kind: "reimbursement",
      };
      events.push(event);
      if (t.reversed_on)
        events.push({
          ...event,
          amount: -event.amount,
          occurred_on: t.reversed_on,
        });
    }
    for (const a of (s.advance_allocations ?? []).filter(
      (a) => a.settlement_id === x.id,
    )) {
      const event: HouseFunding = {
        entry_id: e.id,
        member_id: x.debtor_id,
        creditor_id: x.creditor_id,
        amount: a.amount,
        occurred_on: a.allocated_on,
        kind: "reimbursement",
      };
      events.push(event);
      if (a.reversed_on)
        events.push({
          ...event,
          amount: -event.amount,
          occurred_on: a.reversed_on,
        });
    }
  }
  return events;
}
export function refundableAdvance(s: State, owner: string, asOf = today()) {
  const byEntry = new Map<string, number>();
  for (const e of houseFunding(s).filter(
    (e) => e.occurred_on <= asOf && e.creditor_id === owner,
  )) {
    const delta =
      e.kind === "advance"
        ? e.amount
        : e.kind === "reimbursement"
          ? -e.amount
          : 0;
    if (e.entry_id)
      byEntry.set(e.entry_id, (byEntry.get(e.entry_id) ?? 0) + delta);
  }
  return [...byEntry.values()].reduce((n, v) => n + Math.max(0, v), 0);
}
