import { useState, type ReactNode } from "react";
import {
  addMonths,
  conservativeSalary,
  forecast,
  incomeForMonth,
  money,
  parseMoney,
  remaining,
  today,
  type State,
} from "../domain/finance";
import {
  cashReport,
  categoryOptions,
  consumptionReport,
  consumptionRows,
  contributionReport,
  monthLabel,
  noConsumptionFilters,
  obligationWarnings,
  scopedObligations,
  type ReportScope,
} from "../domain/reports";
import type { Command } from "../data/store";
import { Field, Metric } from "./ui";
import { ColumnChart, DonutChart, chartColors } from "./ReportCharts";
import SalaryPanel from "./SalaryPanel";
type Heading = (
  title: string,
  subtitle: string,
  action?: ReactNode,
) => ReactNode;
type Props = {
  state: State;
  ownerId: string;
  month: string;
  scope: ReportScope;
  busy: boolean;
  heading: Heading;
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
  scope,
  busy,
  heading,
  onCommand,
  onAddReceipt,
}: Props) {
  const [months, setMonths] = useState(6);
  const [filters, setFilters] = useState(noConsumptionFilters);
  const personal = scope === "personal";
  const data = consumptionReport(state, ownerId, scope, month, months, filters);
  const cash = cashReport(state, ownerId, month, months);
  const contributions = contributionReport(state, ownerId, scope, month);
  const all = consumptionRows(state, ownerId, scope);
  const obligations = scopedObligations(state, ownerId, scope);
  const setFilter = (field: keyof typeof filters, value: string) =>
    setFilters((old) => ({ ...old, [field]: value }));
  return (
    <div className="reports-page">
      {heading(
        personal ? "Seus relatórios" : "Relatórios da Casa",
        monthLabel(month) +
          " · " +
          (personal
            ? "Seu consumo, dinheiro e planejamento em gráficos."
            : "Despesas e contribuições compartilhadas. Rendas e saldos particulares ficam no espaço pessoal."),
      )}
      <section
        className="panel report-filters"
        aria-label="Filtros dos gráficos de consumo"
      >
        <h3>Entenda seus gastos</h3>
        <p>
          Os filtros abaixo valem para evolução, categorias e meios de
          pagamento.
        </p>
        <div className="report-filter-grid">
          <Field label="Janela de comparação">
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              <option value={6}>6 meses até o período escolhido</option>
              <option value={12}>12 meses até o período escolhido</option>
            </select>
          </Field>
          <Field label="Categoria do consumo">
            <select
              value={filters.category}
              onChange={(e) => setFilter("category", e.target.value)}
            >
              <option value="all">Todas as categorias</option>
              {categoryOptions(all.map((r) => r.entry)).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fonte do consumo">
            <select
              value={filters.source}
              onChange={(e) => setFilter("source", e.target.value)}
            >
              <option value="all">Todos os meios</option>
              <optgroup label="Suas contas e benefícios">
                {state.accounts
                  .filter((a) => a.owner_id === ownerId)
                  .map((a) => (
                    <option key={a.id} value={"account:" + a.id}>
                      {a.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Cartões autorizados">
                {state.cards
                  .filter(
                    (c) =>
                      c.owner_id === ownerId || c.authorized.includes(ownerId),
                  )
                  .map((c) => (
                    <option key={c.id} value={"card:" + c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </Field>
          {!personal && (
            <Field label="Pessoa que consumiu">
              <select
                value={filters.personId}
                onChange={(e) => setFilter("personId", e.target.value)}
              >
                <option value="all">Todos os membros</option>
                {state.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {filters.source !== "all" && (
          <p>
            Compras divididas mostram somente a parcela paga pela fonte
            escolhida.
          </p>
        )}
        <button
          type="button"
          className="text-button"
          onClick={() => setFilters(noConsumptionFilters)}
        >
          Limpar filtros de consumo
        </button>
      </section>
      <div className="report-chart-grid">
        <section className="panel report-wide" aria-label="Evolução do consumo">
          {heading(
            "Evolução do consumo",
            "Compra reconhecida na data da operação. Pagar fatura ou empréstimo não cria outra despesa.",
          )}
          <ColumnChart
            title="evolução do consumo"
            points={data.history.map((r) => ({
              key: r.month,
              label: monthLabel(r.month, true),
              values: personal ? [r.personal, r.house] : [r.house],
            }))}
            series={
              personal
                ? [
                    { label: "Pessoal", color: chartColors[0] },
                    { label: "Destinado à Casa", color: chartColors[1] },
                  ]
                : [{ label: "Consumo da Casa", color: chartColors[1] }]
            }
          />
        </section>
        <section className="panel" aria-label="Consumo por categoria">
          {heading(
            "Consumo por categoria",
            "Veja onde os gastos se concentram. Toque na legenda para destacar uma categoria.",
          )}
          <DonutChart
            title="consumo por categoria"
            groups={data.categories}
            empty="Nenhuma despesa para este mês e estes filtros."
          />
        </section>
        <section className="panel" aria-label="Meios de pagamento">
          {heading(
            "Meios de pagamento",
            "VA/VR, dinheiro e crédito representam partes do mesmo consumo.",
          )}
          <DonutChart
            title="meios de pagamento"
            groups={data.sources}
            empty="Nenhum meio de pagamento registrado neste recorte."
          />
          {!personal && (
            <p className="muted">
              Fontes privadas de outros membros não revelam tipo, nome ou saldo
              da conta.
            </p>
          )}
        </section>
      </div>
      {personal && (
        <section className="panel" aria-label="Entradas e saídas de dinheiro">
          {heading(
            "Entradas e saídas de dinheiro",
            "Movimentos efetivos nas suas contas bancárias e dinheiro físico, por data da operação.",
          )}
          <ColumnChart
            title="entradas e saídas de dinheiro"
            points={cash.map((r) => ({
              key: r.month,
              label: monthLabel(r.month, true),
              values: [r.incoming, r.outgoing],
            }))}
            series={[
              { label: "Entradas confirmadas", color: chartColors[1] },
              { label: "Saídas confirmadas", color: chartColors[2] },
            ]}
            line={{
              label: "Resultado do período",
              color: chartColors[0],
              values: cash.map((r) => r.net),
            }}
          />
          <p>
            Empréstimos e acertos confirmados entram como movimento de dinheiro,
            sem virar salário. Saldos de abertura, ajustes de conciliação,
            transferências próprias e VA/VR ficam fora deste gráfico. O período
            respeita a data inicial de cada conta.
          </p>
        </section>
      )}
      <section className="panel" aria-label="Contribuições à Casa">
        {heading(
          "Contribuições à Casa",
          "Gasto efetivo destinado à família. Meta flexível não é dívida, mesmo quando falta para o objetivo.",
        )}
        <ColumnChart
          title="contribuições à Casa"
          selectionLabel="Pessoa em destaque"
          points={contributions.map((c) => ({
            key: c.id,
            label: c.name,
            values: [c.actual, c.goal],
          }))}
          series={[
            { label: "Realizado", color: chartColors[1] },
            { label: "Sua meta flexível", color: chartColors[0] },
          ]}
          empty="Nenhuma contribuição ou meta registrada neste mês."
        />
        <p>
          Recarga e uso pessoal de VA/VR não contam. A meta de outro membro é
          privada; não aparecer aqui não significa meta zero.
        </p>
      </section>
      <div className="metrics compact">
        {[30, 60, 90].map((days) => {
          const end = new Date(today() + "T12:00:00Z");
          end.setUTCDate(end.getUTCDate() + days);
          const due = obligations
            .filter(
              (o) =>
                o.due_on !== null && o.due_on <= end.toISOString().slice(0, 10),
            )
            .reduce((n, o) => n + remaining(o, state.payments), 0);
          return (
            <Metric
              key={days}
              label={"Compromissos em até " + days + " dias"}
              value={money(due)}
              hint="A partir de hoje · inclui vencidos e histórico a conferir com data conhecida"
            />
          );
        })}
      </div>
      <ForecastPanel
        key={ownerId + ":" + scope + ":" + month}
        state={state}
        ownerId={ownerId}
        scope={scope}
        month={month}
        heading={heading}
      />
      {personal && (
        <SalaryPanel
          key={ownerId + ":" + month}
          state={state}
          ownerId={ownerId}
          month={month}
          busy={busy}
          onCommand={onCommand}
          onAddReceipt={onAddReceipt}
        />
      )}
    </div>
  );
}

function ForecastPanel({
  state,
  ownerId,
  scope,
  month,
  heading,
}: {
  state: State;
  ownerId: string;
  scope: ReportScope;
  month: string;
  heading: Heading;
}) {
  const [base, setBase] = useState(
    String(incomeForMonth(state, ownerId, month).expected / 100),
  );
  const [scenario, setScenario] = useState("base");
  const personal = scope === "personal";
  const reference = incomeForMonth(state, ownerId, month).expected;
  let salary = reference,
    invalid = false;
  if (scenario === "manual") {
    try {
      salary = parseMoney(base);
    } catch {
      invalid = true;
    }
  }
  if (scenario === "history") {
    const monthly = new Map<string, number>();
    state.entries
      .filter(
        (e) =>
          e.owner_id === ownerId &&
          e.kind === "income" &&
          e.income_type !== "extra" &&
          !e.voided &&
          (e.salary_month ?? e.occurred_on.slice(0, 7)) < month,
      )
      .forEach((e) => {
        const m = e.salary_month ?? e.occurred_on.slice(0, 7);
        monthly.set(m, (monthly.get(m) ?? 0) + e.amount);
      });
    salary = conservativeSalary(
      [...monthly.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, value]) => value),
      reference,
    );
  }
  const obligations = scopedObligations(state, ownerId, scope);
  const rows = personal
    ? forecast(
        {
          ...state,
          obligations,
          entries: state.entries.filter((e) => e.owner_id === ownerId),
        },
        month,
        salary,
        12,
        ownerId,
        scenario === "base",
      )
    : Array.from({ length: 12 }, (_, i) => {
        const value = addMonths(month + "-01", i).slice(0, 7);
        const due = obligations
          .filter((o) => o.due_on?.startsWith(value))
          .reduce((n, o) => n + remaining(o, state.payments), 0);
        return { month: value, due, income: 0, free: -due, estimated: false };
      });
  const warnings = obligationWarnings(state, ownerId, scope, month);
  return (
    <section
      className="panel report-forecast"
      aria-label="Planejamento de 12 meses"
    >
      {heading(
        "Planejamento de 12 meses",
        personal
          ? "Renda comparada com obrigações ainda abertas. Contornos tracejados indicam renda estimada."
          : "Obrigações compartilhadas por vencimento, sem usar salários ou saldos privados.",
      )}
      {personal && (
        <>
          <Field label="Cenário de renda">
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="base">Referência conservadora cadastrada</option>
              <option value="history">
                Histórico de salários · mediana conservadora de até 6 meses
              </option>
              <option value="manual">Simulação manual</option>
            </select>
          </Field>
          <p>
            Histórico usa os meses anteriores ao período escolhido, com ao menos
            3 meses. Abaixo disso usa a referência cadastrada; extras ficam
            separados.
          </p>
          {scenario === "manual" && (
            <Field label="Salário líquido mensal previsto (R$)">
              <input
                inputMode="decimal"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                aria-invalid={invalid}
              />
            </Field>
          )}
        </>
      )}
      {invalid ? (
        <p className="error" role="alert">
          Informe uma previsão válida, como 2500,50. O gráfico será atualizado
          quando o valor estiver completo.
        </p>
      ) : (
        <ColumnChart
          title="planejamento de 12 meses"
          points={rows.map((r) => ({
            key: r.month,
            label: monthLabel(r.month, true),
            values: personal ? [r.income, r.due] : [r.due],
            estimated: personal && r.estimated,
          }))}
          series={
            personal
              ? [
                  { label: "Renda prevista / recebida", color: chartColors[1] },
                  { label: "Obrigações abertas", color: chartColors[2] },
                ]
              : [{ label: "Obrigações da Casa", color: chartColors[2] }]
          }
          line={
            personal
              ? {
                  label: "Diferença projetada",
                  color: chartColors[0],
                  values: rows.map((r) => r.free),
                }
              : undefined
          }
          empty="Ainda não há renda prevista nem obrigações cadastradas para o período."
        />
      )}
      <div className="report-warnings">
        <p>
          <strong>
            Pendências anteriores ao período: {money(warnings.older)}
          </strong>
          <br />
          Mantêm os vencimentos originais e devem ser consideradas
          separadamente.
        </p>
        <p>
          <strong>Sem vencimento conhecido: {money(warnings.undated)}</strong>
          <br />
          Continuam em aberto para conferência; não foram atribuídas a um mês
          inventado.
        </p>
      </div>
      <p>
        Simulação com os registros disponíveis, sem incluir gastos futuros ainda
        não cadastrados. A diferença projetada não é saldo bancário confirmado.
      </p>
    </section>
  );
}
