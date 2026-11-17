import { useState, type FormEvent } from "react";
import { money, parseMoney, type State, type Card } from "../domain/finance";
import { cardLimit } from "../domain/cards";
import { Field } from "./ui";
export default function CardManager({
  state,
  ownerId,
  onCommand,
}: {
  state: State;
  ownerId: string;
  onCommand: (type: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    card: Card,
    action: string,
  ) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const p: Record<string, unknown> = {
        card_id: card.id,
        reason: String(f.get("reason")),
      };
      if (action === "card_settings")
        Object.assign(p, {
          closing: Number(f.get("closing")),
          due: Number(f.get("due")),
          credit_limit: f.get("limit")
            ? parseMoney(String(f.get("limit")))
            : null,
          version: card.version ?? 1,
        });
      else if (action === "card_cycle") {
        const month = String(f.get("month"));
        Object.assign(p, {
          month,
          closing_on: String(f.get("closing_on")),
          due_on: String(f.get("due_on")),
          version:
            state.card_cycles?.find(
              (c) => c.card_id === card.id && c.month === month,
            )?.version ?? 0,
        });
      } else {
        const o = state.obligations.find((o) => o.id === f.get("id"));
        if (!o) throw Error("Selecione a parcela.");
        Object.assign(p, {
          id: o.id,
          due_on: String(f.get("due_on")),
          version: o.version,
        });
      }
      await onCommand(action, p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Limites e calendário do cartão</h2>
      <p>
        Limites são estimativas. Ajustes de calendário não alteram datas de
        pagamentos já registrados.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {state.cards
        .filter((c) => c.owner_id === ownerId)
        .map((c) => {
          const estimate = cardLimit(c, state);
          return (
            <details key={c.id}>
              <summary>
                {c.name} · limite disponível estimado:{" "}
                {estimate.available == null
                  ? "não informado"
                  : money(estimate.available)}
              </summary>
              <p>
                Comprometido em parcelas abertas: {money(estimate.committed)}.
                Confira o limite real no banco.
              </p>
              <form onSubmit={(e) => void submit(e, c, "card_settings")}>
                <h3>Configuração para novas compras</h3>
                <Field label="Dia de fechamento">
                  <input
                    name="closing"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={c.closing}
                    required
                  />
                </Field>
                <Field label="Dia de vencimento">
                  <input
                    name="due"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue={c.due}
                    required
                  />
                </Field>
                <Field label="Limite total opcional">
                  <input
                    name="limit"
                    inputMode="decimal"
                    defaultValue={
                      c.credit_limit == null
                        ? ""
                        : (c.credit_limit / 100).toFixed(2)
                    }
                  />
                </Field>
                <Field label="Motivo da configuração">
                  <input name="reason" required />
                </Field>
                <button disabled={busy} className="secondary">
                  Salvar configuração do cartão
                </button>
              </form>
              <form onSubmit={(e) => void submit(e, c, "card_cycle")}>
                <h3>Exceção de um ciclo</h3>
                <p>
                  Usada nas novas compras. Para parcelas já registradas, use a
                  reatribuição abaixo.
                </p>
                <Field label="Mês de fechamento">
                  <input name="month" type="month" required />
                </Field>
                <Field label="Fechamento real">
                  <input name="closing_on" type="date" required />
                </Field>
                <Field label="Vencimento real">
                  <input name="due_on" type="date" required />
                </Field>
                <Field label="Motivo da exceção">
                  <input name="reason" required />
                </Field>
                <button disabled={busy} className="secondary">
                  Salvar exceção do ciclo
                </button>
              </form>
              <form onSubmit={(e) => void submit(e, c, "card_reassign")}>
                <h3>Reatribuir uma parcela à fatura correta</h3>
                <Field label="Parcela para reatribuir">
                  <select name="id" required>
                    <option value="">Selecione</option>
                    {state.obligations
                      .filter((o) => o.card_id === c.id && !o.replaced_by)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.description} · {o.due_on}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Novo vencimento da fatura">
                  <input name="due_on" type="date" required />
                </Field>
                <Field label="Motivo da reatribuição">
                  <input name="reason" required />
                </Field>
                <button disabled={busy} className="secondary">
                  Confirmar reatribuição auditada
                </button>
              </form>
            </details>
          );
        })}
    </section>
  );
}
