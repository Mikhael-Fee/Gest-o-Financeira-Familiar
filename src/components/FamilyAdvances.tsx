import { useState, type FormEvent } from "react";
import { Field, Empty } from "./ui";
import { money, parseMoney, today, type State } from "../domain/finance";
import { availableAdvance, type AdvanceState } from "../domain/advances";
export function FamilyAdvances({
  state,
  user,
  onCommand,
}: {
  state: State;
  user: { id: string; family_id: string };
  onCommand: (type: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const s = state as AdvanceState;
  const advances = (s.family_advances ?? []).filter(
    (a) => a.sender_id === user.id || a.recipient_id === user.id,
  );
  const accounts = s.accounts.filter(
    (a) => a.owner_id === user.id && ["bank", "cash"].includes(a.kind),
  );
  const members = s.profiles.filter(
    (p) => p.family_id === user.family_id && p.id !== user.id && p.active,
  );
  const [operation, setOperation] = useState("send_advance"),
    [advanceId, setAdvanceId] = useState(""),
    [recipient, setRecipient] = useState(""),
    [account, setAccount] = useState("");
  const [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [effective, setEffective] = useState(today()),
    [reason, setReason] = useState("");
  const [settlementId, setSettlementId] = useState(""),
    [allocationId, setAllocationId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const advance = advances.find((a) => a.id === advanceId),
    allocation = (s.advance_allocations ?? []).find(
      (a) => a.id === allocationId,
    ),
    allocationAdvance = advances.find((a) => a.id === allocation?.advance_id);
  const targets = advance
    ? s.settlements.filter(
        (x) =>
          x.debtor_id === advance.sender_id &&
          x.creditor_id === advance.recipient_id &&
          x.amount > x.confirmed + x.sent + (x.bank_credit ?? 0),
      )
    : [];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload: Record<string, unknown> = {
        id:
          operation === "send_advance"
            ? crypto.randomUUID()
            : operation === "reverse_advance_allocation"
              ? allocationId
              : advanceId,
        version:
          operation === "reverse_advance_allocation"
            ? allocationAdvance?.version
            : advance?.version,
        date: effective,
        account_id: account,
        description,
        recipient_id: recipient,
        reason,
      };
      if (operation === "send_advance" || operation === "allocate_advance")
        payload.amount = parseMoney(amount);
      if (operation === "allocate_advance")
        Object.assign(payload, {
          settlement_id: settlementId,
          settlement_version: targets.find((x) => x.id === settlementId)
            ?.version,
        });
      await onCommand(operation, payload);
      setMessage(
        "Operação salva. Crédito familiar não é salário nem pagamento da fatura.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Adiantamentos e créditos familiares</h2>
      <p>
        Registre separadamente o dinheiro enviado além do acerto. O destinatário
        confirma o recebimento e o crédito pode compensar compras futuras. A
        fatura bancária continua independente.
      </p>
      {advances.length ? (
        <ul>
          {advances.map((a) => (
            <li key={a.id}>
              <strong>{a.description}</strong> · {money(a.amount)} ·{" "}
              {a.reversed_on
                ? "Estornado"
                : a.rejected_on
                  ? "Rejeitado"
                  : a.confirmed_on
                    ? `Confirmado; crédito disponível ${money(availableAdvance(s, a))}`
                    : "Aguardando confirmação"}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhum adiantamento entre você e outro familiar.</Empty>
      )}
      <form onSubmit={submit}>
        <Field label="Operação do crédito familiar">
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="send_advance">Informar adiantamento enviado</option>
            <option value="confirm_advance">Confirmar recebimento</option>
            <option value="reject_advance">Rejeitar envio informado</option>
            <option value="allocate_advance">Usar crédito em um acerto</option>
            <option value="reverse_advance_allocation">
              Desfazer uso do crédito
            </option>
            <option value="reverse_advance">
              Estornar transferência confirmada
            </option>
          </select>
        </Field>
        {operation === "send_advance" ? (
          <>
            <Field label="Familiar que recebeu">
              <select
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              >
                <option value="">Selecione</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Descrição do adiantamento">
              <input
                required
                maxLength={120}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </>
        ) : operation === "reverse_advance_allocation" ? (
          <Field label="Uso do crédito a desfazer">
            <select
              required
              value={allocationId}
              onChange={(e) => setAllocationId(e.target.value)}
            >
              <option value="">Selecione</option>
              {(s.advance_allocations ?? [])
                .filter(
                  (x) =>
                    !x.reversed_on &&
                    advances.some((a) => a.id === x.advance_id),
                )
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {advances.find((a) => a.id === x.advance_id)?.description} ·{" "}
                    {money(x.amount)}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label="Adiantamento a gerenciar">
            <select
              required
              value={advanceId}
              onChange={(e) => setAdvanceId(e.target.value)}
            >
              <option value="">Selecione</option>
              {advances.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.description} · {money(a.amount)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {(operation === "send_advance" || operation === "confirm_advance") && (
          <Field label="Conta bancária do adiantamento">
            <select
              required
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Selecione</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {operation === "allocate_advance" && (
          <Field label="Acerto que usará o crédito">
            <select
              required
              value={settlementId}
              onChange={(e) => setSettlementId(e.target.value)}
            >
              <option value="">Selecione</option>
              {targets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.description} · Em aberto{" "}
                  {money(
                    x.amount - x.confirmed - x.sent - (x.bank_credit ?? 0),
                  )}
                </option>
              ))}
            </select>
          </Field>
        )}
        {(operation === "send_advance" || operation === "allocate_advance") && (
          <Field label="Valor do crédito em reais">
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        )}
        <Field label="Data efetiva do crédito">
          <input
            required
            type="date"
            max={today()}
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
          />
        </Field>
        {[
          "reject_advance",
          "reverse_advance",
          "reverse_advance_allocation",
        ].includes(operation) && (
          <Field label="Motivo da correção do crédito">
            <input
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar crédito familiar"}
        </button>
      </form>
    </section>
  );
}
