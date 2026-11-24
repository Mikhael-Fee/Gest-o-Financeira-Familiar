import { CreditCard as CardIcon } from "lucide-react";
import {
  addMonths,
  money,
  remaining,
  status,
  today,
  type Card,
  type Obligation,
  type State,
} from "../domain/finance";
import { paydayForMonth } from "../domain/availability";
import type { Identity } from "../data/store";
import { Badge, Empty } from "./ui";
import { shortDate } from "./FinancialHome";
function closingDate(card: Card, state: State, due: string) {
  const exception = state.card_cycles?.find(
    (c) => c.card_id === card.id && c.due_on === due,
  );
  if (exception) return exception.closing_on;
  const month = addMonths(
    due.slice(0, 7) + "-01",
    card.due <= card.closing ? -1 : 0,
  ).slice(0, 7);
  return paydayForMonth(month, card.closing);
}
function label(
  card: Card,
  state: State,
  lines: Obligation[],
  due: string | null,
) {
  if (!lines.length) return "Sem fatura neste mês";
  if (lines.every((o) => o.replaced_by)) return "Saldo transportado";
  if (lines.every((o) => o.cancelled_on)) return "Cancelada";
  const active = lines.filter((o) => !o.replaced_by && !o.cancelled_on),
    left = active.reduce((n, o) => n + remaining(o, state.payments), 0),
    total = active.reduce((n, o) => n + o.amount, 0);
  if (!active.length) return "Sem cobrança ativa · consulte o histórico";
  if (!left) return "Quitada";
  if (left < total) return "Parcialmente paga";
  if (!due) return "Data a conferir";
  if (due < today()) return "Vencida · pagamento não confirmado";
  return today() <= closingDate(card, state, due)
    ? "Aberta pelo calendário cadastrado"
    : "Fechada pelo calendário cadastrado";
}
export default function CreditCards({
  state,
  user,
  month,
  onForm,
}: {
  state: State;
  user: Identity;
  month: string;
  onForm: (form: string) => void;
}) {
  return (
    <section className="panel" aria-label="Seus cartões de crédito">
      <div className="section-heading">
        <div>
          <h2>Cartões de crédito</h2>
          <p>Receber um Pix e pagar a fatura são etapas diferentes.</p>
        </div>
        <button className="secondary" onClick={() => onForm("card")}>
          Adicionar cartão
        </button>
      </div>
      {!state.cards.length && (
        <Empty>
          Cadastre um cartão ou peça ao titular para autorizar seu acesso.
        </Empty>
      )}
      {state.cards.map((card) => {
        const rows = state.obligations.filter((o) => o.card_id === card.id),
          monthly = rows.filter((o) => o.due_on?.startsWith(month)),
          due = monthly.find((o) => o.due_on)?.due_on ?? null;
        const owner = card.owner_id === user.id,
          caption = label(card, state, monthly, due);
        return (
          <article className="card-detail" key={card.id}>
            <CardIcon />
            <div>
              <h3>{card.name}</h3>
              <p>
                Fecha dia {card.closing} · Vence dia {card.due}
              </p>
              <small>
                {owner ? "Você é titular" : "Você é usuário autorizado"} ·
                compras conforme suas permissões
              </small>
              <p className="card-value">
                <strong>
                  {money(
                    monthly.reduce(
                      (n, o) => n + remaining(o, state.payments),
                      0,
                    ),
                  )}
                </strong>
                <span>
                  {owner
                    ? "em aberto no mês escolhido"
                    : "da sua parte visível no mês"}
                </span>
              </p>
              <Badge
                tone={
                  caption === "Quitada"
                    ? "positive"
                    : caption.includes("Vencida") || caption.includes("Parcial")
                      ? "warning"
                      : undefined
                }
              >
                {caption}
              </Badge>
              {owner && (
                <button
                  className="text-button"
                  onClick={() => onForm(`permission:${card.id}`)}
                >
                  Gerenciar autorização
                </button>
              )}
              <details>
                <summary>Ver faturas, compras e parcelas</summary>
                <div className="statement-grid">
                  {[...new Set(rows.map((o) => o.due_on))]
                    .sort()
                    .map((date) => {
                      const lines = rows.filter((o) => o.due_on === date),
                        left = lines.reduce(
                          (n, o) => n + remaining(o, state.payments),
                          0,
                        );
                      return (
                        <div key={date ?? "unknown"}>
                          <strong>
                            {owner ? "Fatura integral" : "Suas parcelas"} ·{" "}
                            {date ? shortDate(date) : "Data a conferir"}
                          </strong>
                          <Badge
                            tone={
                              left === 0 && !lines.some((o) => o.replaced_by)
                                ? "positive"
                                : "warning"
                            }
                          >
                            {label(card, state, lines, date)}
                          </Badge>
                          <span>
                            Total registrado:{" "}
                            {money(lines.reduce((n, o) => n + o.amount, 0))}
                          </span>
                          <span>
                            Pago ao banco:{" "}
                            {money(
                              lines.reduce(
                                (n, o) =>
                                  n +
                                  o.confirmed +
                                  state.payments
                                    .filter(
                                      (p) =>
                                        p.obligation_id === o.id &&
                                        !p.reversed_on,
                                    )
                                    .reduce((v, p) => v + p.amount, 0),
                                0,
                              ),
                            )}
                          </span>
                          <b>Em aberto: {money(left)}</b>
                          {lines.some((o) => o.replaced_by) && (
                            <small>
                              Saldo transportado / renegociado · não é quitação
                            </small>
                          )}
                          <small>
                            Calendário informado, sujeito à conferência no
                            banco. Pix de acerto é acompanhado separadamente.
                          </small>
                          <details>
                            <summary>Compras e parcelas desta fatura</summary>
                            {lines.map((o) => (
                              <div className="entry-row" key={o.id}>
                                <div className="entry-info">
                                  <strong>{o.description}</strong>
                                  <small>{status(o, state.payments)}</small>
                                </div>
                                <strong>
                                  {money(remaining(o, state.payments))}
                                </strong>
                                {remaining(o, state.payments) > 0 &&
                                  (o.owner_id === user.id || o.house) && (
                                    <button
                                      className="text-button"
                                      onClick={() => onForm(`pay:${o.id}`)}
                                    >
                                      Registrar pagamento
                                    </button>
                                  )}
                              </div>
                            ))}
                          </details>
                        </div>
                      );
                    })}
                </div>
              </details>
            </div>
          </article>
        );
      })}
    </section>
  );
}
