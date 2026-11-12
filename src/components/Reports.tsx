import { useState, type ReactNode } from "react";
import {
  conservativeSalary,
  forecast,
  incomeForMonth,
  money,
  parseMoney,
  remaining,
  today,
  type State,
  type Entry,
  type Obligation,
} from "../domain/finance";
import type { Command } from "../data/store";
import { Field, Metric } from "./ui";
import SalaryPanel from "./SalaryPanel";
type Props = {
  state: State;
  ownerId: string;
  month: string;
  busy: boolean;
  entries: Entry[];
  obligations: Obligation[];
  t: { consumption: number };
  heading: (title: string, subtitle: string, action?: ReactNode) => ReactNode;
  onCommand: (
    type: Command["type"],
    payload: Command["payload"],
    key?: string,
  ) => Promise<boolean>;
  onAddReceipt: () => void;
};
export default function Reports({
  state,
  ownerId,
  month,
  busy,
  entries,
  obligations,
  t,
  heading,
  onCommand,
  onAddReceipt,
}: Props) {
  const [base, setBase] = useState(
    String(incomeForMonth(state, ownerId, month).expected / 100),
  );
  const [scenario, setScenario] = useState("base");
  let salary = 0;
  try {
    salary = parseMoney(base);
  } catch {
    /* Preview remains zero while editing. */
  }
  const reference =
    state.income_settings.find((x) => x.owner_id === ownerId)?.base ?? 0;
  if (scenario === "base") salary = reference;
  if (scenario === "history") {
    const monthly = new Map<string, number>();
    state.entries
      .filter(
        (e) =>
          e.owner_id === ownerId &&
          e.kind === "income" &&
          e.income_type !== "extra" &&
          !e.voided,
      )
      .forEach((e) =>
        monthly.set(
          e.salary_month ?? e.occurred_on.slice(0, 7),
          (monthly.get(e.salary_month ?? e.occurred_on.slice(0, 7)) ?? 0) +
            e.amount,
        ),
      );
    salary = conservativeSalary(
      [...monthly.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, amount]) => amount),
      reference,
    );
  }
  const rows = forecast(
    {
      ...state,
      obligations: state.obligations.filter((o) => o.owner_id === ownerId),
      entries: state.entries.filter((e) => e.owner_id === ownerId),
    },
    month,
    salary,
    12,
    ownerId,
    scenario !== "manual",
  );
  return (
    <>
      <SalaryPanel
        key={`${ownerId}:${month}`}
        state={state}
        ownerId={ownerId}
        month={month}
        busy={busy}
        onCommand={onCommand}
        onAddReceipt={onAddReceipt}
      />
      <div className="metrics compact">
        {[30, 60, 90].map((days) => {
          const end = new Date(`${today()}T12:00:00Z`);
          end.setUTCDate(end.getUTCDate() + days);
          const through = end.toISOString().slice(0, 10);
          const due = state.obligations
            .filter(
              (o) =>
                o.owner_id === ownerId &&
                o.due_on !== null &&
                o.due_on <= through,
            )
            .reduce((n, o) => n + remaining(o, state.payments), 0);
          return (
            <Metric
              key={days}
              label={`Compromissos em até ${days} dias`}
              value={money(due)}
              hint="Inclui vencidos e histórico a conferir · não é saldo bancário"
            />
          );
        })}
      </div>
      <section className="panel">
        {heading(
          "Consumo por categoria",
          "Pagamentos de fatura e empréstimos não duplicam as compras.",
        )}
        <div className="category-bars">
          {[
            ...new Set([
              ...state.categories.map((c) => c.name),
              ...state.entries.map((e) => e.category),
            ]),
          ]
            .map((c) => ({
              category: c,
              amount: entries
                .filter((e) => e.kind === "expense" && e.category === c)
                .reduce((n, e) => n + e.amount, 0),
            }))
            .filter((c) => c.amount)
            .map((c) => (
              <div key={c.category}>
                <span>{c.category}</span>
                <progress
                  aria-label={c.category}
                  value={c.amount}
                  max={t.consumption || 1}
                />
                <b>{money(c.amount)}</b>
              </div>
            ))}
        </div>
      </section>
      <section className="panel">
        {heading(
          "Planejamento de 12 meses",
          "Simulação manual. Não representa renda ou saldo bancário confirmado.",
        )}
        <Field label="Cenário de renda">
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            <option value="manual">Simulação manual</option>
            <option value="base">Referência conservadora cadastrada</option>
            <option value="history">
              Histórico de salários · mediana conservadora de até 6 meses
            </option>
          </select>
        </Field>
        <p className="muted">
          Histórico precisa de ao menos 3 meses; abaixo disso usa a referência
          cadastrada, sem tratar extras como salário.
        </p>
        <Field label="Salário líquido mensal previsto (R$)">
          <input
            inputMode="decimal"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </Field>
        <div className="table-scroll">
          <table>
            <caption>
              Renda e obrigações pessoais · pendências antigas são mostradas
              separadamente
            </caption>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Renda</th>
                <th>Obrigações</th>
                <th>Diferença</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month}>
                  <th>{r.month}</th>
                  <td>{money(r.income)}</td>
                  <td>{money(r.due)}</td>
                  <td>{money(r.free)}</td>
                  <td>
                    {r.estimated
                      ? scenario === "history"
                        ? "Histórico / referência"
                        : scenario === "base"
                          ? "Referência cadastrada"
                          : "Estimativa manual"
                      : "Recebido"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Pendências anteriores ao período:{" "}
          {money(
            obligations
              .filter((o) => o.due_on !== null && o.due_on < `${month}-01`)
              .reduce((n, o) => n + remaining(o, state.payments), 0),
          )}
          . Devem ser somadas à necessidade de caixa; não foram recriadas no
          mês.
        </p>
      </section>
    </>
  );
}
