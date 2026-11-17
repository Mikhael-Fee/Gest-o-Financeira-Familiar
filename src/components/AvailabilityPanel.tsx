import { useRef, useState, type FormEvent } from "react";
import type { Command } from "../data/store";
import {
  balance,
  money,
  parseMoney,
  remaining,
  today,
  type State,
} from "../domain/finance";
import {
  addDays,
  availableMoney,
  nextSalaryDate,
  type FutureReceipt,
  type IncomePlanningState,
} from "../domain/availability";
import { Field, Metric } from "./ui";
type Props = {
  state: State;
  ownerId: string;
  busy: boolean;
  onCommand: (
    type: Command["type"],
    payload: Command["payload"],
    key?: string,
  ) => Promise<boolean>;
};
export default function AvailabilityPanel({
  state,
  ownerId,
  busy,
  onCommand,
}: Props) {
  const s = state as IncomePlanningState;
  const [horizon, setHorizon] = useState("salary"),
    [mode, setMode] = useState<"future" | "confirm" | "reserve" | null>(null),
    [selected, setSelected] = useState<FutureReceipt | null>(null),
    [error, setError] = useState("");
  const requestKey = useRef(crypto.randomUUID()),
    draftId = useRef(crypto.randomUUID());
  const asOf = today(),
    until =
      horizon === "salary"
        ? nextSalaryDate(state, ownerId, asOf)
        : addDays(asOf, Number(horizon));
  const view = availableMoney(s, ownerId, until, asOf);
  const accounts = state.accounts.filter((a) => a.owner_id === ownerId);
  const receipts = (s.future_receipts ?? [])
    .filter((r) => r.owner_id === ownerId)
    .sort((a, b) => a.expected_on.localeCompare(b.expected_on));
  function open(next: typeof mode, item: FutureReceipt | null = null) {
    setMode(next);
    setSelected(item);
    setError("");
    requestKey.current = crypto.randomUUID();
    draftId.current = crypto.randomUUID();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      let ok = false;
      if (mode === "future")
        ok = await onCommand(
          "future_receipt",
          {
            id: selected?.id ?? draftId.current,
            version: selected?.version ?? 0,
            description: String(f.get("description")),
            amount: parseMoney(String(f.get("amount"))),
            expected_on: String(f.get("date")),
            month: String(f.get("month")),
            kind: String(f.get("kind")),
            certainty: String(f.get("certainty")),
            account_id: String(f.get("account")) || null,
          },
          requestKey.current,
        );
      if (mode === "confirm" && selected)
        ok = await onCommand(
          "confirm_future_receipt",
          {
            id: selected.id,
            version: selected.version,
            date: String(f.get("date")),
            amount: parseMoney(String(f.get("amount"))),
            account_id: String(f.get("account")),
          },
          requestKey.current,
        );
      if (mode === "reserve") {
        const id = String(f.get("obligation")),
          old = (s.obligation_reservations ?? []).find(
            (r) => r.obligation_id === id,
          );
        ok = await onCommand(
          "reserve_obligation",
          {
            obligation_id: id,
            account_id: String(f.get("account")),
            amount: parseMoney(String(f.get("amount"))),
            version: old?.version ?? 0,
          },
          requestKey.current,
        );
      }
      if (ok) open(null);
    } catch {
      setError(
        "Confira o valor, as datas e a conta. Os campos foram preservados.",
      );
    }
  }
  return (
    <section className="panel" aria-label="Dinheiro disponível estimado">
      <h2>Quanto posso gastar?</h2>
      <p>
        Estimativa com os registros de hoje. Reservar identifica dinheiro já
        existente; não cria débito nem receita.
      </p>
      <Field label="Horizonte do disponível">
        <select value={horizon} onChange={(e) => setHorizon(e.target.value)}>
          <option value="salary">Até o próximo salário</option>
          <option value="30">Próximos 30 dias</option>
          <option value="60">Próximos 60 dias</option>
          <option value="90">Próximos 90 dias</option>
        </select>
      </Field>
      <p>
        De {asOf} até {until}, incluindo pendências anteriores.
      </p>
      <div className="metrics compact">
        <Metric
          label="Saldo bancário registrado"
          value={money(view.bank)}
          hint={
            view.staleAccounts.length
              ? `${view.staleAccounts.length} conta(s) a conferir; veja a última conferência abaixo`
              : "Conferido pelo usuário; sem conexão automática ao banco"
          }
        />
        <Metric
          label="Disponível estimado sem receitas futuras"
          value={money(view.free)}
          hint={
            view.incomplete
              ? "Informação incompleta; confira as ressalvas abaixo"
              : "Após compromissos e valores separados informados"
          }
        />
        <Metric
          label="VA/VR separado do dinheiro"
          value={money(view.benefits)}
          hint="Benefícios não pagam faturas ou empréstimos"
        />
      </div>
      <dl className="report-warnings">
        <div>
          <dt>Contas e prestações abertas até o horizonte</dt>
          <dd>{money(view.otherBills)}</dd>
        </div>
        <div>
          <dt>Compras e parcelas em faturas a vencer ou vencidas</dt>
          <dd>{money(view.invoices)}</dd>
        </div>
        <div>
          <dt>Dos compromissos acima, pendências anteriores</dt>
          <dd>{money(view.overdue)}</dd>
        </div>
        <div>
          <dt>Acertos familiares ainda devidos por você</dt>
          <dd>
            {money(view.pendingSettlements)} · sem vencimento definido;
            deduzidos por cautela
          </dd>
        </div>
        <div>
          <dt>Acertos a receber de familiares</dt>
          <dd>
            {money(view.receivables)} · fora do disponível até confirmação; não
            somados às projeções de renda
          </dd>
        </div>
        <div>
          <dt>Separado para essas obrigações</dt>
          <dd>
            {money(view.reservedBills)} · já incluído nos compromissos, sem
            descontar novamente
          </dd>
        </div>
        <div>
          <dt>Separado para obrigações fora do horizonte</dt>
          <dd>{money(view.reservedOutsideHorizon)}</dd>
        </div>
        <div>
          <dt>Reservado nas metas ligadas às suas contas</dt>
          <dd>{money(view.savings)}</dd>
        </div>
        <div>
          <dt>Receitas futuras informadas como certas</dt>
          <dd>{money(view.committedIncome)} · ainda não recebidas</dd>
        </div>
        <div>
          <dt>Receitas futuras previstas, incluindo salário</dt>
          <dd>{money(view.expectedIncome)} · podem não se realizar</dd>
        </div>
        <div>
          <dt>Projeção incluindo somente receitas futuras certas</dt>
          <dd>{money(view.projectedCommitted)}</dd>
        </div>
        <div>
          <dt>Projeção incluindo também receitas estimadas</dt>
          <dd>{money(view.projected)} · não é saldo confirmado</dd>
        </div>
      </dl>
      {(view.incomplete || view.unassignedHouse > 0) && (
        <div className="report-warnings">
          <h3>Confira antes de decidir</h3>
          {view.undated > 0 && (
            <p>
              Há {money(view.undated)} de obrigações próprias sem vencimento
              conhecido, fora do total datado. O disponível pode ser menor.
            </p>
          )}
          {view.unlinkedSavings > 0 && (
            <p>
              Há {money(view.unlinkedSavings)} separado em metas sem conta
              vinculada. Não presumimos que esse dinheiro faz parte do saldo
              bancário acima.
            </p>
          )}
          {view.unassignedHouse > 0 && (
            <p>
              Compromissos compartilhados de {money(view.unassignedHouse)} sem
              atribuição bancária pessoal não viram dívida sua automaticamente.
            </p>
          )}
          {!accounts.length && (
            <p>
              Cadastre uma conta e confira seu saldo para melhorar a estimativa.
            </p>
          )}
          {view.staleAccounts.length > 0 && (
            <p>
              Saldos sem conferência, divergentes ou conferidos há mais de 30
              dias exigem revisão. Despesas ainda não cadastradas não entram
              nesta estimativa.
            </p>
          )}
        </div>
      )}
      <details>
        <summary>Conferência dos saldos</summary>
        {accounts.map((a) => {
          const check = (s.account_checks ?? []).find(
            (c) => c.account_id === a.id && c.owner_id === ownerId,
          );
          return (
            <div className="list-row" key={a.id}>
              <div>
                <strong>{a.name}</strong>
                <p>
                  {money(balance(a, state))} ·{" "}
                  {check
                    ? `Última conferência: ${check.checked_on}`
                    : "Ainda a conferir"}
                </p>
              </div>
              <button
                disabled={busy}
                type="button"
                className="secondary"
                onClick={() =>
                  void onCommand(
                    "account_check",
                    {
                      account_id: a.id,
                      date: asOf,
                      confirmed_balance: balance(a, state),
                      version: check?.version ?? 0,
                    },
                    crypto.randomUUID(),
                  )
                }
              >
                Conferi este saldo
              </button>
            </div>
          );
        })}
        <p>
          Se o banco mostrar outro valor, use a conciliação justificada em
          Contas e cartões antes de confirmar.
        </p>
      </details>
      <div className="salary-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => open("future")}
        >
          Planejar recebimento
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => open("reserve")}
        >
          Separar para uma obrigação
        </button>
      </div>
      <details>
        <summary>Recebimentos futuros e histórico de confirmação</summary>
        {receipts.length === 0 ? (
          <p>
            Nenhuma previsão adicional. O salário habitual continua previsto
            pelo dia configurado.
          </p>
        ) : (
          receipts.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <strong>
                  {r.description} · {money(r.amount)}
                </strong>
                <p>
                  {r.expected_on} · competência {r.month} ·{" "}
                  {r.kind === "benefit"
                    ? "benefício VA/VR"
                    : r.kind === "salary"
                      ? "salário"
                      : "extra ou bônus"}{" "}
                  ·{" "}
                  {r.status === "received"
                    ? "Recebido e vinculado ao caixa"
                    : r.status === "cancelled"
                      ? "Cancelado, histórico preservado"
                      : r.certainty === "committed"
                        ? "Futuro informado como certo"
                        : "Estimativa futura"}
                </p>
              </div>
              {r.status === "planned" && (
                <div className="salary-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => open("future", r)}
                  >
                    Editar previsão
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => open("confirm", r)}
                  >
                    Confirmar recebimento
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void onCommand(
                        "cancel_future_receipt",
                        { id: r.id, version: r.version },
                        crypto.randomUUID(),
                      )
                    }
                  >
                    Cancelar previsão
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </details>
      {mode && (
        <form onSubmit={submit} key={mode + ":" + (selected?.id ?? "new")}>
          <h3>
            {mode === "future"
              ? "Previsão de recebimento"
              : mode === "confirm"
                ? "Registrar dinheiro efetivamente recebido"
                : "Separar dinheiro já existente"}
          </h3>
          {mode === "future" && (
            <>
              <Field label="Descrição do recebimento">
                <input
                  name="description"
                  required
                  maxLength={200}
                  defaultValue={selected?.description}
                />
              </Field>
              <Field label="Natureza do recebimento">
                <select name="kind" defaultValue={selected?.kind ?? "extra"}>
                  <option value="salary">Salário habitual</option>
                  <option value="extra">Extra, hora extra ou bônus</option>
                  <option value="benefit">Recarga VA/VR</option>
                </select>
              </Field>
              <Field label="Confiança da previsão">
                <select
                  name="certainty"
                  defaultValue={selected?.certainty ?? "expected"}
                >
                  <option value="expected">Previsto, pode variar</option>
                  <option value="committed">
                    Informado como certo, ainda não recebido
                  </option>
                </select>
              </Field>
              <Field label="Competência do recebimento">
                <input
                  type="month"
                  name="month"
                  required
                  defaultValue={selected?.month ?? asOf.slice(0, 7)}
                />
              </Field>
            </>
          )}
          {mode === "reserve" && (
            <Field label="Obrigação para reservar">
              <select name="obligation" required>
                {state.obligations
                  .filter(
                    (o) =>
                      o.owner_id === ownerId &&
                      remaining(o, state.payments) > 0,
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.description} · aberto{" "}
                      {money(remaining(o, state.payments))}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field
            label={
              mode === "reserve"
                ? "Valor separado (R$)"
                : mode === "confirm"
                  ? "Valor recebido (R$)"
                  : "Valor previsto (R$)"
            }
          >
            <input
              name="amount"
              inputMode="decimal"
              required
              defaultValue={String((selected?.amount ?? 0) / 100).replace(
                ".",
                ",",
              )}
            />
          </Field>
          {mode !== "reserve" && (
            <Field
              label={
                mode === "confirm"
                  ? "Data efetiva da entrada"
                  : "Data prevista da entrada"
              }
            >
              <input
                name="date"
                type="date"
                required
                max={mode === "confirm" ? asOf : undefined}
                defaultValue={
                  mode === "confirm" ? asOf : (selected?.expected_on ?? asOf)
                }
              />
            </Field>
          )}
          <Field label="Conta do recebimento ou reserva">
            <select
              name="account"
              required={mode !== "future"}
              defaultValue={selected?.account_id ?? ""}
            >
              {mode === "future" && (
                <option value="">Escolher ao receber</option>
              )}
              {accounts
                .filter(
                  (a) =>
                    mode !== "reserve" || ["bank", "cash"].includes(a.kind),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.kind}
                  </option>
                ))}
            </select>
          </Field>
          <p>
            {mode === "confirm"
              ? "Confirme somente após o dinheiro entrar. Uma única receita será vinculada e substituirá a previsão; o valor real pode ser diferente."
              : mode === "reserve"
                ? "Reserva não é pagamento. Informe zero para liberar uma reserva anterior. Só é possível reservar seu dinheiro para obrigações próprias."
                : "Previsões não alteram saldos. Extras e bônus ficam separados do histórico salarial."}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => open(null)}
          >
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}
