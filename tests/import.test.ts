import { describe, it, expect } from "vitest";
import { balance, emptyState, type State } from "../src/domain/finance";
import {
  applyImportTags,
  csvCells,
  parseCsv,
  parseOfx,
  parseStatementDate,
  parseStatementMoney,
  statementKey,
  managedTags,
  type ImportState,
} from "../src/domain/import";
const user = { id: "a", family_id: "f" };
function fixture(): State {
  const s = emptyState();
  s.accounts = [
    {
      id: "bank",
      owner_id: "a",
      name: "Fictícia",
      kind: "bank",
      opening: 100000,
      cutoff: "2026-01-01",
    },
    {
      id: "other",
      owner_id: "b",
      name: "Privada",
      kind: "bank",
      opening: 100000,
      cutoff: "2026-01-01",
    },
  ];
  return s;
}
const csv =
  "Data;Descrição;Valor;Documento\n05/11/2026;Mercado;-50,25;F1\n06/11/2026;Serviço extra;100,50;F2";
describe("importação de extratos", () => {
  it("lê CSV brasileiro com sinal e centavos exatos", () => {
    const rows = parseCsv(csv);
    expect(rows.map((r) => r.amount)).toEqual([-5025, 10050]);
    expect(rows[0].date).toBe("2026-11-05");
    expect(rows[1].classification).toBe("income");
    expect(rows[0].externalId).toBe("F1");
  });
  it("preserva aspas escapadas e separadores em descrição", () => {
    expect(
      csvCells(
        'Data;Descrição;Valor\n05/11/2026;"Mercado; loja ""A""";-10,00',
      )[1][1],
    ).toBe('Mercado; loja "A"');
  });
  it("valida datas reais e formatos monetários", () => {
    expect(parseStatementMoney("R$ 1.234,56 D")).toBe(-123456);
    expect(parseStatementMoney("(10,50)")).toBe(-1050);
    expect(() => parseStatementMoney("1,234.56")).toThrow();
    expect(() => parseStatementDate("31/02/2026")).toThrow();
    expect(() => parseStatementMoney("0")).toThrow();
  });
  it("mapeia colunas com débito e crédito separados", () => {
    const rows = parseCsv(
      "Histórico;Crédito;Data;Débito\nLoja;;01/11/2026;30,50\nServiço;45,25;02/11/2026;",
      { date: 2, description: 0, amount: -1, debit: 3, credit: 1 },
    );
    expect(rows.map((r) => r.amount)).toEqual([-3050, 4525]);
  });
  it("lê OFX SGML sem fechar tags e mantém FITID", () => {
    const rows = parseOfx(
      "OFXHEADER:100\n<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20261105120000[-3:BRT]\n<TRNAMT>-12.50\n<FITID>A001\n<MEMO>Compra\n</STMTTRN></BANKTRANLIST></OFX>",
    );
    expect(rows[0]).toMatchObject({
      date: "2026-11-05",
      amount: -1250,
      externalId: "A001",
    });
    expect(statementKey(rows[0])).toBe("id:A001");
  });
  it("não classifica Pix, fatura ou empréstimo automaticamente como consumo ou salário", () => {
    const rows = parseCsv(
      "Data;Descrição;Valor\n01/11/2026;Pagamento fatura;-100,00\n02/11/2026;Pix recebido;100,00\n03/11/2026;Empréstimo;500,00",
    );
    expect(rows.map((r) => r.classification)).toEqual([
      "ignore",
      "ignore",
      "ignore",
    ]);
  });
  it("reimportar com nova chave e IDs não duplica banco nem consumo", () => {
    const s = fixture(),
      rows = parseCsv(csv),
      c = {
        key: crypto.randomUUID(),
        type: "import_statement",
        payload: { account_id: "bank", rows },
      };
    const first = applyImportTags(s, c, user)!;
    const twice = applyImportTags(
      first,
      {
        ...c,
        key: crypto.randomUUID(),
        payload: { account_id: "bank", rows: parseCsv(csv) },
      },
      user,
    )!;
    expect(twice.entries).toHaveLength(2);
    expect(balance(twice.accounts[0], twice)).toBe(105025);
    expect((twice as ImportState).import_records).toHaveLength(2);
  });
  it("preserva dois movimentos idênticos sem FITID no mesmo arquivo e deduplica repetição", () => {
    const text =
        "Data;Descrição;Valor\n01/11/2026;Ônibus;-5,00\n01/11/2026;Ônibus;-5,00",
      rows = parseCsv(text);
    expect(rows.map(statementKey)).toHaveLength(2);
    expect(statementKey(rows[0])).not.toBe(statementKey(rows[1]));
    const first = applyImportTags(
      fixture(),
      {
        type: "import_statement",
        key: "k",
        payload: { account_id: "bank", rows },
      },
      user,
    )!;
    const repeat = applyImportTags(
      first,
      {
        type: "import_statement",
        key: "k2",
        payload: { account_id: "bank", rows: parseCsv(text) },
      },
      user,
    )!;
    expect(repeat.entries).toHaveLength(2);
  });
  it("recusa conta de outro membro e valor conflitante no mesmo identificador", () => {
    expect(() =>
      applyImportTags(
        fixture(),
        {
          type: "import_statement",
          key: "k",
          payload: { account_id: "other", rows: parseCsv(csv) },
        },
        user,
      ),
    ).toThrow();
    const first = applyImportTags(
      fixture(),
      {
        type: "import_statement",
        key: "k",
        payload: { account_id: "bank", rows: parseCsv(csv) },
      },
      user,
    )!;
    const rows = parseCsv(csv);
    rows[0].amount = -9000;
    rows[0].source!.amount = -9000;
    expect(() =>
      applyImportTags(
        first,
        {
          type: "import_statement",
          key: "k2",
          payload: { account_id: "bank", rows },
        },
        user,
      ),
    ).toThrow(/Identificador/);
  });
  it("vincula provável movimento existente sem novo débito", () => {
    const s = fixture(),
      row = parseCsv(csv)[0];
    s.entries = [
      {
        id: "existing",
        owner_id: "a",
        family_id: "f",
        description: "Loja",
        kind: "expense",
        amount: 5025,
        occurred_on: row.date,
        category: "Outros",
        house: false,
        consumer_id: "a",
        responsible_id: null,
        card_id: null,
        splits: [{ account_id: "bank", amount: 5025 }],
        version: 1,
        voided: false,
      },
    ];
    expect(() =>
      applyImportTags(
        s,
        {
          type: "import_statement",
          key: "k",
          payload: { account_id: "bank", rows: [row] },
        },
        user,
      ),
    ).toThrow(/duplicidade/);
    row.classification = "match";
    row.match_id = "existing";
    const result = applyImportTags(
      s,
      {
        type: "import_statement",
        key: "k",
        payload: { account_id: "bank", rows: [row] },
      },
      user,
    )!;
    expect(result.entries).toHaveLength(1);
    expect(balance(result.accounts[0], result)).toBe(94975);
  });
  it("transferência importada altera só saldo, nunca consumo nem salário", () => {
    const s = fixture(),
      row = parseCsv(csv)[0];
    row.classification = "transfer";
    const result = applyImportTags(
      s,
      {
        type: "import_statement",
        key: "k",
        payload: { account_id: "bank", rows: [row] },
      },
      user,
    )!;
    expect(result.entries).toHaveLength(0);
    expect(balance(result.accounts[0], result)).toBe(94975);
  });
  it("mantém origem imutável após corrigir a prévia e não duplica na reimportação", () => {
    const original =
      "Data;Descrição;Valor\n05/11/2026;Descrição bancária;-10,00";
    const rows = parseCsv(original);
    rows[0].description = "Descrição corrigida";
    rows[0].date = "2026-11-06";
    rows[0].amount = -1200;
    const first = applyImportTags(
      fixture(),
      {
        type: "import_statement",
        key: "k",
        payload: { account_id: "bank", rows },
      },
      user,
    )!;
    const repeat = applyImportTags(
      first,
      {
        type: "import_statement",
        key: "k2",
        payload: { account_id: "bank", rows: parseCsv(original) },
      },
      user,
    )!;
    expect(repeat.entries).toHaveLength(1);
    expect(repeat.entries[0]).toMatchObject({
      description: "Descrição corrigida",
      occurred_on: "2026-11-06",
      amount: 1200,
    });
  });
  it("renomeia etiquetas usadas sem excluir lançamentos e recusa concorrência", () => {
    let s = fixture();
    const row = parseCsv(csv)[0];
    s = applyImportTags(
      s,
      {
        type: "import_statement",
        key: "k",
        payload: { account_id: "bank", rows: [row] },
      },
      user,
    )!;
    s.entries[0].tags = ["Viagem"];
    s = applyImportTags(
      s,
      {
        type: "tag",
        key: "k2",
        payload: {
          id: "tag",
          old_name: "Viagem",
          name: "Férias",
          active: true,
          version: 0,
        },
      },
      user,
    )!;
    expect(s.entries[0].tags).toEqual(["Férias"]);
    expect(s.entries[0].version).toBe(2);
    expect(managedTags(s, "a")[0].name).toBe("Férias");
    expect(() =>
      applyImportTags(
        s,
        {
          type: "tag",
          key: "k3",
          payload: { id: "tag", name: "Outra", active: true, version: 0 },
        },
        user,
      ),
    ).toThrow();
  });
});
