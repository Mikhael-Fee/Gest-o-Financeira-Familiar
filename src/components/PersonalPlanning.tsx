import { useRef, useState, type FormEvent } from "react";
import { money, parseMoney, today, type State } from "../domain/finance";
import {
  budgetSummary,
  savingsSummary,
  type PersonalState,
  type PersonalCommandType,
  type PersonalBudget,
  type SavingsGoal,
} from "../domain/personal";
import { Field, Metric, Empty } from "./ui";

type Props = {
  state: State & PersonalState;
  ownerId: string;
  month: string;
  busy: boolean;
  onCommand: (
    type: PersonalCommandType,
    payload: Record<string, unknown>,
    key?: string,
  ) => Promise<boolean>;
};
const goalKinds = {
  emergency: "Reserva de emergência",
  savings: "Economia",
  purchase: "Compra",
  travel: "Viagem",
  debt: "Quitar dívida",
  custom: "Personalizada",
};
const defaultCategories = [
  "Alimentação",
  "Moradia",
  "Transporte",
  "Saúde",
  "Educação",
  "Compras pessoais",
  "Lazer",
  "Assinaturas",
  "Financeiro",
  "Outros",
];
export default function PersonalPlanning(props: Props) {
  const { state, ownerId, month, busy, onCommand } = props;
  const [budget, setBudget] = useState<PersonalBudget | "new" | null>(null),
    [goal, setGoal] = useState<SavingsGoal | "new" | null>(null);
  const copyKey = useRef(crypto.randomUUID());
  const budgets = state.personal_budgets
    .filter((b) => b.owner_id === ownerId && b.month === month)
    .sort((a, b) => a.category.localeCompare(b.category));
  const goals = state.savings_goals.filter((g) => g.owner_id === ownerId);
  async function copy() {
    if (await onCommand("budget_copy", { month }, copyKey.current))
      copyKey.current = crypto.randomUUID();
  }
  return (
    <div>
      <section className="panel" aria-labelledby="budget-title">
        <h2 id="budget-title">Orçamento pessoal · {month}</h2>
        <p>
          Somente seu consumo pessoal, na data da compra. Gastos da Casa e
          pagamentos de fatura ficam separados. Ultrapassar o orçamento não
          bloqueia compras.
        </p>
        <div className="salary-actions">
          <button className="secondary" onClick={() => setBudget("new")}>
            Novo orçamento
          </button>
          <button className="text-button" disabled={busy} onClick={copy}>
            Copiar mês anterior
          </button>
        </div>
        {!budgets.length && (
          <Empty>
            Defina um valor por categoria para comparar o planejado com o
            realizado. Copiar preserva os orçamentos já definidos neste mês.
          </Empty>
        )}
        {budgets.map((b) => {
          const summary = budgetSummary(state, b);
          return (
            <article className="panel" key={b.category}>
              <h3>{b.category}</h3>
              <p role="status">
                {summary.status} · aviso em {b.warning}%
              </p>
              <div className="metrics compact">
                <Metric
                  label="Planejado"
                  value={money(b.amount)}
                  hint={month}
                />
                <Metric
                  label="Realizado"
                  value={money(summary.actual)}
                  hint={
                    summary.percent === null
                      ? "Sem orçamento positivo"
                      : `${summary.percent.toFixed(1)}% utilizado`
                  }
                />
                <Metric
                  label="Restante"
                  value={money(summary.remaining)}
                  hint={
                    summary.remaining < 0
                      ? "Valor ultrapassado"
                      : "Ainda dentro do planejamento"
                  }
                />
              </div>
              <p>
                Mês anterior: {money(summary.previous)}. Diferença:{" "}
                {money(summary.difference)}.
              </p>
              <button className="text-button" onClick={() => setBudget(b)}>
                Editar orçamento de {b.category}
              </button>
            </article>
          );
        })}
        {budget && (
          <BudgetEditor
            key={`${month}:${budget === "new" ? "new" : budget.category + budget.version}`}
            {...props}
            budget={budget === "new" ? null : budget}
            close={() => setBudget(null)}
          />
        )}
      </section>
      <section className="panel" aria-labelledby="savings-title">
        <h2 id="savings-title">Economia e reserva pessoal</h2>
        <p>
          Registre apenas o dinheiro que você efetivamente separou. Uma meta não
          é dívida, renda nem transferência bancária; o saldo da conta continua
          o mesmo.
        </p>
        <button className="secondary" onClick={() => setGoal("new")}>
          Nova meta pessoal
        </button>
        {!goals.length && (
          <Empty>
            Crie uma reserva de emergência ou uma meta sua. Ela é privada e
            independente da contribuição à Casa.
          </Empty>
        )}
        {goals.map((g) => (
          <SavingsCard key={g.id} {...props} goal={g} edit={() => setGoal(g)} />
        ))}
        {goal && (
          <GoalEditor
            key={goal === "new" ? "new" : goal.id + goal.version}
            {...props}
            goal={goal === "new" ? null : goal}
            close={() => setGoal(null)}
          />
        )}
      </section>
    </div>
  );
}
function BudgetEditor({
  state,
  ownerId,
  month,
  busy,
  onCommand,
  budget,
  close,
}: Props & { budget: PersonalBudget | null; close: () => void }) {
  const key = useRef(crypto.randomUUID()),
    [error, setError] = useState("");
  const options = [
    ...new Set([
      ...defaultCategories,
      ...state.categories
        .filter((c) => c.owner_id === ownerId && c.active)
        .map((c) => c.name),
      ...state.entries
        .filter((e) => e.consumer_id === ownerId && !e.house)
        .map((e) => e.category),
      ...(budget ? [budget.category] : []),
    ]),
  ];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const category = String(f.get("category"));
      const current = state.personal_budgets.find(
        (b) =>
          b.owner_id === ownerId &&
          b.month === month &&
          b.category === category,
      );
      const versions = Object.fromEntries(
        state.personal_budgets
          .filter((b) => b.owner_id === ownerId && b.category === category)
          .map((b) => [b.month, b.version]),
      );
      if (
        await onCommand(
          "budget",
          {
            month,
            category,
            amount: parseMoney(String(f.get("amount"))),
            warning: Number(f.get("warning")),
            months: Number(f.get("months")),
            version: budget?.version ?? current?.version ?? 0,
            versions,
          },
          key.current,
        )
      )
        close();
    } catch {
      setError("Confira o valor e o período antes de salvar.");
    }
  }
  return (
    <form onSubmit={submit}>
      <h3>{budget ? "Editar orçamento" : "Definir orçamento"}</h3>
      <Field label="Categoria do orçamento">
        <select
          name="category"
          defaultValue={budget?.category}
          disabled={!!budget}
        >
          {options.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      {budget && (
        <input type="hidden" name="category" value={budget.category} />
      )}
      <Field label="Valor planejado (R$)">
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={String((budget?.amount ?? 0) / 100).replace(".", ",")}
        />
      </Field>
      <Field label="Avisar a partir de (%)">
        <input
          type="number"
          name="warning"
          min="1"
          max="100"
          required
          defaultValue={budget?.warning ?? 80}
        />
      </Field>
      <Field label="Aplicar por quantos meses, incluindo este">
        <input
          type="number"
          name="months"
          min="1"
          max="24"
          required
          defaultValue="1"
        />
      </Field>
      <p>
        O padrão altera somente {month}. Escolher mais meses define valores
        futuros, sem modificar meses anteriores. Os avisos mostram atenção no
        limite escolhido, atingido em 100% e ultrapassado acima dele.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        Salvar orçamento
      </button>
      <button className="text-button" type="button" onClick={close}>
        Cancelar
      </button>
    </form>
  );
}
function GoalEditor({
  state,
  ownerId,
  busy,
  onCommand,
  goal,
  close,
}: Props & { goal: SavingsGoal | null; close: () => void }) {
  const key = useRef(crypto.randomUUID()),
    goalId = useRef(goal?.id ?? crypto.randomUUID()),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      if (
        await onCommand(
          "savings_goal",
          {
            id: goalId.current,
            version: goal?.version ?? 0,
            name: String(f.get("name")),
            kind: String(f.get("kind")),
            target: parseMoney(String(f.get("target"))),
            initial: goal?.initial ?? parseMoney(String(f.get("initial"))),
            account_id: String(f.get("account")) || null,
            due_on: String(f.get("due")) || null,
            active: f.get("active") === "on",
            created_on: today(),
          },
          key.current,
        )
      )
        close();
    } catch {
      setError(
        "Confira os valores. A reserva deve corresponder a dinheiro já separado, sem exceder o saldo da conta vinculada.",
      );
    }
  }
  return (
    <form onSubmit={submit}>
      <h3>{goal ? "Editar meta pessoal" : "Criar meta pessoal"}</h3>
      <Field label="Nome da meta">
        <input name="name" maxLength={100} required defaultValue={goal?.name} />
      </Field>
      <Field label="Tipo de meta">
        <select name="kind" defaultValue={goal?.kind ?? "emergency"}>
          {Object.entries(goalKinds).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Valor desejado (R$)">
        <input
          name="target"
          inputMode="decimal"
          required
          defaultValue={
            goal ? String(goal.target / 100).replace(".", ",") : undefined
          }
        />
      </Field>
      {!goal && (
        <Field label="Valor já separado (R$)">
          <input name="initial" inputMode="decimal" required defaultValue="0" />
        </Field>
      )}
      <Field label="Conta vinculada (opcional)">
        <select name="account" defaultValue={goal?.account_id ?? ""}>
          <option value="">Sem conta vinculada · origem a conferir</option>
          {state.accounts
            .filter(
              (a) =>
                a.owner_id === ownerId && ["bank", "cash"].includes(a.kind),
            )
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Prazo desejado (opcional)">
        <input name="due" type="date" defaultValue={goal?.due_on ?? ""} />
      </Field>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={goal?.active ?? true}
        />{" "}
        Meta ativa; valor separado considerado no planejamento
      </label>
      <p>
        Vincular uma conta não separa todo o saldo automaticamente. Para
        corrigir o valor já separado, use aporte, retirada ou estorno no
        histórico. Desativar preserva o histórico e deixa de reservar o valor no
        planejamento.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        Salvar meta
      </button>
      <button className="text-button" type="button" onClick={close}>
        Cancelar
      </button>
    </form>
  );
}
function SavingsCard({
  state,
  busy,
  onCommand,
  goal,
  edit,
}: Props & { goal: SavingsGoal; edit: () => void }) {
  const summary = savingsSummary(goal, state.savings_movements),
    history = state.savings_movements
      .filter((m) => m.goal_id === goal.id)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const [open, setOpen] = useState(false),
    [direction, setDirection] = useState("deposit"),
    [error, setError] = useState("");
  const key = useRef(crypto.randomUUID()),
    movementId = useRef(crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const type = direction === "reverse" ? "savings_reverse" : "savings_move";
      if (
        await onCommand(
          type,
          {
            id: movementId.current,
            goal_id: goal.id,
            version: goal.version,
            direction,
            amount:
              direction === "reverse" ? 0 : parseMoney(String(f.get("amount"))),
            movement_id: String(f.get("movement")),
            occurred_on: String(f.get("date")),
            reason: String(f.get("reason")),
          },
          key.current,
        )
      ) {
        setOpen(false);
        key.current = crypto.randomUUID();
        movementId.current = crypto.randomUUID();
        setError("");
      }
    } catch {
      setError(
        "Confira o valor, a data e o saldo separado. Uma retirada não pode deixar a meta negativa.",
      );
    }
  }
  const reversible = history.filter(
    (m) => !m.reverse_of && !history.some((x) => x.reverse_of === m.id),
  );
  return (
    <article className="panel">
      <h3>
        {goal.name} · {goalKinds[goal.kind]}
      </h3>
      <p>
        {goal.active ? "Ativa" : "Inativa"} ·{" "}
        {goal.account_id
          ? (state.accounts.find((a) => a.id === goal.account_id)?.name ??
            "Conta privada")
          : "Origem da reserva a conferir"}
      </p>
      <div className="metrics compact">
        <Metric
          label="Separado"
          value={money(summary.reserved)}
          hint={`${summary.percent.toFixed(1)}% do objetivo`}
        />
        <Metric
          label="Falta para a meta"
          value={money(summary.missing)}
          hint={`Objetivo ${money(goal.target)}`}
        />
      </div>
      <p>
        Prazo desejado: {goal.due_on ?? "Não definido"}. Conclusão estimada:{" "}
        {summary.completion ?? "Histórico insuficiente ou sem ritmo positivo"}.
        Ritmo observado: {money(summary.pace)} por mês, considerando aportes e
        retiradas de até três meses; é uma estimativa, sem promessa de
        rentabilidade.
      </p>
      <button className="text-button" onClick={edit}>
        Editar meta {goal.name}
      </button>
      {goal.active && (
        <button className="secondary" onClick={() => setOpen(!open)}>
          Registrar aporte ou retirada
        </button>
      )}
      {open && (
        <form onSubmit={submit}>
          <Field label="Operação na reserva">
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                key.current = crypto.randomUUID();
                movementId.current = crypto.randomUUID();
              }}
            >
              <option value="deposit">Aporte · já separei dinheiro</option>
              <option value="withdrawal">Retirada · deixei de reservar</option>
              {reversible.length > 0 && (
                <option value="reverse">Estornar registro incorreto</option>
              )}
            </select>
          </Field>
          {direction === "reverse" ? (
            <Field label="Registro a estornar">
              <select name="movement">
                {reversible.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.occurred_on} · {money(m.amount)} · {m.reason}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Valor da reserva (R$)">
              <input name="amount" inputMode="decimal" required />
            </Field>
          )}
          <Field label="Data em que separou ou retirou">
            <input
              type="date"
              name="date"
              min={goal.created_on}
              max={today()}
              required
              defaultValue={today()}
            />
          </Field>
          <Field label="Motivo do registro">
            <input name="reason" minLength={3} maxLength={500} required />
          </Field>
          <p>
            Registra a destinação do dinheiro já existente. Se houve
            transferência entre contas, registre a transferência separadamente
            para manter os saldos corretos.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            Salvar reserva
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        </form>
      )}
      <details>
        <summary>Histórico da reserva {goal.name}</summary>
        <p>
          Inicial declarado: {money(goal.initial)} em {goal.created_on}.
        </p>
        {!history.length ? (
          <p>Sem aportes ou retiradas posteriores.</p>
        ) : (
          <ul>
            {history.map((m) => (
              <li key={m.id}>
                {m.occurred_on}: {money(m.amount)} · {m.reason}
                {m.reverse_of ? " (estorno)" : ""}
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}
