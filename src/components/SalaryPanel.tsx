import { useRef, useState, type FormEvent } from "react";
import {
  incomeForMonth,
  money,
  parseMoney,
  today,
  type State,
} from "../domain/finance";
import type { Command } from "../data/store";
import { Field, Metric } from "./ui";
type Props = {
  state: State;
  ownerId: string;
  month: string;
  busy: boolean;
  onCommand: (
    type: Command["type"],
    payload: Command["payload"],
    key?: string,
  ) => Promise<boolean>;
  onAddReceipt: () => void;
};
export default function SalaryPanel({
  state,
  ownerId,
  month,
  busy,
  onCommand,
  onAddReceipt,
}: Props) {
  const income = incomeForMonth(state, ownerId, month);
  const [mode, setMode] = useState<"forecast" | "receipt" | null>(null),
    [receiptId, setReceiptId] = useState(income.receipts[0]?.id ?? ""),
    [error, setError] = useState("");
  const requestKey = useRef(crypto.randomUUID());
  const receipt =
    income.receipts.find((e) => e.id === receiptId) ?? income.receipts[0];
  function open(next: "forecast" | "receipt") {
    requestKey.current = crypto.randomUUID();
    setMode(next);
    setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      let saved = false;
      if (mode === "forecast") {
        const current = state.income_months.find(
          (x) => x.owner_id === ownerId && x.month === month,
        );
        const reference = state.income_references.find(
          (x) => x.owner_id === ownerId && x.effective_month === month,
        );
        saved = await onCommand(
          "income_month",
          {
            month,
            expected: parseMoney(String(f.get("amount"))),
            future: f.get("future") === "on",
            version: current?.version ?? 0,
            reference_version: reference?.version ?? 0,
          },
          requestKey.current,
        );
      } else if (receipt)
        saved = await onCommand(
          "income_edit",
          {
            id: receipt.id,
            version: receipt.version,
            amount: parseMoney(String(f.get("amount"))),
            occurred_on: String(f.get("date")),
            salary_month: String(f.get("salary_month")),
            account_id: String(f.get("account")),
          },
          requestKey.current,
        );
      if (saved) setMode(null);
    } catch {
      setError("Confira o valor e as datas antes de salvar.");
    }
  }
  return (
    <section className="panel salary-panel">
      <div className="section-heading">
        <div>
          <h2>Salário por mês · {month}</h2>
          <p>
            Previsão e recebimento são independentes. Ajustar uma previsão não
            altera seu saldo.
          </p>
        </div>
      </div>
      <div className="metrics compact">
        <Metric
          label="Salário previsto"
          value={money(income.expected)}
          hint="Referência ou ajuste específico deste mês"
        />
        <Metric
          label="Salário recebido"
          value={money(income.received)}
          hint={
            income.estimated
              ? "Ainda sem confirmação"
              : "Substitui a previsão no planejamento"
          }
          positive
        />
        <Metric
          label="Extras recebidos"
          value={money(income.extras)}
          hint="Separados do salário-base"
        />
      </div>
      <div className="salary-actions">
        <button className="secondary" onClick={() => open("forecast")}>
          Ajustar previsão do mês
        </button>
        <button className="secondary" onClick={onAddReceipt}>
          Registrar salário recebido
        </button>
        {income.receipts.some((e) => e.splits.length === 1) && (
          <button className="text-button" onClick={() => open("receipt")}>
            Corrigir recebimento
          </button>
        )}
      </div>
      {mode && (
        <form
          onSubmit={submit}
          key={`${mode}:${receipt?.id}:${receipt?.version}`}
        >
          <h3>
            {mode === "forecast"
              ? "Ajuste de previsão"
              : "Correção de recebimento confirmado"}
          </h3>
          {mode === "receipt" && (
            <Field label="Recebimento">
              <select
                aria-label="Recebimento"
                value={receipt?.id ?? ""}
                onChange={(e) => setReceiptId(e.target.value)}
              >
                {income.receipts
                  .filter((e) => e.splits.length === 1)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.description} · {e.occurred_on} · {money(e.amount)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field
            label={
              mode === "forecast"
                ? "Previsão deste mês (R$)"
                : "Valor efetivamente recebido (R$)"
            }
          >
            <input
              aria-label={
                mode === "forecast"
                  ? "Previsão deste mês (R$)"
                  : "Valor efetivamente recebido (R$)"
              }
              name="amount"
              inputMode="decimal"
              required
              pattern="[0-9]+([,.][0-9]{1,2})?"
              defaultValue={String(
                (mode === "forecast"
                  ? income.expected
                  : (receipt?.amount ?? 0)) / 100,
              ).replace(".", ",")}
            />
          </Field>
          {mode === "forecast" ? (
            <label className="checkbox">
              <input type="checkbox" name="future" /> Usar também como
              referência dos próximos meses, preservando o histórico e outros
              ajustes mensais
            </label>
          ) : (
            <>
              <Field label="Data efetiva do recebimento">
                <input
                  aria-label="Data efetiva do recebimento"
                  type="date"
                  name="date"
                  required
                  max={today()}
                  defaultValue={receipt?.occurred_on}
                />
              </Field>
              <Field label="Mês salarial / competência">
                <input
                  aria-label="Mês salarial / competência"
                  type="month"
                  name="salary_month"
                  required
                  defaultValue={receipt?.salary_month ?? month}
                />
              </Field>
              <Field label="Conta que recebeu">
                <select
                  aria-label="Conta que recebeu"
                  name="account"
                  required
                  defaultValue={receipt?.splits[0]?.account_id}
                >
                  {state.accounts
                    .filter(
                      (a) =>
                        a.owner_id === ownerId &&
                        ["bank", "cash"].includes(a.kind),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <p className="muted">
                Esta correção substitui o registro anterior, com auditoria. Não
                cria um segundo recebimento.
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy
              ? "Salvando…"
              : mode === "forecast"
                ? "Salvar previsão"
                : "Salvar correção"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setMode(null)}
          >
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}
