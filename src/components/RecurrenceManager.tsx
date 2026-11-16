import { useState, type FormEvent } from "react";
import { Field, Empty } from "./ui";
import { money, parseMoney, today, type State } from "../domain/finance";
import {
  cadences,
  purchaseSummary,
  type RecurrenceRule,
  type RecurrenceOccurrence,
} from "../domain/recurrence";

type Props = {
  state: State;
  user: { id: string; family_id: string };
  onCommand: (type: string, payload: Record<string, unknown>) => Promise<void>;
  house?: boolean;
};
export function RecurrenceManager({
  state,
  user,
  onCommand,
  house = false,
}: Props) {
  const [mode, setMode] = useState("create"),
    [ruleId, setRuleId] = useState("");
  const [occurrenceId, setOccurrenceId] = useState(""),
    [scope, setScope] = useState("this");
  const [description, setDescription] = useState(""),
    [amount, setAmount] = useState("");
  const [first, setFirst] = useState(today()),
    [category, setCategory] = useState(house ? "Contas da Casa" : "Outros");
  const [cadence, setCadence] = useState("2"),
    [unit, setUnit] = useState("days"),
    [step, setStep] = useState("10");
  const [count, setCount] = useState("12"),
    [variable, setVariable] = useState(false),
    [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [cardId, setCardId] = useState(""),
    [purchaseDate, setPurchaseDate] = useState(today());
  const [parts, setParts] = useState(""),
    [original, setOriginal] = useState(""),
    [interest, setInterest] = useState("unknown");
  const [paidNumbers, setPaidNumbers] = useState(""),
    [paidDate, setPaidDate] = useState(today());
  const rules = (state.recurrences as RecurrenceRule[]).filter(
    (r) => r.owner_id === user.id && r.house === house,
  );
  const rule = rules.find((r) => r.id === ruleId);
  const occurrences = (state.obligations as RecurrenceOccurrence[])
    .filter((o) => o.recurrence_id === ruleId)
    .sort((a, b) => (a.occurrence_index ?? 0) - (b.occurrence_index ?? 0));
  const occurrence = occurrences.find((o) => o.id === occurrenceId);
  const cards = state.cards.filter(
    (c) => c.owner_id === user.id || c.authorized.includes(user.id),
  );
  function selectRule(id: string) {
    setRuleId(id);
    const r = rules.find((r) => r.id === id);
    if (!r) return;
    setDescription(r.description);
    setAmount((r.amount / 100).toFixed(2));
    setCategory(r.category ?? "Outros");
    setVariable(r.variable);
    const index = cadences.findIndex(
      (c) =>
        c.unit === (r.interval_unit ?? "months") &&
        c.step === (r.interval_count ?? 1),
    );
    setCadence(index < 0 ? "custom" : String(index));
    setUnit(r.interval_unit ?? "months");
    setStep(String(r.interval_count ?? 1));
    const o = (state.obligations as RecurrenceOccurrence[])
      .filter((o) => o.recurrence_id === id && !o.cancelled_on)
      .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))
      .find((o) => o.due_on && o.due_on >= today());
    setOccurrenceId(o?.id ?? "");
    setFirst(o?.due_on ?? today());
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const selected = cadences[Number(cadence)];
      const payload: Record<string, unknown> = {
        id:
          mode === "create" || mode === "purchase"
            ? crypto.randomUUID()
            : ruleId,
        description,
        amount: mode === "generate" ? 0 : parseMoney(amount || "0"),
        date: first,
        house,
        category,
        variable,
        interval_unit: cadence === "custom" ? unit : selected?.unit,
        interval_count: cadence === "custom" ? Number(step) : selected?.step,
        count: Number(count),
      };
      if (mode === "edit")
        Object.assign(payload, {
          version: rule?.version ?? 1,
          scope,
          occurrence_id: occurrenceId,
          occurrence_version: occurrence?.version,
          from_index:
            occurrence?.occurrence_index ??
            Number(occurrence?.id.split(":").at(-1) ?? 0),
          reason,
          cancel,
        });
      if (mode === "generate")
        Object.assign(payload, { version: rule?.version ?? 1 });
      if (mode === "purchase") {
        const amounts = parts
          .split(/[;\n]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .map(parseMoney);
        const sum = purchaseSummary(
          amounts,
          original ? parseMoney(original) : null,
        );
        const numbers = paidNumbers.trim()
          ? paidNumbers.split(",").map((x) => Number(x.trim()))
          : [];
        if (
          numbers.some(
            (n) => !Number.isInteger(n) || n < 1 || n > amounts.length,
          ) ||
          new Set(numbers).size !== numbers.length
        )
          throw Error("Confira os números das parcelas pagas.");
        Object.assign(payload, {
          kind: "expense",
          amount: sum.total,
          amounts,
          original_amount: sum.original,
          first_due: first,
          occurred_on: purchaseDate,
          card_id: cardId,
          consumer_id: user.id,
          responsible_id: user.id,
          interest_kind: interest,
          splits: [],
          history: numbers.map((number) => ({
            number,
            amount: amounts[number - 1],
            paid_on: paidDate,
          })),
        });
      }
      await onCommand(
        mode === "create"
          ? "recurrence_v2"
          : mode === "edit"
            ? "recurrence_edit"
            : mode === "purchase"
              ? "purchase_v2"
              : "generate_v2",
        payload,
      );
      setMessage(
        "Operação salva. Histórico e pagamentos existentes foram preservados.",
      );
      if (mode === "create" || mode === "purchase") {
        setDescription("");
        setAmount("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  let purchaseTotal: string | undefined;
  try {
    if (parts.trim()) {
      const summary = purchaseSummary(
        parts
          .split(/[;\n]+/)
          .map((x) => x.trim())
          .filter(Boolean)
          .map(parseMoney),
        original ? parseMoney(original) : null,
      );
      purchaseTotal = `Total contratado: ${money(summary.total)}${summary.difference !== null ? ` · Diferença para o preço original: ${money(summary.difference)}` : ""}`;
    }
  } catch {
    /* Errors are shown on submit without discarding input. */
  }
  return (
    <section className="panel">
      <h2>Recorrências e compras parceladas</h2>
      <p>
        Previsões não movimentam saldo. Alterações da regra preservam
        ocorrências passadas e pagas; valores variáveis precisam ser conferidos
        antes de pagar.
      </p>
      <form onSubmit={submit}>
        <Field label="Operação do calendário">
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setError("");
              setMessage("");
            }}
          >
            <option value="create">Nova conta recorrente</option>
            <option value="edit">Editar recorrência</option>
            <option value="generate">Ampliar calendário</option>
            {!house && (
              <option value="purchase">Compra parcelada detalhada</option>
            )}
          </select>
        </Field>
        {(mode === "edit" || mode === "generate") && (
          <>
            <Field label="Recorrência para gerenciar">
              <select
                required
                value={ruleId}
                onChange={(e) => selectRule(e.target.value)}
              >
                <option value="">Selecione</option>
                {rules.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.description}
                    {!r.active ? " · Inativa" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {!rules.length && (
              <Empty>Ainda não há recorrências suas nesta visão.</Empty>
            )}
          </>
        )}
        {mode === "edit" && (
          <>
            <Field label="Alcance da alteração">
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="this">Somente esta ocorrência</option>
                <option value="next">Esta e as próximas em aberto</option>
                <option value="rule">
                  Regra futura, preservando exceções individuais
                </option>
              </select>
            </Field>
            <Field label="Ocorrência de referência">
              <select
                required
                value={occurrenceId}
                onChange={(e) => {
                  setOccurrenceId(e.target.value);
                  const o = occurrences.find((o) => o.id === e.target.value);
                  if (o) {
                    setFirst(o.due_on ?? today());
                    setAmount((o.amount / 100).toFixed(2));
                    setDescription(o.description);
                  }
                }}
              >
                <option value="">Selecione</option>
                {occurrences.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.due_on} · {money(o.amount)}
                    {o.cancelled_on ? " · Cancelada" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motivo da alteração">
              <input
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={cancel}
                onChange={(e) => setCancel(e.target.checked)}
              />{" "}
              Cancelar ocorrência ou encerrar a regra futura
            </label>
          </>
        )}
        {mode !== "generate" && (
          <>
            <Field label="Descrição do compromisso">
              <input
                required
                maxLength={120}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="Categoria do compromisso">
              <input
                required
                maxLength={80}
                list="recurrence-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Field>
            <datalist id="recurrence-categories">
              {[
                "Contas da Casa",
                "Alimentação",
                "Transporte",
                "Moradia",
                "Saúde",
                "Educação",
                "Lazer",
                "Assinaturas",
                "Financeiro",
                "Outros",
                ...state.categories
                  .filter((c) => c.owner_id === user.id && c.active)
                  .map((c) => c.name),
              ].map((name, i) => (
                <option key={`${name}:${i}`} value={name} />
              ))}
            </datalist>
            <Field
              label={
                mode === "purchase"
                  ? "Primeira cobrança da compra"
                  : "Vencimento de referência"
              }
            >
              <input
                required
                type="date"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
              />
            </Field>
          </>
        )}
        {mode !== "purchase" && mode !== "generate" && (
          <>
            <Field label="Valor previsto em reais">
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={variable}
                onChange={(e) => setVariable(e.target.checked)}
              />{" "}
              Valor variável: estimativa pelo histórico, a conferir
            </label>
            {(mode === "create" || scope !== "this") && (
              <>
                <Field label="Periodicidade">
                  <select
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                  >
                    {cadences.map((c, i) => (
                      <option key={c.name} value={i}>
                        {c.name}
                      </option>
                    ))}
                    <option value="custom">Personalizada</option>
                  </select>
                </Field>
                {cadence === "custom" && (
                  <>
                    <Field label="Unidade do intervalo">
                      <select
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                      >
                        <option value="days">Dias</option>
                        <option value="months">Meses</option>
                      </select>
                    </Field>
                    <Field label="Quantidade por intervalo">
                      <input
                        required
                        type="number"
                        min={1}
                        max={366}
                        value={step}
                        onChange={(e) => setStep(e.target.value)}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
          </>
        )}
        {(mode === "create" || mode === "generate") && (
          <Field label="Total de ocorrências no calendário">
            <input
              required
              type="number"
              min={1}
              max={600}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </Field>
        )}
        {mode === "purchase" && (
          <>
            <Field label="Cartão da compra">
              <select
                required
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
              >
                <option value="">Selecione</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data original da compra">
              <input
                required
                type="date"
                max={today()}
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </Field>
            <Field label="Valores de cada parcela em reais, um por linha">
              <textarea
                required
                rows={5}
                placeholder={"130,00\n130,00\n140,00"}
                value={parts}
                onChange={(e) => setParts(e.target.value)}
              />
            </Field>
            {purchaseTotal && <p>{purchaseTotal}</p>}
            <Field label="Preço original à vista, se conhecido">
              <input
                inputMode="decimal"
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
              />
            </Field>
            <Field label="Juros da compra">
              <select
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              >
                <option value="unknown">Não sei</option>
                <option value="none">Sem juros</option>
                <option value="included">Juros incluídos nas prestações</option>
              </select>
            </Field>
            <details>
              <summary>
                Compra em andamento: confirmar histórico individual
              </summary>
              <p>
                Somente as parcelas explicitamente indicadas serão confirmadas,
                sem criar débito bancário retroativo. Deixe em branco o que não
                conferiu.
              </p>
              <Field label="Números das parcelas integralmente pagas, separados por vírgula">
                <input
                  value={paidNumbers}
                  onChange={(e) => setPaidNumbers(e.target.value)}
                  placeholder="1, 3"
                />
              </Field>
              <Field label="Data efetiva dos pagamentos históricos indicados">
                <input
                  type="date"
                  max={today()}
                  value={paidDate}
                  onChange={(e) => setPaidDate(e.target.value)}
                />
              </Field>
            </details>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar calendário"}
        </button>
      </form>
    </section>
  );
}
