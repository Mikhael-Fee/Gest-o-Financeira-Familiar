import { useRef, useState } from "react";
import { money, today, type State } from "../domain/finance";
import {
  csvCells,
  guessMapping,
  parseCsv,
  parseOfx,
  parseStatementDate,
  parseStatementMoney,
  probableMatches,
  statementKey,
  type CsvMapping,
  type ImportState,
  type StatementRow,
} from "../domain/import";
import type { Command } from "../data/store";
import { Field } from "./ui";
type Props = {
  state: State;
  ownerId: string;
  busy: boolean;
  onCommand: (
    type: Command["type"],
    payload: Record<string, unknown>,
    key?: string,
  ) => Promise<boolean>;
};
export default function ImportPanel({
  state,
  ownerId,
  busy,
  onCommand,
}: Props) {
  const accounts = state.accounts.filter(
    (a) => a.owner_id === ownerId && ["bank", "cash"].includes(a.kind),
  );
  const [accountId, setAccount] = useState(accounts[0]?.id ?? ""),
    [text, setText] = useState(""),
    [mapping, setMapping] = useState<CsvMapping>({
      date: 0,
      description: 1,
      amount: 2,
      externalId: -1,
    }),
    [headers, setHeaders] = useState<string[]>([]),
    [rows, setRows] = useState<StatementRow[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [correction, setCorrection] = useState("");
  const key = useRef(crypto.randomUUID());
  const imports = (state as ImportState).import_records ?? [];
  const account = accounts.find((a) => a.id === accountId);
  const ownImports = imports.filter((r) => r.owner_id === ownerId);
  const patch = (id: string, value: Partial<StatementRow>) => {
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...value } : r)));
    key.current = crypto.randomUUID();
    setConfirmed(false);
  };
  function preview(source = text, columns = mapping) {
    try {
      const parsed = /<OFX[>\s]/i.test(source)
        ? parseOfx(source)
        : parseCsv(source, columns);
      setRows(
        parsed.map((row) => {
          const matches = probableMatches(state, ownerId, accountId, row);
          return matches.length
            ? { ...row, classification: "match", match_id: matches[0].id }
            : row;
        }),
      );
      setError("");
      setNotice("");
      key.current = crypto.randomUUID();
      setConfirmed(false);
    } catch (e) {
      setRows([]);
      setError((e as Error).message);
    }
  }
  async function read(file?: File) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("O arquivo deve ter até 1 MB.");
      return;
    }
    const source = await file.text();
    setText(source);
    try {
      if (!/<OFX[>\s]/i.test(source)) {
        const h = csvCells(source)[0] ?? [];
        setHeaders(h);
        const m = guessMapping(h);
        setMapping(m);
        preview(source, m);
      } else {
        setHeaders([]);
        preview(source);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selectable = rows.filter(
    (r) =>
      r.classification !== "ignore" &&
      !imports.some(
        (i) =>
          i.owner_id === ownerId &&
          i.account_id === accountId &&
          i.source_key === statementKey(r),
      ),
  );
  const invalid = rows.some(
    (r) =>
      r.classification !== "ignore" &&
      (!account ||
        r.date < account.cutoff ||
        r.date > today() ||
        r.amount === 0),
  );
  async function save() {
    if (!confirmed || !selectable.length || invalid) return;
    const saved = await onCommand(
      "import_statement" as Command["type"],
      { account_id: accountId, rows: selectable },
      key.current,
    );
    if (saved) {
      setNotice(
        "Extrato importado. Reimportar as mesmas linhas não movimenta o saldo novamente.",
      );
      setRows([]);
      setText("");
      setHeaders([]);
      setConfirmed(false);
      key.current = crypto.randomUUID();
    }
  }
  async function correct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const record = ownImports.find((r) => r.id === correction);
    const entry = state.entries.find((e) => e.id === record?.entry_id);
    if (!record || !entry) return;
    const f = new FormData(event.currentTarget);
    const saved = await onCommand(
      "import_correct" as Command["type"],
      {
        id: record.id,
        version: record.version,
        entry_version: entry.version,
        description: f.get("description"),
        category: f.get("category"),
        reason: f.get("reason"),
      },
      key.current,
    );
    if (saved) {
      setCorrection("");
      key.current = crypto.randomUUID();
    }
  }
  return (
    <section className="panel">
      <h2>Importar extrato CSV ou OFX</h2>
      <p>
        Escolha sua conta e confira a prévia. Nada é gravado antes de confirmar.
        Não informe senha do banco. Arquivos ficam apenas em memória; até 1 MB e
        2.000 linhas.
      </p>
      <Field label="Conta para importar">
        <select
          value={accountId}
          onChange={(e) => {
            setAccount(e.target.value);
            setRows([]);
            setConfirmed(false);
            key.current = crypto.randomUUID();
          }}
        >
          <option value="">Selecione sua conta</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Arquivo de extrato">
        <input
          type="file"
          accept=".csv,.ofx,text/csv,application/x-ofx"
          disabled={!accountId || busy}
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </Field>
      <details>
        <summary>Colar CSV ou OFX</summary>
        <Field label="Conteúdo do extrato">
          <textarea
            value={text}
            maxLength={1_000_000}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <button
          className="secondary"
          disabled={!accountId || !text || busy}
          onClick={() => {
            try {
              if (!/<OFX[>\s]/i.test(text)) {
                const h = csvCells(text)[0] ?? [];
                setHeaders(h);
                const m = guessMapping(h);
                setMapping(m);
                preview(text, m);
              } else {
                setHeaders([]);
                preview();
              }
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Preparar prévia
        </button>
      </details>
      {headers.length > 0 && (
        <fieldset>
          <legend>Colunas do CSV</legend>
          {(
            [
              "date",
              "description",
              "amount",
              "externalId",
              "debit",
              "credit",
            ] as const
          ).map((field) => (
            <Field
              key={field}
              label={
                {
                  date: "Coluna da data",
                  description: "Coluna da descrição",
                  amount: "Coluna do valor",
                  externalId: "Coluna do identificador",
                  debit: "Coluna de débito (opcional)",
                  credit: "Coluna de crédito (opcional)",
                }[field]
              }
            >
              <select
                value={mapping[field] ?? -1}
                onChange={(e) =>
                  setMapping((old) => ({
                    ...old,
                    [field]: Number(e.target.value),
                  }))
                }
              >
                <option value={-1}>Não utilizar</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Coluna ${i + 1}`}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => preview()}
          >
            Atualizar prévia com estas colunas
          </button>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {rows.length > 0 && (
        <>
          <p>
            Débitos são negativos; créditos são positivos. Pix, faturas,
            empréstimos e transferências começam em “Ignorar”: classifique
            corretamente para não duplicar consumo, renda ou pagamentos. Use “Só
            movimento bancário” para transferências já ocorridas; isso não cria
            salário nem consumo e não confirma automaticamente um acerto.
          </p>
          <div className="table-scroll">
            <table>
              <caption>Prévia do extrato — {rows.length} linhas</caption>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Classificação</th>
                  <th>Categoria ou vínculo</th>
                  <th>Conferência</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const duplicate = imports.some(
                    (r) =>
                      r.owner_id === ownerId &&
                      r.account_id === accountId &&
                      r.source_key === statementKey(row),
                  );
                  const matches = probableMatches(
                    state,
                    ownerId,
                    accountId,
                    row,
                  );
                  const dateError =
                    !account || row.date < account.cutoff || row.date > today();
                  return (
                    <tr key={row.id}>
                      <td>
                        <input
                          aria-label={`Data linha ${index + 1}`}
                          type="date"
                          value={row.date}
                          onChange={(e) => {
                            try {
                              patch(row.id, {
                                date: parseStatementDate(e.target.value),
                              });
                              setError("");
                            } catch {
                              setError("Data inválida na prévia.");
                            }
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Descrição linha ${index + 1}`}
                          maxLength={120}
                          value={row.description}
                          onChange={(e) =>
                            patch(row.id, { description: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Valor linha ${index + 1}`}
                          defaultValue={String(row.amount / 100).replace(
                            ".",
                            ",",
                          )}
                          inputMode="decimal"
                          onBlur={(e) => {
                            try {
                              patch(row.id, {
                                amount: parseStatementMoney(e.target.value),
                              });
                              setError("");
                            } catch {
                              setError("Valor inválido na prévia.");
                            }
                          }}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Classificação linha ${index + 1}`}
                          value={row.classification}
                          onChange={(e) =>
                            patch(row.id, {
                              classification: e.target
                                .value as StatementRow["classification"],
                            })
                          }
                        >
                          <option value="ignore">Ignorar</option>
                          {row.amount < 0 ? (
                            <option value="expense">Consumo pessoal</option>
                          ) : (
                            <option value="income">Receita recebida</option>
                          )}
                          <option value="transfer">
                            Só movimento bancário
                          </option>
                          {row.amount < 0 && (
                            <option value="payment">
                              Pagar obrigação registrada
                            </option>
                          )}
                          {matches.length > 0 && (
                            <option value="match">
                              Já registrado: vincular
                            </option>
                          )}
                        </select>
                      </td>
                      <td>
                        {row.classification === "match" ? (
                          <select
                            aria-label={`Lançamento existente linha ${index + 1}`}
                            value={row.match_id ?? ""}
                            onChange={(e) =>
                              patch(row.id, { match_id: e.target.value })
                            }
                          >
                            <option value="">Selecione</option>
                            {matches.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.description} · {money(m.amount)}
                              </option>
                            ))}
                          </select>
                        ) : row.classification === "payment" ? (
                          <select
                            aria-label={`Obrigação linha ${index + 1}`}
                            value={row.obligation_id ?? ""}
                            onChange={(e) => {
                              const o = state.obligations.find(
                                (o) => o.id === e.target.value,
                              );
                              patch(row.id, {
                                obligation_id: o?.id,
                                version: o?.version,
                              });
                            }}
                          >
                            <option value="">Selecione a obrigação</option>
                            {state.obligations
                              .filter(
                                (o) =>
                                  (o.owner_id === ownerId || o.house) &&
                                  !o.replaced_by,
                              )
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.description} ·{" "}
                                  {o.due_on ?? "Data desconhecida"}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <>
                            <input
                              aria-label={`Categoria linha ${index + 1}`}
                              value={row.category}
                              maxLength={60}
                              onChange={(e) =>
                                patch(row.id, { category: e.target.value })
                              }
                              list="import-categories"
                            />
                            {row.classification === "income" && (
                              <select
                                aria-label={`Tipo de receita linha ${index + 1}`}
                                value={row.income_type ?? "extra"}
                                onChange={(e) =>
                                  patch(row.id, { income_type: e.target.value })
                                }
                              >
                                <option value="extra">Extra ou bônus</option>
                                <option value="salary">Salário</option>
                              </select>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        {duplicate
                          ? "Já importado: será ignorado"
                          : dateError
                            ? "Data fora do período de controle ou futura"
                            : matches.length
                              ? "Possível duplicidade: vincule ou ignore"
                              : "Conferir"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <datalist id="import-categories">
            {[
              ...new Set([
                "Outros",
                "Alimentação",
                "Transporte",
                "Moradia",
                ...state.categories
                  .filter((c) => c.owner_id === ownerId && c.active)
                  .map((c) => c.name),
              ]),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Conferi datas, valores e classificações; os movimentos selecionados
            ocorreram nesta conta.
          </label>
          <button
            disabled={
              busy || !confirmed || !selectable.length || invalid || !!error
            }
            onClick={() => void save()}
          >
            Confirmar importação de {selectable.length} movimentos
          </button>
          {invalid && (
            <p role="alert">
              Corrija ou ignore datas futuras ou anteriores à referência da
              conta.
            </p>
          )}
        </>
      )}
      {ownImports.length > 0 && (
        <details>
          <summary>Histórico e correção de importações</summary>
          <ul className="list">
            {ownImports
              .slice()
              .reverse()
              .map((r) => (
                <li key={r.id}>
                  {r.occurred_on} · {r.description} · {money(r.amount)} ·{" "}
                  {r.classification}
                  {r.entry_id && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setCorrection(r.id);
                        key.current = crypto.randomUUID();
                      }}
                    >
                      Corrigir descrição/categoria
                    </button>
                  )}
                </li>
              ))}
          </ul>
          <p>
            Corrigir descrição ou categoria preserva a identificação bancária
            original. Para valor ou data financeira incorretos após confirmar,
            anule o lançamento pelo histórico de movimentações e faça uma
            correção auditada; não importe novamente o mesmo identificador.
          </p>
        </details>
      )}
      {correction && (
        <form onSubmit={(e) => void correct(e)}>
          <h3>Corrigir metadados importados</h3>
          <Field label="Descrição corrigida">
            <input
              name="description"
              required
              maxLength={120}
              defaultValue={
                state.entries.find(
                  (e) =>
                    e.id ===
                    ownImports.find((r) => r.id === correction)?.entry_id,
                )?.description
              }
            />
          </Field>
          <Field label="Categoria corrigida">
            <input
              name="category"
              required
              maxLength={60}
              defaultValue={
                state.entries.find(
                  (e) =>
                    e.id ===
                    ownImports.find((r) => r.id === correction)?.entry_id,
                )?.category
              }
            />
          </Field>
          <Field label="Motivo da correção">
            <input name="reason" required minLength={5} />
          </Field>
          <button disabled={busy}>Salvar correção</button>
          <button
            type="button"
            className="secondary"
            onClick={() => setCorrection("")}
          >
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}
