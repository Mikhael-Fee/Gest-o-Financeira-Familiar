import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  addMonths,
  balance,
  contribution,
  forecast,
  divideSources,
  parseMoney,
  remaining,
  schedule,
  statementDate,
  status,
  totals,
  validateEntry,
  type Plan,
} from "../src/domain/finance";
import {
  apply,
  DemoRepository,
  demoIdentity,
  demoState,
} from "../src/data/store";
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-31T12:00:00Z"));
});
afterAll(() => vi.useRealTimers());
const plan: Plan = {
  id: "p",
  owner_id: "a",
  description: "Contrato",
  first_due: "2026-03-20",
  count: 10,
  amount: 20000,
  last_paid: 8,
  last_paid_on: "2026-10-20",
  history_confirmed: true,
  payoff: null,
  kind: "loan",
};
describe("Empréstimos e datas contratuais", () => {
  it("gera 10 parcelas; oito confirmadas e duas abertas nas datas corretas", () => {
    const o = schedule(plan, "f");
    expect(o).toHaveLength(10);
    expect(o.filter((x) => x.confirmed)).toHaveLength(8);
    expect(o[8].due_on).toBe("2026-11-20");
    expect(o[9].due_on).toBe("2026-12-20");
  });
  it("não presume histórico quitado ao informar última paga", () => {
    const o = schedule({ ...plan, history_confirmed: false }, "f");
    expect(o.filter((x) => x.unknown)).toHaveLength(7);
    expect(o.filter((x) => x.confirmed)).toHaveLength(1);
  });
  it("parcela 9 paga não esconde parcela 8 aberta", () => {
    const o = schedule(
      { ...plan, last_paid: 9, history_confirmed: false },
      "f",
    );
    expect(remaining(o[7], [])).toBe(20000);
    expect(remaining(o[8], [])).toBe(0);
  });
  it("mantém vencimento em outubro quando pago em novembro", () => {
    const s = demoState();
    s.obligations[7].confirmed = 0;
    const o = s.obligations[7];
    const n = apply(
      s,
      {
        key: "k",
        type: "pay",
        payload: {
          obligation_id: o.id,
          amount: 10000,
          account_id: "bank-a",
          paid_on: "2026-11-12",
          version: 1,
        },
      },
      demoIdentity,
    );
    expect(n.obligations[7].due_on).toBe("2026-10-20");
    expect(n.payments[0].paid_on).toBe("2026-11-12");
    expect(remaining(n.obligations[7], n.payments)).toBe(10000);
  });
  it("aceita dois pagamentos parciais e recusa excesso", () => {
    let s = demoState();
    const o = s.obligations[8];
    s = apply(
      s,
      {
        key: "1",
        type: "pay",
        payload: {
          obligation_id: o.id,
          amount: 10000,
          account_id: "bank-a",
          paid_on: "2026-11-12",
          version: 1,
        },
      },
      demoIdentity,
    );
    s = apply(
      s,
      {
        key: "2",
        type: "pay",
        payload: {
          obligation_id: o.id,
          amount: 10000,
          account_id: "bank-a",
          paid_on: "2026-11-13",
          version: 2,
        },
      },
      demoIdentity,
    );
    expect(remaining(s.obligations[8], s.payments)).toBe(0);
    expect(() =>
      apply(
        s,
        {
          key: "3",
          type: "pay",
          payload: {
            obligation_id: o.id,
            amount: 1,
            account_id: "bank-a",
            paid_on: "2026-11-13",
            version: 3,
          },
        },
        demoIdentity,
      ),
    ).toThrow();
  });
  it("histórico na abertura não gera fluxos fictícios", () => {
    expect(demoState().payments).toHaveLength(0);
  });
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-01-31", 2, "2026-03-31"],
    ["2026-12-31", 2, "2027-02-28"],
  ])("ajusta fim de mês %s + %i", (d, m, want) =>
    expect(addMonths(d, Number(m))).toBe(want),
  );
  it("não aceita última paga sem data efetiva", () =>
    expect(() => schedule({ ...plan, last_paid_on: null }, "f")).toThrow());
  it("distingue histórico a conferir de vencida sem confirmação", () => {
    const o = schedule({ ...plan, history_confirmed: false }, "f");
    expect(status(o[0], [], "2026-11-12")).toBe("Histórico a conferir");
    expect(status(o[8], [], "2026-12-12")).toBe("Vencida · sem confirmação");
  });
});
describe("Cartões e acertos", () => {
  it("fechamento 05 e vencimento 15 distribuem 04 e 06 em ciclos distintos", () => {
    expect(statementDate("2026-11-04", 5, 15)).toBe("2026-11-15");
    expect(statementDate("2026-11-06", 5, 15)).toBe("2026-12-15");
  });
  it("vencimento anterior ao fechamento usa próximo mês e ajusta dia 31", () => {
    expect(statementDate("2026-01-20", 25, 15)).toBe("2026-02-15");
    expect(statementDate("2026-02-20", 5, 31)).toBe("2026-03-31");
  });
  it("consumo do titular e usuário são distintos", () => {
    const s = demoState();
    expect(totals(s, "2026-11", "b").consumption).toBe(65000);
    expect(totals(s, "2026-11", "a").consumption).toBe(75000);
  });
  it("Pix informado não reduz saldo; confirmação não paga fatura nem cria renda", () => {
    const s = demoState();
    expect(s.settlements[0].confirmed).toBe(0);
    const n = apply(
      s,
      {
        key: "k",
        type: "confirm",
        payload: {
          id: "settlement-ab",
          version: 1,
          account_id: "bank-a",
          date: "2026-11-12",
        },
      },
      demoIdentity,
    );
    expect(n.settlements[0].amount - n.settlements[0].confirmed).toBe(25000);
    expect(remaining(n.obligations.at(-1)!, n.payments)).toBe(100000);
    expect(totals(n, "2026-11").income).toBe(0);
  });
  it("pagar fatura não duplica consumo", () => {
    const s = demoState();
    const n = apply(
      s,
      {
        key: "k",
        type: "pay",
        payload: {
          obligation_id: "statement-a",
          amount: 10000,
          account_id: "bank-a",
          paid_on: "2026-11-12",
          version: 1,
        },
      },
      demoIdentity,
    );
    expect(totals(n, "2026-11").consumption).toBe(
      totals(s, "2026-11").consumption,
    );
  });
});
describe("Casa e VA/VR", () => {
  it("recarga de 500 não aumenta saldo bancário ou contribuição", () => {
    const s = demoState();
    const n = apply(
      s,
      {
        key: "k",
        type: "entry",
        payload: {
          id: "benefit",
          description: "Recarga",
          kind: "benefit",
          amount: 50000,
          occurred_on: "2026-11-06",
          category: "Benefício",
          house: false,
          consumer_id: "a",
          responsible_id: null,
          card_id: null,
          splits: [{ account_id: "va-a", amount: 50000 }],
        },
      },
      demoIdentity,
    );
    expect(balance(n.accounts[0], n)).toBe(balance(s.accounts[0], s));
    expect(contribution(n, "a", "2026-11").actual).toBe(40000);
    expect(totals(n, "2026-11").income).toBe(0);
  });
  it("mercado 400 em VA 250 + débito 150 é uma única compra", () => {
    const s = demoState();
    expect(balance(s.accounts[0], s)).toBe(305000);
    expect(balance(s.accounts[1], s)).toBe(25000);
    expect(totals(s, "2026-11", undefined, true).consumption).toBe(40000);
  });
  it("uso pessoal de benefício não contribui à Casa", () => {
    const s = demoState();
    s.entries[0].house = false;
    expect(contribution(s, "a", "2026-11").actual).toBe(0);
  });
  it("meta 600 realizada 400 ou 700 nunca cria dívida", () => {
    const s = demoState();
    expect(contribution(s, "a", "2026-11")).toEqual({
      actual: 40000,
      goal: 60000,
      missing: 20000,
      above: 0,
      debt: 0,
    });
    s.entries[0].amount = 70000;
    s.entries[0].splits = [{ account_id: "va-a", amount: 70000 }];
    expect(contribution(s, "a", "2026-11").debt).toBe(0);
    expect(contribution(s, "a", "2026-11").above).toBe(10000);
  });
  it("Casa sem responsável não atribui responsabilidade permanente", () =>
    expect(demoState().entries[0].responsible_id).toBeNull());
  it("recusa splits inconsistentes e conta não autorizada", () => {
    const s = demoState();
    expect(() =>
      validateEntry({ ...s.entries[0], amount: 50000 }, s.accounts),
    ).toThrow();
    expect(() =>
      validateEntry({ ...s.entries[0], owner_id: "b" }, s.accounts),
    ).toThrow();
  });
});
describe("Confiabilidade", () => {
  it("idempotência e concorrência não geram débito duplicado", async () => {
    const repo = new DemoRepository();
    const command = {
      key: "same",
      type: "pay" as const,
      payload: {
        obligation_id: "statement-a",
        amount: 10000,
        account_id: "bank-a",
        paid_on: "2026-11-12",
        version: 1,
      },
    };
    await Promise.all([
      repo.execute(command, demoIdentity),
      repo.execute(command, demoIdentity),
    ]);
    expect((await repo.load()).payments).toHaveLength(1);
    await expect(
      repo.execute(
        { ...command, payload: { ...command.payload, amount: 20000 } },
        demoIdentity,
      ),
    ).rejects.toThrow();
  });
  it("controle de versão recusa alteração perdida", () => {
    const s = demoState();
    expect(() =>
      apply(
        s,
        {
          key: "x",
          type: "pay",
          payload: {
            obligation_id: "statement-a",
            amount: 100,
            account_id: "bank-a",
            paid_on: "2026-11-12",
            version: 2,
          },
        },
        demoIdentity,
      ),
    ).toThrow();
  });
  it("recebido substitui previsão", () => {
    const s = demoState();
    s.entries.push({ ...s.entries[0], kind: "income", amount: 300000 });
    expect(forecast(s, "2026-11", 250000)[0].income).toBe(300000);
  });
  it("centavos são inteiros e entradas inválidas recusadas", () => {
    expect(parseMoney("200,01")).toBe(20001);
    expect(() => parseMoney("1.000,20")).toThrow();
    expect(() => parseMoney("-2")).toThrow();
  });
});
describe("Fluxos adicionais de crédito e recorrência", () => {
  it("parcelas no cartão preservam soma e registram consumo uma vez", () => {
    const s = demoState();
    const n = apply(
      s,
      {
        key: "k",
        type: "entry",
        payload: {
          id: "purchase",
          description: "Compra em seis vezes",
          kind: "expense",
          amount: 120000,
          occurred_on: "2026-11-06",
          category: "Outros",
          house: false,
          consumer_id: "a",
          responsible_id: null,
          card_id: "card-a",
          splits: [],
          installments: 6,
        },
      },
      demoIdentity,
    );
    const o = n.obligations.filter((o) => o.id.startsWith("purchase:"));
    expect(o).toHaveLength(6);
    expect(o.map((x) => x.amount)).toEqual(Array(6).fill(20000));
    expect(o[0].due_on).toBe("2026-12-15");
    expect(n.entries.filter((e) => e.id === "purchase")).toHaveLength(1);
  });
  it("renegociação conta obrigação ativa uma vez e somente encargos geram consumo adicional", () => {
    const s = demoState();
    const n = apply(
      s,
      {
        key: "k",
        type: "replace",
        payload: {
          id: "new",
          sources: ["statement-a"],
          description: "Renegociada",
          fee: 5000,
          count: 3,
          date: "2026-12-15",
        },
      },
      demoIdentity,
    );
    expect(
      remaining(
        n.obligations.find((o) => o.id === "statement-a")!,
        [],
      ),
    ).toBe(0);
    expect(
      n.obligations
        .filter((o) => o.id.startsWith("new:"))
        .reduce((v, o) => v + o.amount, 0),
    ).toBe(105000);
    expect(totals(n, "2026-12").consumption).toBe(5000);
  });
  it("cronograma variável ajusta uma parcela com justificativa e conserva demais datas", () => {
    const s = demoState();
    const o = s.obligations[8];
    const n = apply(
      s,
      {
        key: "k",
        type: "adjust_due",
        payload: {
          id: o.id,
          version: 1,
          amount: 22000,
          date: "2026-12-05",
          reason: "Carência informada no contrato",
        },
      },
      demoIdentity,
    );
    expect(n.obligations[8].amount).toBe(22000);
    expect(n.obligations[9].due_on).toBe("2026-12-20");
    expect(n.obligations[8].version).toBe(2);
  });
});

it("divide pagamentos proporcionalmente sem perder centavos", () => {
  expect(
    divideSources(
      [
        { account_id: "va", amount: 25000 },
        { account_id: "bank", amount: 15000 },
      ],
      30000,
    ),
  ).toEqual([
    [
      { account_id: "va", amount: 18750 },
      { account_id: "bank", amount: 11250 },
    ],
    [
      { account_id: "va", amount: 6250 },
      { account_id: "bank", amount: 3750 },
    ],
  ]);
});
it("renda extra não substitui previsão de salário", () => {
  const s = demoState();
  s.entries.push({
    ...s.entries[0],
    kind: "income",
    income_type: "extra",
    amount: 10000,
  });
  expect(forecast(s, "2026-11", 200000)[0].income).toBe(210000);
});

it("saldo atual ignora movimentos de data futura mesmo em dados carregados", () => {
  const s = demoState();
  const before = balance(s.accounts[0], s);
  s.entries.push({
    ...s.entries[0],
    id: "future",
    kind: "income",
    occurred_on: "2027-01-01",
    amount: 100000,
    splits: [{ account_id: "bank-a", amount: 100000 }],
  });
  expect(balance(s.accounts[0], s)).toBe(before);
});
