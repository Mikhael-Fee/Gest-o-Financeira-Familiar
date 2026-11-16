import { useState, type FormEvent } from "react";
import {
  money,
  parseMoney,
  remaining,
  today,
  type State,
  type Plan,
} from "../domain/finance";
import { loanModalities, type LoanDetails as Details } from "../domain/loans";
import { Field } from "./ui";
export default function LoanDetails({
  state,
  ownerId,
  onCommand,
}: {
  state: State;
  ownerId: string;
  onCommand: (type: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    plan: Plan & Details,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const cet = String(f.get("cet") ?? "").trim();
      await onCommand("loan_details", {
        id: plan.id,
        version: plan.version ?? 1,
        institution: String(f.get("institution")),
        modality: String(f.get("modality")),
        interest_kind: String(f.get("interest")),
        original_amount: f.get("original")
          ? parseMoney(String(f.get("original")))
          : null,
        cet_basis_points: cet ? parseMoney(cet) : null,
        signed_on: String(f.get("signed_on")) || null,
        contract_notes: String(f.get("notes")),
        cadence_unit: String(f.get("cadence_unit")),
        cadence_count: Number(f.get("cadence_count")),
        apply_calendar: f.has("apply_calendar"),
        anchor_number: Number(f.get("anchor_number")),
        anchor_due: String(f.get("anchor_due")),
        reason: String(f.get("reason")),
      });
      setNotice("Dados contratuais salvos. Nenhum dinheiro foi lançado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Detalhes e periodicidade dos contratos</h2>
      <p>
        Preencha somente o que consta no contrato. Juros e CET desconhecidos
        permanecem desconhecidos; o aplicativo não calcula taxa ou quitação pelo
        valor das parcelas.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {state.plans
        .filter((p) => p.owner_id === ownerId && p.kind !== "purchase")
        .map((raw) => {
          const p = raw as Plan & Details;
          const obligations = state.obligations.filter(
            (o) => o.plan_id === p.id,
          );
          const next = obligations
            .filter((o) => o.due_on && o.due_on >= today())
            .sort((a, b) => a.due_on!.localeCompare(b.due_on!))[0];
          return (
            <details key={p.id}>
              <summary>
                {p.description} · {p.institution || "Instituição não informada"}
              </summary>
              <p>
                Próxima parcela do calendário:{" "}
                {next
                  ? `${next.number}/${p.count} em ${next.due_on}`
                  : "nenhuma data futura conhecida"}
                . Soma em aberto:{" "}
                {money(
                  obligations.reduce(
                    (n, o) => n + remaining(o, state.payments),
                    0,
                  ),
                )}
                ; cotação de quitação:{" "}
                {p.payoff == null ? "não informada" : money(p.payoff)}.
              </p>
              <form onSubmit={(e) => void submit(e, p)}>
                <Field label="Instituição ou credor">
                  <input
                    name="institution"
                    maxLength={160}
                    defaultValue={p.institution ?? ""}
                  />
                </Field>
                <Field label="Modalidade do contrato">
                  <select name="modality" defaultValue={p.modality ?? "other"}>
                    {Object.entries(loanModalities).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Juros do contrato">
                  <select
                    name="interest"
                    defaultValue={p.interest_kind ?? "unknown"}
                  >
                    <option value="unknown">Não sei / não informado</option>
                    <option value="with">Com juros</option>
                    <option value="without">Sem juros</option>
                  </select>
                </Field>
                <Field label="Valor original opcional">
                  <input
                    name="original"
                    inputMode="decimal"
                    defaultValue={
                      p.original_amount == null
                        ? ""
                        : (p.original_amount / 100).toFixed(2)
                    }
                  />
                </Field>
                <Field label="CET anual informado (%) opcional">
                  <input
                    name="cet"
                    inputMode="decimal"
                    defaultValue={
                      p.cet_basis_points == null
                        ? ""
                        : (p.cet_basis_points / 100).toFixed(2)
                    }
                  />
                </Field>
                <Field label="Data de contratação opcional">
                  <input
                    name="signed_on"
                    type="date"
                    max={today()}
                    defaultValue={p.signed_on ?? ""}
                  />
                </Field>
                <Field label="Observações contratuais">
                  <textarea
                    name="notes"
                    maxLength={2000}
                    defaultValue={p.contract_notes ?? ""}
                  />
                </Field>
                <Field label="Unidade da periodicidade">
                  <select
                    name="cadence_unit"
                    defaultValue={p.cadence_unit ?? "months"}
                  >
                    <option value="months">Meses</option>
                    <option value="days">Dias</option>
                  </select>
                </Field>
                <Field label="Intervalo contratual">
                  <input
                    name="cadence_count"
                    type="number"
                    min="1"
                    max="120"
                    defaultValue={p.cadence_count ?? 1}
                    required
                  />
                </Field>
                <label className="check">
                  <input name="apply_calendar" type="checkbox" />
                  Recalcular somente parcelas abertas futuras, sem pagamentos, a
                  partir da âncora abaixo
                </label>
                <p>
                  Parcelas pagas, parciais e vencidas preservam as datas. Para
                  exceção individual, use Conferir / ajustar.
                </p>
                <Field label="Número da parcela âncora">
                  <input
                    name="anchor_number"
                    type="number"
                    min="1"
                    max={p.count}
                    defaultValue={p.calendar_anchor_number ?? next?.number ?? 1}
                  />
                </Field>
                <Field label="Vencimento da parcela âncora">
                  <input
                    name="anchor_due"
                    type="date"
                    min={today()}
                    defaultValue={p.calendar_anchor_due ?? next?.due_on ?? ""}
                  />
                </Field>
                <Field label="Motivo da alteração contratual">
                  <input name="reason" minLength={5} maxLength={500} required />
                </Field>
                <button disabled={busy} className="secondary">
                  Salvar detalhes do contrato
                </button>
              </form>
            </details>
          );
        })}
    </section>
  );
}
