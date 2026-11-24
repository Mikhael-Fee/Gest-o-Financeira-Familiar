import { ArrowDownLeft, ChevronRight, Plus, Wallet } from "lucide-react";
import { availableMoney, nextSalaryDate } from "../domain/availability";
import {
  contribution,
  money,
  remaining,
  status,
  today,
  totals,
  type State,
} from "../domain/finance";
import type { Command } from "../data/store";
import FinancialAlerts from "./FinancialAlerts";
import AvailabilityPanel from "./AvailabilityPanel";
import { Badge, Empty, Metric } from "./ui";
export const shortDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value + "T12:00:00Z"));
type Props = {
  state: State;
  ownerId: string;
  month: string;
  busy: boolean;
  onForm: (form: string) => void;
  onNavigate: (path: string) => void;
  onCommand: (
    type: Command["type"],
    payload: Command["payload"],
    key?: string,
  ) => Promise<boolean>;
};
export default function FinancialHome({
  state,
  ownerId,
  month,
  busy,
  onForm,
  onNavigate,
  onCommand,
}: Props) {
  const asOf = today(),
    until = nextSalaryDate(state, ownerId, asOf),
    view = availableMoney(state, ownerId, until, asOf);
  const open = state.obligations.filter(
    (o) => o.owner_id === ownerId && remaining(o, state.payments) > 0,
  );
  const known = open
    .filter((o) => o.due_on && !o.unknown)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!));
  const future = known.filter((o) => o.due_on! >= asOf),
    overdue = known.filter((o) => o.due_on! < asOf),
    unknown = open.filter((o) => o.unknown || !o.due_on);
  const recent = state.entries
    .filter(
      (e) =>
        !e.voided &&
        e.consumer_id === ownerId &&
        e.occurred_on.startsWith(month),
    )
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
    .slice(0, 3);
  const monthly = totals(state, month, ownerId),
    house = contribution(state, ownerId, month);
  return (
    <div className="financial-home">
      <section className="home-summary" aria-label="Resumo do meu dinheiro">
        <p className="home-summary-label">
          Disponível estimado até {shortDate(until)}
        </p>
        <p className="home-available">{money(view.free)}</p>
        <Badge tone={view.incomplete ? "warning" : "positive"}>
          {view.incomplete
            ? "Estimativa a conferir"
            : "Com os saldos que você conferiu"}
        </Badge>
        <button className="primary full" onClick={() => onForm("expense")}>
          <Plus size={22} />
          Registrar gasto
        </button>
        <dl className="home-figures">
          <div>
            <dt>Saldo registrado</dt>
            <dd>{money(view.bank)}</dd>
          </div>
          <div>
            <dt>Compromissos até {shortDate(until)}</dt>
            <dd>{money(view.obligations + view.pendingSettlements)}</dd>
          </div>
        </dl>
        <p className="home-benefit">
          <Wallet size={19} />
          <span>
            VA/VR: <strong>{money(view.benefits)}</strong> · separado do
            dinheiro.
          </span>
        </p>
        {(view.savings > 0 || view.reservedOutsideHorizon > 0) && (
          <p className="form-help">
            Reservas e outros valores comprometidos também reduzem esta
            estimativa. Confira a composição em “Entender minha estimativa”.
          </p>
        )}
        {view.incomplete && (
          <p className="form-help">
            Confira saldos e informações pendentes antes de decidir um gasto.
          </p>
        )}
      </section>
      <div className="home-actions">
        <button className="secondary" onClick={() => onForm("income")}>
          <ArrowDownLeft size={20} />
          Registrar entrada
        </button>
        <button className="text-button" onClick={() => onForm("choose")}>
          Mais registros
          <ChevronRight size={18} />
        </button>
      </div>
      {!state.accounts.some((a) => a.owner_id === ownerId) && (
        <section className="panel">
          <h2>Comece pelo seu saldo</h2>
          <p>
            Adicione uma conta com o valor e a data que você conhece. Pode
            completar o restante depois.
          </p>
          <button className="secondary" onClick={() => onForm("account")}>
            Adicionar minha primeira conta
          </button>
        </section>
      )}
      <div className="home-columns">
        <section className="panel" aria-label="Próximos pagamentos">
          <div className="section-heading">
            <div>
              <h2>Próximos pagamentos</h2>
              <p>Valores ainda em aberto. Pagar não cria outra despesa.</p>
            </div>
          </div>
          {future.length ? (
            future.slice(0, 3).map((o) => (
              <div className="entry-row" key={o.id}>
                <div className="entry-info">
                  <strong>{o.description}</strong>
                  <small>
                    Vence {shortDate(o.due_on!)} · {status(o, state.payments)}
                  </small>
                </div>
                <div className="align-right">
                  <strong>{money(remaining(o, state.payments))}</strong>
                  <button
                    className="text-button"
                    onClick={() => onForm(`pay:${o.id}`)}
                    aria-label={`Pagar ${o.description}`}
                  >
                    Pagar
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty>
              Nenhum próximo vencimento confirmado nos seus registros.
            </Empty>
          )}
          {(overdue.length > 0 || unknown.length > 0) && (
            <p className="form-help">
              {overdue.length > 0
                ? `${overdue.length} vencimento(s) anterior(es) sem quitação. `
                : ""}
              {unknown.length > 0
                ? `${unknown.length} parcela(s) ou informação(ões) a conferir.`
                : ""}
            </p>
          )}
          <button
            className="text-button"
            onClick={() => onNavigate("/planejamento")}
          >
            Ver todos os compromissos
            <ChevronRight size={18} />
          </button>
        </section>
        <section className="panel" aria-label="Últimas movimentações">
          <div className="section-heading">
            <div>
              <h2>Últimas movimentações</h2>
              <p>Registros do mês escolhido.</p>
            </div>
          </div>
          {recent.length ? (
            recent.map((e) => (
              <div className="entry-row" key={e.id}>
                <div className="entry-info">
                  <strong>{e.description}</strong>
                  <small>
                    {shortDate(e.occurred_on)} · {e.house ? "Casa" : e.category}
                  </small>
                </div>
                <strong>
                  {e.kind === "expense" ? "−" : "+"}
                  {money(e.amount)}
                </strong>
              </div>
            ))
          ) : (
            <Empty>Ainda não há movimentações neste mês.</Empty>
          )}
          <button
            className="text-button"
            onClick={() => onNavigate("/movimentacoes")}
          >
            Ver histórico completo
            <ChevronRight size={18} />
          </button>
        </section>
      </div>
      <details className="detail-disclosure">
        <summary>Entender minha estimativa e conferir saldos</summary>
        <FinancialAlerts state={state} ownerId={ownerId} />
        <AvailabilityPanel
          state={state}
          ownerId={ownerId}
          busy={busy}
          onCommand={onCommand}
        />
      </details>
      <details className="detail-disclosure">
        <summary>Resumo do mês e minha contribuição à Casa</summary>
        <div className="metrics compact">
          <Metric
            label="Entradas do mês"
            value={money(monthly.income)}
            hint="Receitas confirmadas; não inclui Pix de acerto"
          />
          <Metric
            label="Consumo do mês"
            value={money(monthly.consumption)}
            hint="Total atribuído a você, incluindo Casa, antes de reembolsos"
          />
          <Metric
            label="Minha contribuição"
            value={money(house.actual)}
            hint="Dinheiro efetivamente fornecido à Casa; diferente do consumo"
          />
        </div>
        <button
          className="text-button"
          onClick={() => onNavigate("/relatorios")}
        >
          Abrir relatórios
        </button>
      </details>
    </div>
  );
}
