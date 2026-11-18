import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIAS, hojeISO, mesDe, nomeMes, resumir, somarMes, type Lancamento, type Pagamento, type Tipo } from "./lancamentos";
import { lerValor, reais } from "./dinheiro";
import type { Repositorio, NovoLancamento } from "./repositorio";
import type { RepositorioCasa } from "./repositorioCasa";
import type { Forma } from "./casa";
import { podeGerenciarCasa, type Perfil } from "./tipos";
import { BANCOS, diaDoMes, gerarParcelas, nomeCartao, vencimentoDaCompra, type Cartao } from "./cartoes";
import { Folha, Segmento } from "./Folha";

type ParaCasa = Forma | "nao";
type Como = "dinheiro" | "debito" | "credito" | "beneficio";

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function Minhas({ repo, perfil, casa }: { repo: Repositorio; perfil: Perfil; casa: RepositorioCasa }) {
  const nome = perfil.nome;
  const perguntaCasa = !podeGerenciarCasa(perfil);
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [lista, setLista] = useState<Lancamento[] | null>(null);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<NovoLancamento | null>(null);
  const [gerenciarCartoes, setGerenciarCartoes] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [l, c] = await Promise.all([repo.listar(mes), repo.cartoes()]);
      setLista(l);
      setCartoes(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
      setLista([]);
    }
  }, [repo, mes]);

  useEffect(() => {
    setLista(null);
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 2400);
    return () => clearTimeout(t);
  }, [aviso]);

  const r = useMemo(() => resumir(lista ?? [], mes), [lista, mes]);
  const temBeneficio = r.beneficioRecebido > 0 || r.beneficioGasto > 0;
  const cartaoPorId = (id?: string | null) => cartoes.find((c) => c.id === id);

  // Faturas que vencem neste mês, por cartão.
  const faturas = useMemo(() => {
    const m = new Map<string, { total: number; data: string; itens: number }>();
    for (const l of lista ?? []) {
      if (l.pagamento !== "credito" || !l.cartaoId) continue;
      const f = m.get(l.cartaoId) ?? { total: 0, data: l.data, itens: 0 };
      m.set(l.cartaoId, { total: f.total + l.valor, data: l.data, itens: f.itens + 1 });
    }
    return m;
  }, [lista]);

  const novo = () =>
    setEditando({ data: mes === mesDe(hojeISO()) ? hojeISO() : `${mes}-01`, descricao: "", categoria: "Alimentação", valor: 0, tipo: "saida", meio: "dinheiro" });

  return (
    <>
      <div className="mes" role="group" aria-label="Mês">
        <button className="seta" aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>‹</button>
        <span>{nomeMes(mes)}</span>
        <button className="seta" aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>›</button>
      </div>

      <section className="destaque">
        <span className="rotulo">Sobra do mês em dinheiro · {nome}</span>
        <p className="valor-grande">{reais(r.sobra)}</p>
        <div className="duas">
          <div><span className="mini">Entrou</span><b>{reais(r.entrou)}</b></div>
          <div><span className="mini">Saiu</span><b>{reais(r.saiu)}</b></div>
        </div>
        {r.noCredito > 0 && <span className="mini">Inclui {reais(r.noCredito)} de faturas de cartão que vencem neste mês</span>}
      </section>

      {temBeneficio && (
        <section className="painel beneficio">
          <div className="cabeca"><h2>VR / VA</h2><span className="nota">Não é dinheiro em conta</span></div>
          <div className="tres">
            <div><span className="mini">Recebi</span><b>{reais(r.beneficioRecebido)}</b></div>
            <div><span className="mini">Usei ou enviei</span><b>{reais(r.beneficioGasto)}</b></div>
            <div><span className="mini">Sobrou</span><b>{reais(r.beneficioSobra)}</b></div>
          </div>
        </section>
      )}

      <section className="painel">
        <div className="cabeca">
          <h2>Cartões</h2>
          <button className="link" onClick={() => setGerenciarCartoes(true)}>{cartoes.length ? "Gerenciar" : "Cadastrar"}</button>
        </div>
        {cartoes.length === 0 && <p className="nota">Cadastre seus cartões para lançar compras no débito, no crédito e parceladas.</p>}
        <ul className="lista">
          {cartoes.map((c) => {
            const f = faturas.get(c.id);
            return (
              <li key={c.id}>
                <span className="icone cartao" aria-hidden="true">{c.banco.slice(0, 2)}</span>
                <span className="texto">
                  <b>{nomeCartao(c)}</b>
                  <span>
                    {[c.temCredito && "Crédito", c.temDebito && "Débito"].filter(Boolean).join(" e ")}
                    {c.temCredito && ` · fecha dia ${c.diaFechamento}, vence dia ${c.diaVencimento}`}
                  </span>
                </span>
                {c.temCredito && (
                  <span className="fim">
                    <b className="valor">{reais(f?.total ?? 0)}</b>
                    <span className="mini-cinza">fatura {f ? `vence ${dataCurta(f.data)}` : "do mês"}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="painel">
        <div className="cabeca">
          <h2>Lançamentos</h2>
          <button className="btn pequeno" onClick={novo}>+ Lançar</button>
        </div>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {lista === null && <p className="nota">Carregando…</p>}
        {lista?.length === 0 && !erro && (
          <div className="vazio">
            <p>Nada lançado em {nomeMes(mes).toLowerCase()}.</p>
            <p className="nota">Comece pelo salário ou pelo VR/VA que entrou.</p>
          </div>
        )}
        <ul className="lista">
          {lista?.map((l) => {
            const c = cartaoPorId(l.cartaoId);
            const extra = [
              l.pagamento === "credito" ? `${c ? c.banco : "Crédito"}${l.parcelas && l.parcelas > 1 ? ` · ${l.parcela}/${l.parcelas}` : " · crédito"}` : null,
              l.pagamento === "debito" ? `${c ? c.banco : ""} débito`.trim() : null,
              l.meio === "beneficio" ? "VR/VA" : null,
            ].filter(Boolean);
            return (
              <li key={l.id}>
                <button className="item" onClick={() => setEditando(l)}>
                  <span className={`icone ${l.tipo} ${l.meio}`} aria-hidden="true">{l.categoria.slice(0, 2)}</span>
                  <span className="texto">
                    <b>{l.descricao}</b>
                    <span>{l.categoria} · {dataCurta(l.data)}{extra.length ? ` · ${extra.join(" · ")}` : ""}</span>
                  </span>
                  <span className={`valor ${l.tipo}`}>{l.tipo === "entrada" ? "+" : "−"}{reais(l.valor)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {editando && (
        <Formulario
          inicial={editando}
          cartoes={cartoes}
          perguntaCasa={perguntaCasa && !editando.id}
          cadastrarCartao={() => { setEditando(null); setGerenciarCartoes(true); }}
          fechar={() => setEditando(null)}
          salvar={async (itens, paraCasa) => {
            if (itens.length === 1) await repo.salvar(itens[0]);
            else await repo.salvarVarios(itens);
            const l = itens[0];
            if (paraCasa !== "nao") await casa.informarAjuda(perfil.id, { data: l.dataCompra ?? l.data, descricao: l.descricao, valor: l.valor, meio: l.meio, forma: paraCasa });
            setEditando(null);
            setAviso(itens.length > 1 ? `${itens.length} parcelas lançadas` : paraCasa !== "nao" ? "Salvo e informado na Casa" : l.id ? "Lançamento atualizado" : "Lançamento salvo");
            if (mesDe(l.data) !== mes) setMes(mesDe(l.data));
            else await carregar();
          }}
          apagar={
            editando.id
              ? async () => {
                  if (editando.compraId && (editando.parcelas ?? 1) > 1) await repo.apagarCompra(editando.compraId);
                  else await repo.apagar(editando.id!);
                  setEditando(null);
                  setAviso("Apagado");
                  await carregar();
                }
              : undefined
          }
        />
      )}
      {gerenciarCartoes && (
        <GerenciarCartoes cartoes={cartoes} fechar={() => setGerenciarCartoes(false)}
          salvar={async (c) => { await repo.salvarCartao(c); setAviso("Cartão salvo"); await carregar(); }}
          remover={async (id) => { await repo.removerCartao(id); setAviso("Cartão removido"); await carregar(); }} />
      )}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </>
  );
}

function Formulario({ inicial, cartoes, perguntaCasa, cadastrarCartao, fechar, salvar, apagar }: {
  inicial: NovoLancamento;
  cartoes: Cartao[];
  perguntaCasa: boolean;
  cadastrarCartao: () => void;
  fechar: () => void;
  salvar: (itens: NovoLancamento[], paraCasa: ParaCasa) => Promise<void>;
  apagar?: () => Promise<void>;
}) {
  const editando = Boolean(inicial.id);
  const ehParcelaExistente = editando && (inicial.parcelas ?? 1) > 1;
  const [tipo, setTipo] = useState<Tipo>(inicial.tipo);
  const [como, setComo] = useState<Como>(inicial.meio === "beneficio" ? "beneficio" : (inicial.pagamento as Como) ?? "dinheiro");
  const [cartaoId, setCartaoId] = useState(inicial.cartaoId ?? "");
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [valor, setValor] = useState(inicial.valor ? (inicial.valor / 100).toFixed(2).replace(".", ",") : "");
  const [categoria, setCategoria] = useState(inicial.categoria);
  const [data, setData] = useState(inicial.dataCompra ?? inicial.data);
  const [parcelas, setParcelas] = useState(String(inicial.parcelas ?? 1));
  const [emAndamento, setEmAndamento] = useState(false);
  const [parcelaAtual, setParcelaAtual] = useState("1");
  const [mesFatura, setMesFatura] = useState(mesDe(hojeISO()));
  const [paraCasa, setParaCasa] = useState<ParaCasa>("enviado");

  const categorias = CATEGORIAS[tipo];
  useEffect(() => {
    if (!categorias.includes(categoria)) setCategoria(categorias[0]);
    if (tipo === "entrada" && (como === "debito" || como === "credito")) setComo("dinheiro");
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcoesCartao = cartoes.filter((c) => (como === "credito" ? c.temCredito : c.temDebito));
  useEffect(() => {
    if ((como === "credito" || como === "debito") && !opcoesCartao.some((c) => c.id === cartaoId)) setCartaoId(opcoesCartao[0]?.id ?? "");
  }, [como]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartao = cartoes.find((c) => c.id === cartaoId);
  const nParcelas = Math.max(1, Math.min(48, parseInt(parcelas, 10) || 1));
  const nAtual = Math.max(1, Math.min(nParcelas, parseInt(parcelaAtual, 10) || 1));
  const credito = como === "credito" && !editando;
  const parcelado = credito && nParcelas > 1;
  const centavos = lerValor(valor);

  // Prévia das parcelas para mostrar antes de salvar.
  const previa = useMemo(() => {
    if (!credito || !cartao?.diaFechamento || !cartao.diaVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
    const primeiro = emAndamento
      ? diaDoMes(Number(mesFatura.slice(0, 4)), Number(mesFatura.slice(5, 7)), cartao.diaVencimento)
      : vencimentoDaCompra(data, cartao.diaFechamento, cartao.diaVencimento);
    return gerarParcelas(primeiro, cartao.diaVencimento, emAndamento ? nAtual : 1, nParcelas);
  }, [credito, cartao, data, emAndamento, mesFatura, nAtual, nParcelas]);

  const mostrarCasa = perguntaCasa && tipo === "saida" && categoria === "Casa" && !parcelado;

  async function enviar(): Promise<string | void> {
    if (!descricao.trim()) return "Escreva uma descrição.";
    if (centavos === null) return "Digite um valor maior que zero, como 150,00.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Escolha a data.";
    if ((como === "credito" || como === "debito") && !cartao) return "Escolha o cartão ou cadastre um.";
    const base: NovoLancamento = {
      id: inicial.id, tipo, descricao: descricao.trim(), valor: centavos, categoria, data,
      meio: como === "beneficio" ? "beneficio" : "dinheiro",
      pagamento: tipo === "saida" && (como === "debito" || como === "credito") ? (como as Pagamento) : null,
      cartaoId: tipo === "saida" && (como === "debito" || como === "credito") ? cartaoId : null,
      compraId: inicial.compraId ?? null, parcela: inicial.parcela ?? null, parcelas: inicial.parcelas ?? null, dataCompra: inicial.dataCompra ?? null,
    };
    if (editando) {
      // Editar mexe só nesta linha (numa compra parcelada, só nesta parcela).
      return salvar([{ ...base, data: ehParcelaExistente ? inicial.data : data, dataCompra: ehParcelaExistente ? inicial.dataCompra ?? null : base.dataCompra }], "nao");
    }
    if (credito) {
      if (!previa) return "Confira o cartão e a data.";
      const compraId = novoId();
      const itens = previa.map((p) => ({
        ...base, data: p.data, dataCompra: emAndamento ? null : data, compraId,
        parcela: nParcelas > 1 ? p.parcela : null, parcelas: nParcelas > 1 ? p.parcelas : null,
      }));
      return salvar(itens, mostrarCasa ? paraCasa : "nao");
    }
    return salvar([base], mostrarCasa ? paraCasa : "nao");
  }

  const comoOpcoes: [Como, string][] = tipo === "saida"
    ? [["dinheiro", "Dinheiro/Pix"], ["debito", "Débito"], ["credito", "Crédito"], ["beneficio", "VR/VA"]]
    : [["dinheiro", "Dinheiro"], ["beneficio", "VR / VA"]];

  return (
    <Folha
      titulo={editando ? (ehParcelaExistente ? `Parcela ${inicial.parcela}/${inicial.parcelas}` : "Editar lançamento") : "Novo lançamento"}
      fechar={fechar}
      salvar={enviar}
      apagar={apagar}
      textoApagar={ehParcelaExistente ? "Apagar a compra toda" : "Apagar lançamento"}
    >
      {!ehParcelaExistente && <Segmento rotulo="Tipo" valor={tipo} mudar={setTipo} opcoes={[["saida", "Saída"], ["entrada", "Entrada"]]} />}
      {!ehParcelaExistente && <Segmento rotulo="Como" valor={como} mudar={setComo} opcoes={comoOpcoes} />}

      {(como === "debito" || como === "credito") && tipo === "saida" && !ehParcelaExistente && (
        opcoesCartao.length ? (
          <label className="campo" htmlFor="f-cartao">
            Cartão
            <select id="f-cartao" value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
              {opcoesCartao.map((c) => <option key={c.id} value={c.id}>{nomeCartao(c)}</option>)}
            </select>
          </label>
        ) : (
          <p className="nota">Nenhum cartão com {como === "credito" ? "crédito" : "débito"}. <button type="button" className="link" onClick={cadastrarCartao}>Cadastrar cartão</button></p>
        )
      )}

      <label className="campo" htmlFor="f-descricao">
        Descrição
        <input id="f-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "entrada" ? "Ex.: Salário" : "Ex.: Mercado"} maxLength={80} />
      </label>

      {credito && (
        <div className="duas">
          <label className="campo" htmlFor="f-parcelas">
            Parcelas
            <input id="f-parcelas" inputMode="numeric" value={parcelas} onChange={(e) => setParcelas(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="1" />
          </label>
          {nParcelas > 1 ? (
            <label className="campo marcar" htmlFor="f-andamento">
              <input id="f-andamento" type="checkbox" checked={emAndamento} onChange={(e) => setEmAndamento(e.target.checked)} />
              Já está em andamento
            </label>
          ) : <span />}
        </div>
      )}

      {parcelado && emAndamento && (
        <div className="duas">
          <label className="campo" htmlFor="f-atual">
            Parcela atual
            <input id="f-atual" inputMode="numeric" value={parcelaAtual} onChange={(e) => setParcelaAtual(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </label>
          <label className="campo" htmlFor="f-mesfatura">
            Fatura dela
            <input id="f-mesfatura" type="month" value={mesFatura} onChange={(e) => setMesFatura(e.target.value)} />
          </label>
        </div>
      )}

      <div className="duas">
        <label className="campo" htmlFor="f-valor">
          {parcelado ? "Valor de cada parcela" : "Valor (R$)"}
          <input id="f-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
        {!(parcelado && emAndamento) && !ehParcelaExistente && (
          <label className="campo" htmlFor="f-data">
            {credito ? "Data da compra" : "Data"}
            <input id="f-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
        )}
      </div>

      <label className="campo" htmlFor="f-categoria">
        Categoria
        <select id="f-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>

      {previa && centavos !== null && (
        <div className="previa">
          {previa.length === 1 ? (
            <p>Entra na fatura que vence em <b>{dataCurta(previa[0].data)}/{previa[0].data.slice(0, 4)}</b>.</p>
          ) : (
            <>
              <p><b>{previa.length} parcelas</b> de {reais(centavos)} · total {emAndamento ? "que falta" : ""} {reais(centavos * previa.length)}</p>
              <p className="nota">
                Da {previa[0].parcela}ª ({dataCurta(previa[0].data)}/{previa[0].data.slice(2, 4)}) até a {previa[previa.length - 1].parcela}ª ({dataCurta(previa[previa.length - 1].data)}/{previa[previa.length - 1].data.slice(2, 4)})
                {emAndamento && nAtual > 1 ? `. As ${nAtual - 1} anteriores não entram.` : "."}
              </p>
            </>
          )}
        </div>
      )}

      {mostrarCasa && (
        <div className="campo">
          Também na aba Casa?
          <div className="segmento tres-op" role="group" aria-label="Também na aba Casa">
            <button type="button" aria-pressed={paraCasa === "enviado"} onClick={() => setParaCasa("enviado")}>Enviei para a Casa</button>
            <button type="button" aria-pressed={paraCasa === "pago_direto"} onClick={() => setParaCasa("pago_direto")}>Paguei despesa da Casa</button>
            <button type="button" aria-pressed={paraCasa === "nao"} onClick={() => setParaCasa("nao")}>Não contar</button>
          </div>
          <span className="nota">Conta como sua ajuda do mês. Seus pais confirmam.</span>
        </div>
      )}
      {ehParcelaExistente && <p className="nota">Alterar muda só esta parcela. Apagar remove todas as parcelas desta compra.</p>}
    </Folha>
  );
}

function GerenciarCartoes({ cartoes, fechar, salvar, remover }: {
  cartoes: Cartao[];
  fechar: () => void;
  salvar: (c: Omit<Cartao, "id"> & { id?: string }) => Promise<void>;
  remover: (id: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<(Omit<Cartao, "id"> & { id?: string }) | null>(cartoes.length ? null : { banco: "Nubank", apelido: null, temCredito: true, temDebito: false, diaFechamento: null, diaVencimento: null });
  if (editando) return <FormCartao inicial={editando} voltar={() => (cartoes.length ? setEditando(null) : fechar())} salvar={async (c) => { await salvar(c); setEditando(null); }} remover={editando.id ? async () => { await remover(editando.id!); setEditando(null); } : undefined} />;
  return (
    <Folha titulo="Meus cartões" fechar={fechar} textoSalvar="Pronto" salvar={async () => fechar()}>
      <ul className="lista">
        {cartoes.map((c) => (
          <li key={c.id}>
            <button type="button" className="item" onClick={() => setEditando(c)}>
              <span className="icone cartao" aria-hidden="true">{c.banco.slice(0, 2)}</span>
              <span className="texto"><b>{nomeCartao(c)}</b><span>{[c.temCredito && `Crédito (fecha ${c.diaFechamento}, vence ${c.diaVencimento})`, c.temDebito && "Débito"].filter(Boolean).join(" · ")}</span></span>
              <span className="link">Editar</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn fantasma" onClick={() => setEditando({ banco: "Nubank", apelido: null, temCredito: true, temDebito: false, diaFechamento: null, diaVencimento: null })}>+ Adicionar cartão</button>
    </Folha>
  );
}

function FormCartao({ inicial, voltar, salvar, remover }: {
  inicial: Omit<Cartao, "id"> & { id?: string };
  voltar: () => void;
  salvar: (c: Omit<Cartao, "id"> & { id?: string }) => Promise<void>;
  remover?: () => Promise<void>;
}) {
  const conhecido = BANCOS.includes(inicial.banco);
  const [banco, setBanco] = useState(conhecido ? inicial.banco : "Outro");
  const [outro, setOutro] = useState(conhecido ? "" : inicial.banco);
  const [apelido, setApelido] = useState(inicial.apelido ?? "");
  const [funcoes, setFuncoes] = useState<"credito" | "debito" | "ambos">(inicial.temCredito && inicial.temDebito ? "ambos" : inicial.temDebito ? "debito" : "credito");
  const [fechamento, setFechamento] = useState(inicial.diaFechamento ? String(inicial.diaFechamento) : "");
  const [vencimento, setVencimento] = useState(inicial.diaVencimento ? String(inicial.diaVencimento) : "");
  const temCredito = funcoes !== "debito";
  const dia = (t: string) => { const n = parseInt(t, 10); return n >= 1 && n <= 31 ? n : null; };

  return (
    <Folha titulo={inicial.id ? "Editar cartão" : "Novo cartão"} fechar={voltar} apagar={remover} textoApagar="Remover cartão" salvar={async () => {
      const nomeBanco = banco === "Outro" ? outro.trim() : banco;
      if (!nomeBanco) return "Escreva o nome do banco.";
      if (temCredito && (!dia(fechamento) || !dia(vencimento))) return "Informe o dia de fechamento e o de vencimento (1 a 31).";
      await salvar({ id: inicial.id, banco: nomeBanco, apelido: apelido.trim() || null, temCredito, temDebito: funcoes !== "credito", diaFechamento: temCredito ? dia(fechamento) : null, diaVencimento: temCredito ? dia(vencimento) : null });
    }}>
      <label className="campo" htmlFor="k-banco">
        Banco
        <select id="k-banco" value={banco} onChange={(e) => setBanco(e.target.value)}>
          {BANCOS.map((b) => <option key={b}>{b}</option>)}
          <option>Outro</option>
        </select>
      </label>
      {banco === "Outro" && (
        <label className="campo" htmlFor="k-outro">Nome do banco<input id="k-outro" value={outro} maxLength={30} onChange={(e) => setOutro(e.target.value)} /></label>
      )}
      <label className="campo" htmlFor="k-apelido">Apelido (opcional)<input id="k-apelido" value={apelido} maxLength={30} onChange={(e) => setApelido(e.target.value)} placeholder="Ex.: final 1234, Black" /></label>
      <Segmento rotulo="Funções" valor={funcoes} mudar={setFuncoes} opcoes={[["credito", "Crédito"], ["debito", "Débito"], ["ambos", "Os dois"]]} />
      {temCredito && (
        <div className="duas">
          <label className="campo" htmlFor="k-fecha">Dia que fecha<input id="k-fecha" inputMode="numeric" value={fechamento} onChange={(e) => setFechamento(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex.: 3" /></label>
          <label className="campo" htmlFor="k-vence">Dia que vence<input id="k-vence" inputMode="numeric" value={vencimento} onChange={(e) => setVencimento(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex.: 10" /></label>
        </div>
      )}
      {temCredito && <p className="nota">Compras feitas até o dia antes do fechamento entram na fatura do mês; a partir do fechamento, na seguinte.</p>}
    </Folha>
  );
}

