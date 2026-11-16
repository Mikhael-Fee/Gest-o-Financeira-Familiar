import { balance, cents, date, today, type Entry, type State } from "./finance";

export type StatementRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  externalId: string;
  occurrence: number;
  source?: {
    date: string;
    amount: number;
    description: string;
    occurrence: number;
    externalId: string;
  };
  classification:
    "expense" | "income" | "transfer" | "payment" | "match" | "ignore";
  category: string;
  income_type?: string;
  match_id?: string;
  obligation_id?: string;
  version?: number;
};
export type ImportRecord = {
  id: string;
  owner_id: string;
  account_id: string;
  source_key: string;
  occurred_on: string;
  description: string;
  amount: number;
  classification: string;
  entry_id: string | null;
  movement_id: string | null;
  payment_id: string | null;
  version: number;
  created_at?: string;
};
export type ManagedTag = {
  id: string;
  owner_id: string;
  name: string;
  active: boolean;
  version: number;
};
export type ImportState = State & {
  import_records?: ImportRecord[];
  tags_catalog?: ManagedTag[];
};
export type CsvMapping = {
  date: number;
  description: number;
  amount: number;
  externalId?: number;
  debit?: number;
  credit?: number;
};
const normalize = (s: string) =>
  s.trim().normalize("NFC").replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
export function statementKey(
  row: Pick<
    StatementRow,
    "externalId" | "date" | "amount" | "description" | "occurrence" | "source"
  >,
) {
  row = row.source ?? row;
  return row.externalId.trim()
    ? `id:${row.externalId.trim()}`
    : `row:${row.date}|${row.amount}|${normalize(row.description)}|${row.occurrence}`;
}
export function parseStatementMoney(input: string): number {
  let value = input
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  const negative =
    /^\(.*\)$/.test(value) || /D$/i.test(value) || value.startsWith("-");
  value = value.replace(/[DC]$/i, "").replace(/[()]/g, "").replace(/^[+-]/, "");
  if (value.includes(",")) {
    if (
      !/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(value) &&
      !/^\d+,\d{1,2}$/.test(value)
    )
      throw Error("Valor brasileiro inválido.");
    value = value.replaceAll(".", "").replace(",", ".");
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw Error("Valor inválido no extrato.");
  const [whole, fraction = ""] = value.split(".");
  const amount = cents
    .positive()
    .parse(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
  return negative ? -amount : amount;
}
export function parseStatementDate(value: string) {
  const v = value.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  return date.parse(
    br
      ? `${br[3]}-${br[2]}-${br[1]}`
      : /^\d{8}/.test(v)
        ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
        : v,
  );
}
export function csvCells(text: string): string[][] {
  if (text.length > 1_000_000) throw Error("O arquivo deve ter até 1 MB.");
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes(";")
    ? ";"
    : first.includes("\t")
      ? "\t"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Aspas não fechadas no CSV.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length > 2001) throw Error("Importe até 2.000 linhas por arquivo.");
  return rows;
}
export function guessMapping(headers: string[]): CsvMapping {
  const find = (pattern: RegExp, fallback: number) => {
    const index = headers.findIndex((h) => pattern.test(normalize(h)));
    return index < 0 ? fallback : index;
  };
  return {
    date: find(/data|date/, 0),
    description: find(/descri|hist[oó]rico|memo|lan[cç]amento/, 1),
    amount: find(/valor|amount/, 2),
    externalId: find(/fitid|identificador|documento|^id$/, -1),
  };
}
function enrich(
  rows: Omit<
    StatementRow,
    "id" | "occurrence" | "classification" | "category"
  >[],
): StatementRow[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const base = `${row.date}|${row.amount}|${normalize(row.description)}`;
    const occurrence = (counts.get(base) ?? 0) + 1;
    counts.set(base, occurrence);
    const special =
      /pix|transfer|fatura|empr[eé]stimo|estorno|reembolso|resgate|aplica[cç][aã]o/i.test(
        row.description,
      );
    return {
      ...row,
      id: crypto.randomUUID(),
      occurrence,
      source: {
        date: row.date,
        amount: row.amount,
        description: row.description,
        externalId: row.externalId,
        occurrence,
      },
      category: "Outros",
      classification: special
        ? "ignore"
        : row.amount < 0
          ? "expense"
          : "income",
    };
  });
}
export function parseCsv(text: string, mapping?: CsvMapping): StatementRow[] {
  const cells = csvCells(text);
  if (cells.length < 2) throw Error("CSV sem lançamentos.");
  const m = mapping ?? guessMapping(cells[0]);
  return enrich(
    cells.slice(1).map((r, i) => {
      try {
        let amount: number;
        if (m.debit !== undefined && m.debit >= 0 && r[m.debit]?.trim())
          amount = -Math.abs(parseStatementMoney(r[m.debit]));
        else if (m.credit !== undefined && m.credit >= 0 && r[m.credit]?.trim())
          amount = Math.abs(parseStatementMoney(r[m.credit]));
        else amount = parseStatementMoney(r[m.amount] ?? "");
        const description = r[m.description]?.trim();
        if (!description || description.length > 120)
          throw Error("Descrição vazia ou maior que 120 caracteres.");
        return {
          date: parseStatementDate(r[m.date] ?? ""),
          description,
          amount,
          externalId: (r[m.externalId ?? -1] ?? "").trim().slice(0, 200),
        };
      } catch (e) {
        throw Error(`Linha ${i + 2}: ${(e as Error).message}`, { cause: e });
      }
    }),
  );
}
export function parseOfx(text: string): StatementRow[] {
  if (text.length > 1_000_000) throw Error("O arquivo deve ter até 1 MB.");
  const blocks = [
    ...text.matchAll(
      /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi,
    ),
  ];
  if (!blocks.length || blocks.length > 2000)
    throw Error("OFX deve conter de 1 a 2.000 movimentos bancários.");
  const tag = (block: string, key: string) =>
    new RegExp(`<${key}>([^<\\r\\n]*)`, "i").exec(block)?.[1].trim() ?? "";
  return enrich(
    blocks.map(([, block]) => {
      const description =
        tag(block, "MEMO") || tag(block, "NAME") || "Movimento OFX";
      const externalId = tag(block, "FITID");
      if (!externalId || externalId.length > 200 || description.length > 120)
        throw Error("OFX exige FITID e descrição válida.");
      return {
        date: parseStatementDate(tag(block, "DTPOSTED")),
        amount: parseStatementMoney(tag(block, "TRNAMT")),
        description,
        externalId,
      };
    }),
  );
}
export function probableMatches(
  state: State,
  owner: string,
  account: string,
  row: StatementRow,
) {
  return state.entries.filter(
    (e) =>
      !e.voided &&
      e.owner_id === owner &&
      e.occurred_on === row.date &&
      e.amount === Math.abs(row.amount) &&
      ((row.amount < 0 && e.kind === "expense") ||
        (row.amount > 0 && e.kind !== "expense")) &&
      e.splits.some(
        (s) => s.account_id === account && s.amount === Math.abs(row.amount),
      ),
  );
}
export function managedTags(state: ImportState, owner: string): ManagedTag[] {
  const saved = (state.tags_catalog ?? []).filter((t) => t.owner_id === owner);
  const names = new Set(
    state.entries
      .filter((e) => e.owner_id === owner)
      .flatMap((e) => e.tags ?? []),
  );
  return [
    ...saved,
    ...[...names]
      .filter((name) => !saved.some((t) => t.name === name))
      .map((name) => ({
        id: `legacy:${name}`,
        owner_id: owner,
        name,
        active: true,
        version: 0,
      })),
  ];
}
export function applyImportTags(
  state: State,
  command: { type: string; key: string; payload: Record<string, unknown> },
  user: { id: string; family_id: string },
): State | null {
  if (
    command.type === "entry" &&
    (state as ImportState).tags_catalog?.some(
      (t) =>
        t.owner_id === user.id &&
        !t.active &&
        (command.payload.tags as string[] | undefined)?.includes(t.name),
    )
  )
    throw Error("Etiqueta desativada. Reative ou escolha outra.");
  if (!["import_statement", "import_correct", "tag"].includes(command.type))
    return null;
  const n = structuredClone(state) as ImportState,
    p = command.payload;
  n.import_records ??= [];
  n.tags_catalog ??= [];
  if (command.type === "tag") {
    const name = String(p.name ?? "").trim();
    if (!name || name.length > 40)
      throw Error("Etiqueta deve ter de 1 a 40 caracteres.");
    const old = n.tags_catalog.find((t) => t.id === p.id);
    const legacy =
      !old &&
      p.old_name &&
      n.entries.some(
        (e) => e.owner_id === user.id && e.tags?.includes(String(p.old_name)),
      );
    if (
      (old && (old.owner_id !== user.id || old.version !== p.version)) ||
      (!old && Number(p.version) !== 0)
    )
      throw Error("Etiqueta alterada ou não autorizada.");
    if (
      n.tags_catalog.some(
        (t) =>
          t.owner_id === user.id &&
          t.id !== p.id &&
          normalize(t.name) === normalize(name),
      )
    )
      throw Error("Etiqueta já existe.");
    const previous = old?.name ?? (legacy ? String(p.old_name) : null);
    if (previous && previous !== name)
      for (const e of n.entries)
        if (e.owner_id === user.id && e.tags?.includes(previous)) {
          e.tags = [...new Set(e.tags.map((t) => (t === previous ? name : t)))];
          e.version++;
        }
    if (old)
      Object.assign(old, {
        name,
        active: !!p.active,
        version: old.version + 1,
      });
    else
      n.tags_catalog.push({
        id: String(p.id),
        owner_id: user.id,
        name,
        active: !!p.active,
        version: 1,
      });
    return n;
  }
  if (command.type === "import_correct") {
    const record = n.import_records.find(
      (r) => r.id === p.id && r.owner_id === user.id,
    );
    if (
      !record ||
      record.version !== p.version ||
      String(p.reason ?? "").trim().length < 5 ||
      !record.entry_id
    )
      throw Error("Correção não autorizada.");
    const e = n.entries.find(
      (e) => e.id === record.entry_id && e.owner_id === user.id && !e.voided,
    );
    if (!e || e.version !== p.entry_version)
      throw Error("Movimento alterado. Atualize.");
    const description = String(p.description ?? "").trim(),
      category = String(p.category ?? "").trim();
    if (
      !description ||
      description.length > 120 ||
      !category ||
      category.length > 60
    )
      throw Error("Descrição ou categoria inválida.");
    e.description = description;
    e.category = category;
    e.version++;
    record.version++;
    return n;
  }
  const account = n.accounts.find(
    (a) =>
      a.id === p.account_id &&
      a.owner_id === user.id &&
      ["bank", "cash"].includes(a.kind),
  );
  if (!account) throw Error("Selecione uma conta bancária própria.");
  const rows = p.rows as StatementRow[];
  if (!Array.isArray(rows) || !rows.length || rows.length > 2000)
    throw Error("Selecione de 1 a 2.000 movimentos.");
  for (const row of rows) {
    date.parse(row.date);
    cents.positive().parse(Math.abs(row.amount));
    if (
      row.date < account.cutoff ||
      row.date > today() ||
      !row.description.trim() ||
      row.description.length > 120 ||
      row.occurrence < 1 ||
      !Number.isInteger(row.occurrence) ||
      row.externalId.length > 200
    )
      throw Error("Data ou movimento inválido.");
    const sourceRow = row.source ?? row;
    const source_key = statementKey(row);
    const prior = n.import_records.find(
      (r) =>
        r.owner_id === user.id &&
        r.account_id === account.id &&
        r.source_key === source_key,
    );
    if (prior) {
      if (
        prior.amount !== sourceRow.amount ||
        prior.occurred_on !== sourceRow.date
      )
        throw Error("Identificador repetido com conteúdo diferente.");
      continue;
    }
    if (row.classification === "ignore") continue;
    let entry_id: string | null = null,
      movement_id: string | null = null,
      payment_id: string | null = null;
    if (row.classification === "expense" || row.classification === "income") {
      if ((row.classification === "expense") !== row.amount < 0)
        throw Error("Natureza incompatível com sinal.");
      if (
        probableMatches(n, user.id, account.id, row).length &&
        !n.import_records.some(
          (r) =>
            r.owner_id === user.id &&
            r.account_id === account.id &&
            r.occurred_on === row.date &&
            r.amount === row.amount &&
            normalize(r.description) === normalize(row.description),
        )
      )
        throw Error(
          "Possível duplicidade: vincule ao lançamento já registrado.",
        );
      const e: Entry = {
        id: row.id,
        owner_id: user.id,
        family_id: user.family_id,
        description: row.description,
        kind: row.classification,
        amount: Math.abs(row.amount),
        occurred_on: row.date,
        category: row.category || "Outros",
        house: false,
        consumer_id: user.id,
        responsible_id: null,
        card_id: null,
        splits: [{ account_id: account.id, amount: Math.abs(row.amount) }],
        version: 1,
        voided: false,
        income_type:
          row.classification === "income"
            ? (row.income_type ?? "extra")
            : undefined,
        salary_month:
          row.classification === "income" ? row.date.slice(0, 7) : undefined,
      };
      n.entries.push(e);
      entry_id = e.id;
    } else if (row.classification === "transfer") {
      movement_id = row.id;
      n.account_movements.push({
        id: row.id,
        owner_id: user.id,
        account_id: account.id,
        amount: row.amount,
        occurred_on: row.date,
        kind: "transfer",
        reference_id: row.id,
        reason: row.description,
      });
    } else if (row.classification === "match") {
      const e = probableMatches(n, user.id, account.id, row).find(
        (e) => e.id === row.match_id,
      );
      if (!e) throw Error("Lançamento existente não corresponde à linha.");
      entry_id = e.id;
    } else if (row.classification === "payment") {
      const o = n.obligations.find(
        (o) =>
          o.id === row.obligation_id &&
          (o.owner_id === user.id ||
            (o.house && o.family_id === user.family_id)),
      );
      const paid = n.payments
        .filter((p) => p.obligation_id === o?.id && !p.reversed_on)
        .reduce((s, p) => s + p.amount, 0);
      if (
        !o ||
        o.version !== row.version ||
        o.replaced_by ||
        (o.unknown && !!o.recurrence_id) ||
        balance(account, n) < -row.amount ||
        row.amount >= 0 ||
        -row.amount > o.amount - o.confirmed - paid
      )
        throw Error("Pagamento incompatível com obrigação.");
      n.payments.push({
        id: row.id,
        obligation_id: o.id,
        account_id: account.id,
        amount: -row.amount,
        paid_on: row.date,
        payer_id: user.id,
        key: row.id,
      });
      o.version++;
      o.unknown = false;
      if (o.recurrence_id && !n.entries.some((e) => e.id === o.id))
        n.entries.push({
          id: o.id,
          owner_id: o.owner_id,
          family_id: o.family_id,
          description: o.description,
          kind: "expense",
          amount: o.amount,
          occurred_on: o.due_on ?? row.date,
          category: "Contas da Casa",
          house: o.house,
          consumer_id: o.owner_id,
          responsible_id: null,
          card_id: null,
          splits: [],
          version: 1,
          voided: false,
        });
      payment_id = row.id;
    } else throw Error("Classificação inválida.");
    n.import_records.push({
      id: row.id,
      owner_id: user.id,
      account_id: account.id,
      source_key,
      occurred_on: sourceRow.date,
      description: sourceRow.description,
      amount: sourceRow.amount,
      classification: row.classification,
      entry_id,
      movement_id,
      payment_id,
      version: 1,
    });
  }
  return n;
}
