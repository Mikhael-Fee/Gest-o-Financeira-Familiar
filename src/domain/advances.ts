import { balance, cents, date, today, type State } from "./finance";
export type FamilyAdvance = {
  id: string;
  sender_id: string;
  recipient_id: string;
  source_id: string;
  destination_id: string | null;
  amount: number;
  sent_on: string;
  confirmed_on: string | null;
  rejected_on: string | null;
  reversed_on: string | null;
  description: string;
  version: number;
};
export type AdvanceAllocation = {
  id: string;
  advance_id: string;
  settlement_id: string;
  amount: number;
  allocated_on: string;
  reversed_on: string | null;
  actor_id: string;
};
export type AdvanceState = State & {
  family_advances?: FamilyAdvance[];
  advance_allocations?: AdvanceAllocation[];
};
export function availableAdvance(state: AdvanceState, advance: FamilyAdvance) {
  if (!advance.confirmed_on || advance.reversed_on) return 0;
  return (
    advance.amount -
    (state.advance_allocations ?? [])
      .filter((a) => a.advance_id === advance.id && !a.reversed_on)
      .reduce((n, a) => n + a.amount, 0)
  );
}
export function applyAdvanceCommand(
  state: State,
  command: { key: string; type: string; payload: Record<string, unknown> },
  user: { id: string; family_id: string },
): State | null {
  if (
    ![
      "send_advance",
      "confirm_advance",
      "reject_advance",
      "allocate_advance",
      "reverse_advance",
      "reverse_advance_allocation",
    ].includes(command.type)
  )
    return null;
  const n = structuredClone(state) as AdvanceState,
    p = command.payload,
    action = command.type;
  n.family_advances ??= [];
  n.advance_allocations ??= [];
  const effective = date.parse(p.date);
  if (effective > today()) throw Error("Data efetiva no futuro.");
  const sourceAccount = (id: unknown, owner: string) =>
    n.accounts.find(
      (a) =>
        a.id === id &&
        a.owner_id === owner &&
        ["bank", "cash"].includes(a.kind),
    );
  const move = (
    owner: string,
    account: string,
    amount: number,
    reference: string,
    on: string,
    kind = "settlement",
  ) =>
    n.account_movements.push({
      id: crypto.randomUUID(),
      owner_id: owner,
      account_id: account,
      amount,
      occurred_on: on,
      kind,
      reference_id: reference,
      reason: String(p.reason ?? ""),
    });
  if (action === "send_advance") {
    const acct = sourceAccount(p.account_id, user.id),
      amount = cents.positive().parse(p.amount);
    if (
      !acct ||
      effective < acct.cutoff ||
      balance(acct, n) < amount ||
      !n.profiles.some(
        (x) =>
          x.id === p.recipient_id &&
          x.id !== user.id &&
          x.family_id === user.family_id &&
          x.active,
      )
    )
      throw Error("Conta, saldo ou destinatário inválido.");
    if (
      !String(p.description ?? "").trim() ||
      String(p.description).length > 120
    )
      throw Error("Descreva o adiantamento.");
    n.family_advances.push({
      id: String(p.id),
      sender_id: user.id,
      recipient_id: String(p.recipient_id),
      source_id: acct.id,
      destination_id: null,
      amount,
      sent_on: effective,
      confirmed_on: null,
      rejected_on: null,
      reversed_on: null,
      description: String(p.description),
      version: 1,
    });
    return n;
  }
  if (action === "reverse_advance_allocation") {
    const allocation = n.advance_allocations.find(
      (a) => a.id === p.id && !a.reversed_on,
    );
    const advance = n.family_advances.find(
      (a) =>
        a.id === allocation?.advance_id &&
        (a.sender_id === user.id || a.recipient_id === user.id),
    );
    const settlement = n.settlements.find(
      (s) => s.id === allocation?.settlement_id,
    );
    if (
      !allocation ||
      !advance ||
      !settlement ||
      advance.version !== p.version ||
      effective < allocation.allocated_on ||
      String(p.reason ?? "").trim().length < 5 ||
      settlement.confirmed < allocation.amount
    )
      throw Error("Alocação alterada ou não autorizada.");
    allocation.reversed_on = effective;
    settlement.confirmed -= allocation.amount;
    settlement.version++;
    advance.version++;
    return n;
  }
  const a = n.family_advances.find(
    (a) =>
      a.id === p.id && (a.sender_id === user.id || a.recipient_id === user.id),
  );
  if (!a || a.version !== p.version)
    throw Error("Adiantamento alterado. Atualize os dados.");
  if (action === "confirm_advance") {
    const source = sourceAccount(a.source_id, a.sender_id),
      dest = sourceAccount(p.account_id, user.id);
    if (
      a.recipient_id !== user.id ||
      a.confirmed_on ||
      a.rejected_on ||
      effective < a.sent_on ||
      !source ||
      !dest ||
      effective < dest.cutoff ||
      balance(source, n) < a.amount
    )
      throw Error("Confirmação não autorizada ou saldo insuficiente.");
    move(a.sender_id, a.source_id, -a.amount, a.id, a.sent_on);
    move(user.id, dest.id, a.amount, a.id, effective);
    a.confirmed_on = effective;
    a.destination_id = dest.id;
  } else if (action === "reject_advance") {
    if (
      a.recipient_id !== user.id ||
      a.confirmed_on ||
      a.rejected_on ||
      effective < a.sent_on ||
      String(p.reason ?? "").trim().length < 5
    )
      throw Error("Rejeição inválida.");
    a.rejected_on = effective;
  } else if (action === "allocate_advance") {
    const s = n.settlements.find(
      (s) =>
        s.id === p.settlement_id &&
        s.debtor_id === a.sender_id &&
        s.creditor_id === a.recipient_id,
    );
    const amount = cents.positive().parse(p.amount);
    if (
      a.sender_id !== user.id ||
      !a.confirmed_on ||
      a.reversed_on ||
      effective < a.confirmed_on ||
      !s ||
      s.version !== p.settlement_version ||
      amount > availableAdvance(n, a) ||
      amount > s.amount - s.confirmed - s.sent - (s.bank_credit ?? 0)
    )
      throw Error("Crédito ou acerto indisponível.");
    n.advance_allocations.push({
      id: command.key,
      advance_id: a.id,
      settlement_id: s.id,
      amount,
      allocated_on: effective,
      reversed_on: null,
      actor_id: user.id,
    });
    s.confirmed += amount;
    s.version++;
  } else {
    const dest = sourceAccount(a.destination_id, a.recipient_id);
    if (
      a.recipient_id !== user.id ||
      !a.confirmed_on ||
      a.reversed_on ||
      effective < a.confirmed_on ||
      String(p.reason ?? "").trim().length < 5 ||
      n.advance_allocations.some(
        (x) => x.advance_id === a.id && !x.reversed_on,
      ) ||
      !dest ||
      balance(dest, n) < a.amount
    )
      throw Error("Desfaça as alocações antes de estornar o adiantamento.");
    move(
      a.sender_id,
      a.source_id,
      a.amount,
      command.key,
      effective,
      "reversal",
    );
    move(
      a.recipient_id,
      a.destination_id!,
      -a.amount,
      command.key,
      effective,
      "reversal",
    );
    a.reversed_on = effective;
  }
  a.version++;
  return n;
}
