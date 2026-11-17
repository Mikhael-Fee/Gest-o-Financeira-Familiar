import { financialAlerts } from "../domain/alerts";
import { money, remaining, type State } from "../domain/finance";
export default function FinancialAlerts({
  state,
  ownerId,
  house = false,
}: {
  state: State;
  ownerId: string;
  house?: boolean;
}) {
  const alerts = financialAlerts(state, ownerId, house);
  return (
    <section className="panel" aria-label="Avisos financeiros">
      <h2>Avisos financeiros</h2>
      <p>
        {alerts.overdue.length} pendência(s) anterior(es) ·{" "}
        {alerts.upcoming.length} vencimento(s) nos próximos 7 dias ·{" "}
        {alerts.unknown.length} a conferir.
      </p>
      <details>
        <summary>Consultar avisos</summary>
        {[...alerts.overdue, ...alerts.upcoming].map((o) => (
          <p key={o.id}>
            {o.description} · {o.due_on} · {money(remaining(o, state.payments))}{" "}
            · {o.unknown ? "a conferir" : "pagamento pendente"}
          </p>
        ))}
        {alerts.budgets.map(({ budget, summary }) => (
          <p key={budget.category}>
            Orçamento {budget.category}: {money(summary.actual)} de{" "}
            {money(budget.amount)} · aviso configurado em {budget.warning}%.
          </p>
        ))}
        {alerts.unusual.map((c) => (
          <p key={c}>
            Consumo em {c} acima de 150% da mediana dos últimos três meses com
            registros. Confira se os dados estão completos.
          </p>
        ))}
      </details>
      <small>
        Avisos dentro do aplicativo. Não há envio de notificações push ou
        monitoramento com o aplicativo fechado.
      </small>
    </section>
  );
}
