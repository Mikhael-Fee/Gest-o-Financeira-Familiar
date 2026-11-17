import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { apply, type Identity, type Command } from "../src/data/store";
import {
  balance,
  contribution,
  emptyState,
  totals,
  type State,
} from "../src/domain/finance";
import { availableMoney } from "../src/domain/availability";
import { budgetSpent } from "../src/domain/personal";
import { consumptionReport } from "../src/domain/reports";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-31T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());
const A: Identity = { id: "a", family_id: "f", name: "Fictícia A" },
  B: Identity = { id: "b", family_id: "f", name: "Fictícia B" };
function fixture() {
  const s = emptyState();
  s.profiles = [
    { ...A, role: "admin", active: true },
    { ...B, role: "member", active: true },
    {
      id: "c",
      family_id: "f",
      name: "Fictícia C",
      role: "member",
      active: true,
    },
  ];
  s.accounts = [
    {
      id: "bank-a",
      owner_id: "a",
      name: "Banco A",
      kind: "bank",
      opening: 200000,
      cutoff: "2026-01-01",
    },
    {
      id: "bank-b",
      owner_id: "b",
      name: "Banco B",
      kind: "bank",
      opening: 200000,
      cutoff: "2026-01-01",
    },
    {
      id: "va-a",
      owner_id: "a",
      name: "VA A",
      kind: "VA",
      opening: 50000,
      cutoff: "2026-01-01",
    },
  ];
  s.cards = [
    {
      id: "card",
      owner_id: "a",
      name: "Itaú",
      closing: 5,
      due: 15,
      authorized: ["b"],
    },
  ];
  return s;
}
function command(
  s: State,
  u: Identity,
  type: Command["type"],
  payload: Record<string, unknown>,
) {
  return apply(s, { key: crypto.randomUUID(), type, payload }, u);
}
function purchase(house = true) {
  return command(fixture(), B, "entry", {
    id: "purchase",
    description: "Supermercado fictício",
    kind: "expense",
    amount: 50000,
    occurred_on: "2026-11-03",
    category: "Alimentação",
    house,
    consumer_id: "b",
    responsible_id: "b",
    card_id: "card",
    splits: [],
    installments: 1,
  });
}
function send(s: State, amount: number) {
  return command(s, B, "send", {
    id: "purchase",
    amount,
    account_id: "bank-b",
    sent_on: "2026-11-04",
  });
}
function confirm(s: State, on = "2026-11-05") {
  return command(s, A, "confirm", {
    id: "purchase",
    version: s.settlements[0].version,
    account_id: "bank-a",
    date: on,
  });
}
function pay(s: State, amount = 50000, u = A) {
  return command(s, u, "pay", {
    obligation_id: "purchase:1",
    version: s.obligations[0].version,
    amount,
    account_id: u.id === "a" ? "bank-a" : "bank-b",
    paid_on: "2026-11-06",
  });
}

describe("auditoria: financiador econômico, caixa e contribuição", () => {
  it("reembolso total atribui R$500 a B e zero ao titular que só pagou o banco", () => {
    const s = pay(confirm(send(purchase(), 50000)));
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(contribution(s, "a", "2026-11").actual).toBe(0);
    expect(totals(s, "2026-11", undefined, true).consumption).toBe(50000);
    expect(balance(s.accounts[0], s)).toBe(200000);
    expect(balance(s.accounts[1], s)).toBe(150000);
    expect(totals(s, "2026-11", "a").income).toBe(0);
  });
  it("Pix declarado não dá contribuição nem reduz o acerto", () => {
    const s = send(purchase(), 30000);
    expect(contribution(s, "b", "2026-11").actual).toBe(0);
    expect(availableMoney(s, "b", "2026-12-31").pendingSettlements).toBe(50000);
    expect(balance(s.accounts[1], s)).toBe(200000);
  });
  it("Pix confirmado antes do banco já identifica o dinheiro fornecido por B", () => {
    const s = confirm(send(purchase(), 50000));
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(s.payments).toHaveLength(0);
    expect(availableMoney(s, "a", "2026-12-31").obligations).toBe(50000);
  });
  it("banco quitado e reembolso parcial preservam R$200 adiantados, sem contribuição fictícia", () => {
    const s = pay(confirm(send(purchase(), 30000)));
    expect(contribution(s, "b", "2026-11").actual).toBe(30000);
    expect(contribution(s, "a", "2026-11")).toMatchObject({
      actual: 0,
      reimbursableAdvance: 20000,
    });
    expect(availableMoney(s, "b", "2026-12-31").pendingSettlements).toBe(20000);
    expect(availableMoney(s, "a", "2026-12-31")).toMatchObject({
      receivables: 20000,
      free: 180000,
    });
  });
  it("banco pago primeiro não transforma adiantamento reembolsável em contribuição", () => {
    let s = pay(purchase());
    expect(contribution(s, "a", "2026-11")).toMatchObject({
      actual: 0,
      reimbursableAdvance: 50000,
    });
    s = confirm(send(s, 30000));
    expect(contribution(s, "b", "2026-11").actual).toBe(30000);
    s = confirm(send(s, 20000));
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(contribution(s, "a", "2026-11")).toMatchObject({
      actual: 0,
      reimbursableAdvance: 0,
    });
    expect(s.entries).toHaveLength(1);
  });
  it("pagamento parcial da fatura não inventa contribuição do titular", () => {
    const s = pay(purchase(), 20000);
    expect(contribution(s, "a", "2026-11")).toMatchObject({
      actual: 0,
      reimbursableAdvance: 20000,
    });
    expect(availableMoney(s, "a", "2026-12-31")).toMatchObject({
      bank: 180000,
      obligations: 30000,
      free: 150000,
    });
  });
  it("estorno de Pix preserva competência de confirmação e registra correção no mês do retorno", () => {
    let s = pay(confirm(send(purchase(), 50000)));
    s = command(s, A, "reverse_settlement", {
      id: "purchase",
      transfer_id: s.settlement_transfers[0].id,
      version: s.settlements[0].version,
      date: "2026-12-01",
      reason: "Pix devolvido e conferido",
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(contribution(s, "b", "2026-12").actual).toBe(-50000);
    expect(contribution(s, "a", "2026-12").actual).toBe(0);
    expect(availableMoney(s, "b", "2026-12-31").pendingSettlements).toBe(50000);
  });
  it("B pagando diretamente ao banco não fica devendo de novo a mesma parcela", () => {
    const s = pay(purchase(), 50000, B);
    expect(availableMoney(s, "b", "2026-12-31")).toMatchObject({
      bank: 150000,
      pendingSettlements: 0,
      free: 150000,
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(contribution(s, "a", "2026-11").actual).toBe(0);
  });
  it("compra pessoal no cartão compartilhado nunca vira contribuição da Casa", () => {
    const s = pay(confirm(send(purchase(false), 50000)));
    expect(contribution(s, "a", "2026-11").actual).toBe(0);
    expect(contribution(s, "b", "2026-11").actual).toBe(0);
  });
  it("responsável de terceiro sem autorização é recusado", () => {
    expect(() =>
      command(fixture(), B, "entry", {
        id: "abusive",
        description: "Não autorizado",
        kind: "expense",
        amount: 50000,
        occurred_on: "2026-11-03",
        category: "Outros",
        house: true,
        consumer_id: "b",
        responsible_id: "c",
        card_id: "card",
        splits: [],
        installments: 1,
      }),
    ).toThrow();
  });
});

describe("auditoria: matemática do disponível e base do orçamento", () => {
  it("R$2.000 - R$800 - R$300 - R$200 = R$700, sem usar promessa de terceiros", () => {
    const s = fixture();
    s.obligations = [
      {
        id: "bill",
        owner_id: "a",
        family_id: "f",
        description: "Conta",
        amount: 80000,
        due_on: "2026-12-20",
        house: false,
        confirmed: 0,
        unknown: false,
        plan_id: null,
        number: null,
        card_id: null,
        replaced_by: null,
        version: 1,
      },
    ];
    s.savings_goals = [
      {
        id: "reserve",
        owner_id: "a",
        name: "Reserva",
        kind: "emergency",
        target: 100000,
        initial: 30000,
        account_id: "bank-a",
        due_on: null,
        created_on: "2026-01-01",
        active: true,
        version: 1,
      },
    ];
    s.settlements = [
      {
        id: "payable",
        debtor_id: "a",
        creditor_id: "b",
        description: "A pagar",
        amount: 20000,
        confirmed: 0,
        sent: 0,
        sent_on: null,
        version: 1,
      },
      {
        id: "receivable",
        debtor_id: "b",
        creditor_id: "a",
        description: "Prometido",
        amount: 50000,
        confirmed: 0,
        sent: 0,
        sent_on: null,
        version: 1,
      },
    ];
    expect(availableMoney(s, "a", "2026-12-31")).toMatchObject({
      free: 70000,
      receivables: 50000,
    });
  });
  it("parcela parcialmente paga desconta só saldo aberto, sem repetir saída já debitada", () => {
    let s = fixture();
    s.obligations = [
      {
        id: "bill",
        owner_id: "a",
        family_id: "f",
        description: "Conta",
        amount: 80000,
        due_on: "2026-12-20",
        house: false,
        confirmed: 0,
        unknown: false,
        plan_id: null,
        number: null,
        card_id: null,
        replaced_by: null,
        version: 1,
      },
    ];
    s = command(s, A, "pay", {
      obligation_id: "bill",
      version: 1,
      amount: 30000,
      account_id: "bank-a",
      paid_on: "2026-11-05",
    });
    expect(availableMoney(s, "a", "2026-12-31")).toMatchObject({
      bank: 170000,
      obligations: 50000,
      free: 120000,
    });
  });
  it("R$150 pessoais + R$400 Casa = R$550 atribuídos; orçamento estrito R$150", () => {
    let s = fixture();
    for (const [id, amount, house, account] of [
      ["personal", 15000, false, "bank-a"],
      ["house", 40000, true, "va-a"],
    ] as const)
      s = command(s, A, "entry", {
        id,
        description: "Alimentação fictícia",
        kind: "expense",
        amount,
        occurred_on: "2026-11-07",
        category: "Alimentação",
        house,
        consumer_id: "a",
        responsible_id: "a",
        card_id: null,
        splits: [{ account_id: account, amount }],
      });
    expect(totals(s, "2026-11", "a").consumption).toBe(55000);
    expect(budgetSpent(s, "a", "2026-11", "Alimentação")).toBe(15000);
    expect(contribution(s, "a", "2026-11").actual).toBe(40000);
    expect(consumptionReport(s, "a", "personal", "2026-11", 6).total).toBe(
      55000,
    );
  });
});

describe("auditoria: estornos, crédito, pagadores e rastreabilidade", () => {
  it("crédito excedente só contribui quando alocado, sem novo movimento de caixa", () => {
    let s = purchase();
    expect(() => send(s, 60000)).toThrow();
    s = command(s, B, "send_advance", {
      id: "adv",
      recipient_id: "a",
      amount: 60000,
      account_id: "bank-b",
      date: "2026-11-04",
      description: "Crédito fictício",
    });
    s = command(s, A, "confirm_advance", {
      id: "adv",
      version: 1,
      account_id: "bank-a",
      date: "2026-11-05",
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(0);
    const before = balance(s.accounts[1], s);
    s = command(s, B, "allocate_advance", {
      id: "adv",
      version: 2,
      settlement_id: "purchase",
      settlement_version: 1,
      amount: 50000,
      date: "2026-11-06",
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(balance(s.accounts[1], s)).toBe(before);
    expect(
      s.family_advances![0].amount - s.advance_allocations![0].amount,
    ).toBe(10000);
    expect(() =>
      command(s, A, "reverse_advance", {
        id: "adv",
        version: 3,
        date: "2026-12-01",
        reason: "Devolver saldo",
      }),
    ).toThrow();
    s = command(s, B, "reverse_advance_allocation", {
      id: s.advance_allocations![0].id,
      version: 3,
      date: "2026-12-01",
      reason: "Desfazer alocação",
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(50000);
    expect(contribution(s, "b", "2026-12").actual).toBe(-50000);
  });
  it("estorno bancário devolve caixa, reabre parcela e preserva contribuição do Pix", () => {
    let s = pay(confirm(send(purchase(), 30000)));
    const p = s.payments[0];
    s = command(s, A, "reverse_payment", {
      id: p.id,
      date: "2026-12-01",
      reason: "Pagamento devolvido",
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(30000);
    expect(contribution(s, "a", "2026-12").actual).toBe(0);
    expect(contribution(s, "a", "2026-11").reimbursableAdvance).toBe(0);
    expect(availableMoney(s, "a", "2026-12-31")).toMatchObject({
      bank: 230000,
      obligations: 50000,
      free: 180000,
    });
    expect(availableMoney(s, "a", "2026-11-30", "2026-11-30")).toMatchObject({
      bank: 180000,
      obligations: 0,
      free: 180000,
    });
    expect(s.payments).toHaveLength(1);
  });
  it("dois familiares fornecem partes diretamente, sem cobrança duplicada nem contribuição do titular", () => {
    let s = purchase();
    s.accounts.push({
      id: "bank-c",
      owner_id: "c",
      kind: "bank",
      name: "C fictício",
      opening: 100000,
      cutoff: "2026-01-01",
    });
    s = pay(s, 20000, B);
    s = command(s, { id: "c", family_id: "f", name: "C" }, "pay", {
      obligation_id: "purchase:1",
      version: s.obligations[0].version,
      amount: 30000,
      account_id: "bank-c",
      paid_on: "2026-11-07",
    });
    expect(contribution(s, "b", "2026-11").actual).toBe(20000);
    expect(contribution(s, "c", "2026-11").actual).toBe(30000);
    expect(contribution(s, "a", "2026-11").actual).toBe(0);
    expect(availableMoney(s, "b", "2026-12-31").pendingSettlements).toBe(0);
    expect(() => send(s, 1)).toThrow();
  });
  it("envio pendente reserva a atribuição; terceiro não pode financiar o mesmo valor simultaneamente", () => {
    const s = send(purchase(), 30000);
    expect(() => pay(s, 30000, B)).toThrow(/financiado|enviado/);
    expect(s.payments).toHaveLength(0);
    expect(s.settlements[0].sent).toBe(30000);
  });
  it("transporte preserva cartão, Casa, compras e financiador: 800 + 300 + 50 = 1150", () => {
    let s = fixture();
    for (const [id, amount] of [
      ["old", 80000],
      ["new", 30000],
    ] as const)
      s = command(s, B, "entry", {
        id,
        description: id,
        kind: "expense",
        amount,
        occurred_on: "2026-11-03",
        category: "Alimentação",
        house: true,
        consumer_id: "b",
        responsible_id: "b",
        card_id: "card",
        splits: [],
        installments: 1,
      });
    s = command(s, A, "replace", {
      id: "roll",
      sources: ["old:1", "new:1"],
      fee: 5000,
      count: 1,
      date: "2026-12-15",
      occurred_on: "2026-11-07",
      description: "Saldo confirmado",
    });
    expect(s.obligations.find((o) => o.id === "roll:1")).toMatchObject({
      house: true,
      card_id: "card",
      amount: 115000,
    });
    expect(availableMoney(s, "a", "2026-12-31").obligations).toBe(115000);
    for (const id of ["old", "new"]) {
      const x = s.settlements.find((x) => x.id === id)!;
      s = command(s, B, "send", {
        id,
        amount: x.amount,
        account_id: "bank-b",
        sent_on: "2026-11-08",
      });
      s = command(s, A, "confirm", {
        id,
        version: s.settlements.find((x) => x.id === id)!.version,
        account_id: "bank-a",
        date: "2026-11-09",
      });
    }
    s = command(s, A, "pay", {
      obligation_id: "roll:1",
      version: 1,
      amount: 115000,
      account_id: "bank-a",
      paid_on: "2026-11-10",
    });
    expect(contribution(s, "a", "2026-11").actual).toBe(5000);
    expect(contribution(s, "b", "2026-11").actual).toBe(110000);
    expect(totals(s, "2026-11", undefined, true).consumption).toBe(115000);
    expect(s.entries).toHaveLength(3);
    expect(s.payments).toHaveLength(1);
  });
});
it("domínio recusa confirmação antes do Pix, envio sem saldo e pagamento anterior ao início da conta", () => {
  const sent = send(purchase(), 50000);
  expect.soft(() => confirm(sent, "2026-11-03")).toThrow();
  const low = purchase();
  low.accounts[1].opening = 100;
  expect.soft(() => send(low, 50000)).toThrow();
  const before = purchase();
  before.accounts[0].cutoff = "2026-11-07";
  expect.soft(() => pay(before)).toThrow();
});
it("estorno de Pix não pode preceder confirmação nem devolver saldo inexistente", () => {
  const s = confirm(send(purchase(), 50000));
  expect
    .soft(() =>
      command(s, A, "reverse_settlement", {
        id: "purchase",
        version: s.settlements[0].version,
        transfer_id: s.settlement_transfers[0].id,
        date: "2026-11-04",
        reason: "Data inválida",
      }),
    )
    .toThrow();
  s.accounts[0].opening = 0;
  s.account_movements.push({
    id: "out",
    account_id: "bank-a",
    owner_id: "a",
    amount: -50000,
    occurred_on: "2026-11-06",
    kind: "reconciliation",
    reference_id: "out",
    reason: "Fictício",
  });
  expect
    .soft(() =>
      command(s, A, "reverse_settlement", {
        id: "purchase",
        version: s.settlements[0].version,
        transfer_id: s.settlement_transfers[0].id,
        date: "2026-11-07",
        reason: "Saldo insuficiente",
      }),
    )
    .toThrow();
});
