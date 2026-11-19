import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIAS, dividirTotal, hojeISO, mesDe, nomeMes, resumir, somarMes, type Lancamento, type Pagamento, type Tipo } from "./lancamentos";
import { lerValor, reais } from "./dinheiro";
import type { Repositorio, NovoLancamento } from "./repositorio";
import type { RepositorioCasa } from "./repositorioCasa";
import type { Forma } from "./casa";
import { podeGerenciarCasa, type Perfil } from "./tipos";
import { BANCOS, datasDoLancamento, diaDoMes, gerarParcelas, nomeCartao, nomeEmprestado, vencimentoDaCompra, type Cartao } from "./cartoes";
import { Folha, Segmento } from "./Folha";
import { CartaoDetalhe } from "./CartaoDetalhe";
import { Busca } from "./Busca";
import { lancamentoDoFixo, pendentesDoMes, saldoAcumulado, situacaoLimites, valorSugerido, type HistoricoFixos, type Limites, type Recorrente } from "./fixos";
import { gastosPorCategoria } from "./resumo";
import { comCor, corBanco, corCategoria } from "./cores";

type ParaCasa = Forma | "nao";
type Como = "dinheiro" | "debito" | "credito" | "beneficio";

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function Minhas({ repo, perfil, casa, familia }: { repo: Repositorio; perfil: Perfil; casa: RepositorioCasa; familia: Perfil[] }) {
  const nomeDe = (id?: string | null) => familia.find((p) => p.id === id)?.nome ?? "Alguém";
  const nome = perfil.nome;
  const perguntaCasa = !podeGerenciarCasa(perfil);
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [lista, setLista] = useState<Lancamento[] | null>(null);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [queUso, setQueUso] = useState<Cartao[]>([]);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<NovoLancamento | null>(null);
  const [novoCartao, setNovoCartao] = useState(false);
  const [vendoCartao, setVendoCartao] = useState<Cartao | null>(null);
  const [mesCartao, setMesCartao] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [todosCartoes, setTodosCartoes] = useState(false);
  const [fixos, setFixos] = useState<Recorrente[]>([]);
  const [lancados, setLancados] = useState<string[]>([]);
  const [limites, setLimites] = useState<Limites>({});
  const [historico, setHistorico] = useState<HistoricoFixos>({});
  const [acumulado, setAcumulado] = useState<{ valor: number; inicial: { mes: string; valor: number } | null } | null>(null);
  const [versao, setVersao] = useState(0); // recarrega a tela do cartão depois de editar
  const [abertos, setAbertos] = useState<string[]>([]); // pendências abertas
  const [aReceber, setAReceber] = useState<Lancamento[]>([]);
  const [devo, setDevo] = useState<(Lancamento & { dono: string })[]>([]);
  const [recebendo, setRecebendo] = useState<string | null>(null); // pessoa
  const [pagando, setPagando] = useState<string | null>(null); // dono do cartão
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const [l, c, ar, dv, qu, fx, fl, lm] = await Promise.all([
        repo.listar(mes), repo.cartoes(), repo.aReceber(), repo.devo(), repo.cartoesQueUso(), repo.recorrentes(), repo.fixosLancados(mes), repo.limites(),
      ]);
      setFixos(fx);
      const [hf, si] = await Promise.all([repo.historicoFixos(), repo.saldoInicial()]);
      setHistorico(hf);
      const tudo = await repo.listarIntervalo(si?.mes ?? "2000-01", mes);
      setAcumulado({ valor: saldoAcumulado(tudo, si, mes), inicial: si });
      setLancados(fl);
      setLimites(lm);
      setLista(l);
      setCartoes(c);
      setQueUso(qu);
      setVersao((v) => v + 1);
      setAReceber(ar);
      setDevo(dv);
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

  const agrupar = <T extends Lancamento>(itens: T[], chave: (l: T) => string) => {
    const m = new Map<string, T[]>();
    for (const l of itens) m.set(chave(l), [...(m.get(chave(l)) ?? []), l]);
    return [...m.entries()].map(([pessoa, ls]) => ({ pessoa, itens: ls, total: ls.reduce((s, l) => s + l.valor, 0) }));
  };
  // Só o que vence até o mês escolhido (fatura do mês e atrasadas); parcelas futuras ficam para os meses delas.
  const aReceberMes = aReceber.filter((l) => mesDe(l.data) <= mes);
  const devoMes = devo.filter((l) => mesDe(l.data) <= mes);
  const receberPorPessoa = agrupar(aReceberMes, (l) => l.deQuem!);
  const devoPorPessoa = agrupar(devoMes, (l) => l.dono);
  const pendencias = receberPorPessoa.length + devoPorPessoa.length;
  const pendentes = pendentesDoMes(fixos, lancados, mes, mesDe(hojeISO()));
  const alertas = useMemo(() => situacaoLimites(limites, gastosPorCategoria(lista ?? [], mes)).filter((x) => x.estado !== "ok"), [limites, lista, mes]);
  const lancarFixos = async (rs: Recorrente[]) => {
    try {
      for (const f of rs) await repo.salvar(lancamentoDoFixo(f, mes, cartoes.find((c) => c.id === f.cartaoId), valorSugerido(f, historico, mes).valor));
      setAviso(rs.length > 1 ? `${rs.length} fixos lançados` : `${rs[0].descricao} lançado`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao lançar.");
    }
    await carregar();
  };
  // Só os cartões com fatura no mês e os de outra pessoa que você usa (para lançar compra).
  const cartoesCredito = [...cartoes.filter((c) => todosCartoes || faturas.has(c.id)), ...queUso.filter((c) => c.temCredito)];
  const escondidos = cartoes.filter((c) => !faturas.has(c.id)).length;

  const novo = (cartao?: Cartao) =>
    setEditando({
      data: mes === mesDe(hojeISO()) ? hojeISO() : `${mes}-01`, descricao: "", categoria: cartao ? "Compras" : "Alimentação", valor: 0, tipo: "saida", meio: "dinheiro",
      ...(cartao ? { pagamento: "credito" as const, cartaoId: cartao.id, deQuem: perfil.id, dono: cartao.dono } : {}),
    });

  return (
    <>
      {buscando ? (
        <Busca repo={repo} cartoes={cartoes} versao={versao} voltar={() => setBuscando(false)} abrir={setEditando} />
      ) : vendoCartao ? (
        <CartaoDetalhe key={`${vendoCartao.id}-${versao}`} repo={repo} cartao={vendoCartao} cartoes={cartoes} trocar={(c, m) => { setMesCartao(m); setVendoCartao(c); }}
          mesInicial={mesCartao ?? mes} nomeDe={nomeDe} voltar={() => { setVendoCartao(null); setMesCartao(null); }} abrir={setEditando} />
      ) : (
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
        {acumulado && (
          <div className="acumulado">
            <div><span className="mini">Saldo acumulado até {nomeMes(mes).split(" ")[0].toLowerCase()}</span><b>{reais(acumulado.valor)}</b></div>
            <span className="mini">
              {acumulado.inicial
                ? `Saldo inicial de ${reais(acumulado.inicial.valor)} em ${nomeMes(acumulado.inicial.mes).toLowerCase()} + as sobras de cada mês.`
                : "Soma das sobras de todos os meses. Informe seu saldo inicial em Ajustes para bater com o banco."}
            </span>
          </div>
        )}
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

      {alertas.length > 0 && (
        <section className="painel">
          <h2>Limites</h2>
          <ul className="lista">
            {alertas.map((a) => (
              <li key={a.categoria}>
                <span className={`estado-icone ${a.estado}`} aria-hidden="true">{a.estado === "passou" ? "!" : "⚠"}</span>
                <span className="texto">
                  <b>{a.categoria}</b>
                  <span>{a.estado === "passou" ? `Passou ${reais(a.gasto - a.limite)} do limite` : `Perto do limite: ${Math.round(a.parte * 100)}% usado`}</span>
                </span>
                <span className="fim"><b className="valor">{reais(a.gasto)}</b><span className="mini-cinza">de {reais(a.limite)}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pendentes.length > 0 && (
        <section className="painel">
          <div className="cabeca">
            <h2>Fixos de {nomeMes(mes).split(" ")[0].toLowerCase()}</h2>
            {pendentes.length > 1 && <button className="btn pequeno" onClick={() => lancarFixos(pendentes)}>Lançar todos</button>}
          </div>
          <ul className="lista">
            {pendentes.map((f) => {
              const c = cartoes.find((x) => x.id === f.cartaoId);
              const sug = valorSugerido(f, historico, mes);
              return (
                <li key={f.id}>
                  <button className="item" onClick={() => setEditando(lancamentoDoFixo(f, mes, c, sug.valor))}>
                    <span className={`icone ${f.tipo} ${f.meio}${f.tipo === "saida" && f.meio === "dinheiro" ? " com-cor" : ""}`} style={comCor(corCategoria(f.categoria))} aria-hidden="true">{f.categoria.slice(0, 2)}</span>
                    <span className="texto">
                      <b>{f.descricao}</b>
                      <span>dia {f.dia}{sug.media ? ` · média de ${sug.meses} ${sug.meses === 1 ? "mês" : "meses"}` : ""}{f.pagamento ? ` · ${c ? c.banco : ""} ${f.pagamento === "credito" ? "crédito" : "débito"}` : f.meio === "beneficio" ? " · VR/VA" : ""}</span>
                    </span>
                    <span className={`valor ${f.tipo}`}>{f.tipo === "entrada" ? "+" : "−"}{reais(sug.valor)}</span>
                  </button>
                  <button className="btn pequeno fantasma" onClick={() => lancarFixos([f])}>Lançar</button>
                </li>
              );
            })}
          </ul>
          <p className="nota">Toque no nome para mudar o valor antes de lançar. Os fixos ficam em Ajustes.</p>
        </section>
      )}

      {(pendencias > 0) && (
        <section className="painel">
          <h2>Pendências</h2>
          <ul className="lista">
            {receberPorPessoa.map((g) => {
              const avisou = g.itens.filter((l) => l.pagamentoInformadoEm);
              const quando = avisou.map((l) => l.pagamentoInformadoEm!).sort().pop();
              return (
                <li key={`r-${g.pessoa}`}>
                  <span className="avatar" aria-hidden="true">{nomeDe(g.pessoa).slice(0, 1)}</span>
                  <span className="texto">
                    <b>{nomeDe(g.pessoa)} te deve {reais(g.total)}</b>
                    {avisou.length
                      ? <span className="destaque-texto">Disse que pagou {reais(avisou.reduce((s, l) => s + l.valor, 0))} em {dataCurta(quando!)}</span>
                      : <span>{g.itens.length} {g.itens.length === 1 ? "compra" : "compras"} nos seus cartões</span>}
                  </span>
                  <button className="btn pequeno" onClick={() => setRecebendo(g.pessoa)}>{avisou.length ? "Confirmar" : "Recebi"}</button>
                </li>
              );
            })}
            {devoPorPessoa.map((g) => {
              const falta = g.itens.some((l) => !l.pagamentoInformadoEm);
              // O que você já avisou que pagou não conta mais como dívida.
              const aindaDeve = g.itens.filter((l) => !l.pagamentoInformadoEm).reduce((s, l) => s + l.valor, 0);
              const aberto = abertos.includes(g.pessoa);
              return (
                <li key={`d-${g.pessoa}`} className="com-detalhe">
                  <div className="linha-item">
                    <button className="item" aria-expanded={aberto} onClick={() => setAbertos(aberto ? abertos.filter((x) => x !== g.pessoa) : [...abertos, g.pessoa])}>
                      <span className="avatar deve" aria-hidden="true">{nomeDe(g.pessoa).slice(0, 1)}</span>
                      <span className="texto">
                        <b>{falta ? `Você deve ${reais(aindaDeve)} a ${nomeDe(g.pessoa)}` : `Você pagou ${reais(g.total)} a ${nomeDe(g.pessoa)}`}</b>
                        <span>{falta ? `${g.itens.filter((l) => !l.pagamentoInformadoEm).length} ${g.itens.filter((l) => !l.pagamentoInformadoEm).length === 1 ? "compra" : "compras"}` : "Você avisou · esperando confirmar"} · {aberto ? "ocultar" : "ver"}</span>
                      </span>
                    </button>
                    {falta && <button className="btn pequeno" onClick={() => setPagando(g.pessoa)}>Paguei</button>}
                  </div>
                  {aberto && (
                    <ul className="lista sub">
                      {g.itens.map((l) => {
                        const c = queUso.find((x) => x.id === l.cartaoId);
                        const texto = (
                          <>
                            <span className="texto"><b>{l.descricao}</b><span>{c ? `${nomeEmprestado(c, nomeDe(c.dono))} · ` : ""}fatura {dataCurta(l.data)}{l.parcelas && l.parcelas > 1 ? ` · ${l.parcela}/${l.parcelas}` : ""}{l.pagamentoInformadoEm ? ` · pago em ${dataCurta(l.pagamentoInformadoEm)}` : ""}</span></span>
                            <span className="valor">{reais(l.valor)}</span>
                          </>
                        );
                        // Só dá para corrigir compras feitas em cartões que você ainda usa.
                        return <li key={l.id}>{c ? <button className="item" onClick={() => setEditando(l)}>{texto}</button> : texto}</li>;
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(cartoesCredito.length > 0 || escondidos > 0) && (
        <section className="painel">
          <h2>Cartões em {nomeMes(mes).split(" ")[0].toLowerCase()}</h2>
          <ul className="lista">
            {cartoesCredito.map((c) => {
              const f = faturas.get(c.id);
              const meu = !c.dono;
              const aPagar = meu ? 0 : devoMes.filter((l) => l.cartaoId === c.id && !l.pagamentoInformadoEm).reduce((s, l) => s + l.valor, 0);
              return (
                <li key={c.id}>
                  {meu ? (
                    <button className="item" onClick={() => setVendoCartao(c)} aria-label={`Ver ${nomeCartao(c)}`}>
                      <span className="icone cartao com-cor" style={comCor(corBanco(c.banco))} aria-hidden="true">{c.banco.slice(0, 2)}</span>
                      <span className="texto">
                        <b>{nomeCartao(c)}</b>
                        <span>{c.temCredito ? (f ? `vence ${dataCurta(f.data)}` : `vence dia ${c.diaVencimento}`) : "só débito"}</span>
                      </span>
                      <span className="valor">{c.temCredito ? reais(f?.total ?? 0) : ""}</span>
                      <span className="seta-item" aria-hidden="true">›</span>
                    </button>
                  ) : (
                    <>
                      <span className="icone cartao com-cor" style={comCor(corBanco(c.banco))} aria-hidden="true">{c.banco.slice(0, 2)}</span>
                      <span className="texto">
                        <b>{nomeEmprestado(c, nomeDe(c.dono))}</b>
                        <span>emprestado{aPagar ? ` · você deve ${reais(aPagar)}` : ""}</span>
                      </span>
                      <button className="btn pequeno" onClick={() => novo(c)}>+ Compra</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {escondidos > 0 && (
            <button className="link ver-todos" onClick={() => setTodosCartoes(!todosCartoes)}>
              {todosCartoes ? "Mostrar só os com fatura" : `Ver todos os cartões (${escondidos} sem fatura no mês)`}
            </button>
          )}
        </section>
      )}

      <section className="painel">
        <div className="cabeca">
          <h2>Lançamentos</h2>
          <div className="cabeca-botoes">
            <button className="btn pequeno fantasma" onClick={() => setBuscando(true)} aria-label="Buscar lançamentos">Buscar</button>
            <button className="btn pequeno" onClick={() => novo()}>+ Lançar</button>
          </div>
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
              l.deQuem ? `de ${nomeDe(l.deQuem)}${l.reembolsoId ? " (pago)" : ""}` : null,
            ].filter(Boolean);
            return (
              <li key={l.id}>
                <button className="item" onClick={() => setEditando(l)}>
                  <span className={`icone ${l.tipo} ${l.meio}${l.tipo === "saida" && l.meio === "dinheiro" ? " com-cor" : ""}`} style={comCor(corCategoria(l.categoria))} aria-hidden="true">{l.categoria.slice(0, 2)}</span>
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

      </>
      )}

      {editando && (
        <Formulario
          inicial={editando}
          cartoes={[...cartoes, ...queUso]}
          eu={perfil}
          nomeDe={nomeDe}
          familia={familia}
          perguntaCasa={perguntaCasa && !editando.id}
          cadastrarCartao={() => { setEditando(null); setNovoCartao(true); }}
          fechar={() => setEditando(null)}
          salvar={async (itens, paraCasa, repetir) => {
            if (repetir) {
              const p = itens[0];
              const d = p.dataCompra ?? p.data;
              const id = await repo.salvarRecorrente({
                descricao: p.descricao, categoria: p.categoria, valor: p.valor, tipo: p.tipo, meio: p.meio, pagamento: p.pagamento ?? null,
                cartaoId: p.cartaoId ?? null, dia: Number(d.slice(8, 10)), desde: d.slice(0, 7), ativo: true,
              });
              itens = itens.map((i) => ({ ...i, recorrenteId: id, recorrenteMes: d.slice(0, 7) }));
            }
            if (itens.length === 1) await repo.salvar(itens[0]);
            else await repo.salvarVarios(itens);
            const l = itens[0];
            if (paraCasa !== "nao") await casa.informarAjuda(perfil.id, { data: l.dataCompra ?? l.data, descricao: l.descricao, valor: l.valor, meio: l.meio, forma: paraCasa });
            setEditando(null);
            setAviso(repetir ? "Salvo e vai se repetir todo mês" : l.dono ? `Lançado no cartão de ${nomeDe(l.dono)}` : itens.length > 1 ? `${itens.length} parcelas lançadas` : paraCasa !== "nao" ? "Salvo e informado na Casa" : l.id ? "Lançamento atualizado" : "Lançamento salvo");
            if (!l.dono && mesDe(l.data) !== mes) setMes(mesDe(l.data));
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
      {recebendo && (
        <MarcarCompras
          titulo={`Recebi de ${nomeDe(recebendo)}`}
          nota={(total) => `Marque o que ${nomeDe(recebendo)} pagou. Entra como uma entrada de ${reais(total)} na sua sobra do mês.`}
          rotuloData="Data do recebimento"
          textoSalvar={(total) => `Confirmar ${reais(total)}`}
          itens={aReceberMes.filter((l) => l.deQuem === recebendo)}
          fechar={() => setRecebendo(null)}
          salvar={async (ids, data) => {
            await repo.registrarReembolso(ids, data, `Reembolso de ${nomeDe(recebendo)}`);
            setRecebendo(null);
            setAviso("Recebimento registrado");
            if (mesDe(data) !== mes) setMes(mesDe(data));
            else await carregar();
          }}
        />
      )}
      {pagando && (
        <MarcarCompras
          titulo={`Paguei a ${nomeDe(pagando)}`}
          nota={(total) => `Marque o que você pagou (${reais(total)}). ${nomeDe(pagando)} vê o aviso e confirma.`}
          rotuloData="Data do pagamento"
          textoSalvar={(total) => `Avisar ${reais(total)}`}
          itens={devoMes.filter((l) => l.dono === pagando && !l.pagamentoInformadoEm)}
          opcao="Lançar como saída nas minhas finanças"
          fechar={() => setPagando(null)}
          salvar={async (ids, data, lancar) => {
            await repo.informarPagamento(ids, data);
            // O dinheiro saiu da sua conta: entra nas suas saídas, com a categoria de cada compra.
            if (lancar) {
              const pagas = devo.filter((l) => ids.includes(l.id));
              await repo.salvarVarios(pagas.map((l) => ({
                data, descricao: `${l.descricao} (cartão de ${nomeDe(pagando)})`.slice(0, 80), categoria: l.categoria, valor: l.valor, tipo: "saida" as const, meio: "dinheiro" as const,
              })));
            }
            setPagando(null);
            setAviso(`Avisamos ${nomeDe(pagando)}`);
            await carregar();
          }}
        />
      )}
      {novoCartao && (
        <FormCartao eu={perfil} familia={familia} inicial={CARTAO_NOVO} voltar={() => setNovoCartao(false)}
          salvar={async (c) => { await repo.salvarCartao(c); setNovoCartao(false); setAviso("Cartão salvo"); await carregar(); }} />
      )}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </>
  );
}

function Formulario({ inicial, cartoes, eu, nomeDe, familia, perguntaCasa, cadastrarCartao, fechar, salvar, apagar }: {
  inicial: NovoLancamento;
  cartoes: Cartao[];
  eu: Perfil;
  nomeDe: (id?: string | null) => string;
  familia: Perfil[];
  perguntaCasa: boolean;
  cadastrarCartao: () => void;
  fechar: () => void;
  salvar: (itens: NovoLancamento[], paraCasa: ParaCasa, repetir: boolean) => Promise<void>;
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
  const [deQuem, setDeQuem] = useState(inicial.deQuem ?? "");
  const [repetir, setRepetir] = useState(false);
  const [valorE, setValorE] = useState<"total" | "parcela">("total");

  const categorias = CATEGORIAS[tipo];
  useEffect(() => {
    if (!categorias.includes(categoria)) setCategoria(categorias[0]);
    if (tipo === "entrada" && (como === "debito" || como === "credito")) setComo("dinheiro");
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cartão de outra pessoa que você usa: só no crédito.
  const opcoesCartao = cartoes.filter((c) => (como === "credito" ? c.temCredito : c.temDebito && !c.dono));
  useEffect(() => {
    if ((como === "credito" || como === "debito") && !opcoesCartao.some((c) => c.id === cartaoId)) setCartaoId(opcoesCartao[0]?.id ?? "");
  }, [como]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartao = cartoes.find((c) => c.id === cartaoId);
  // Cartão que outra pessoa costuma usar: a compra já vem marcada como dela.
  useEffect(() => {
    if (!editando) setDeQuem(cartao?.usadoPor && cartao.usadoPor !== eu.id ? cartao.usadoPor : "");
  }, [cartaoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const comCartao = tipo === "saida" && (como === "debito" || como === "credito");
  const donoCartao = comCartao && cartao?.dono && cartao.dono !== eu.id ? cartao.dono : null;
  const compraNoCartaoDeOutro = Boolean(inicial.dono);
  const nParcelas = Math.max(1, Math.min(48, parseInt(parcelas, 10) || 1));
  const nAtual = Math.max(1, Math.min(nParcelas, parseInt(parcelaAtual, 10) || 1));
  const credito = como === "credito" && !editando;
  const parcelado = credito && nParcelas > 1;
  const centavos = lerValor(valor);
  // Valor de cada parcela (1ª a n-ésima). Pelo total, os centavos que sobram ficam na 1ª.
  const valores = centavos === null ? [] : parcelado && valorE === "total" ? dividirTotal(centavos, nParcelas) : Array(nParcelas).fill(centavos);
  const totalCompra = valores.reduce((a, b) => a + b, 0);

  // Prévia das parcelas para mostrar antes de salvar.
  const previa = useMemo(() => {
    if (!credito || !cartao?.diaFechamento || !cartao.diaVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
    const primeiro = emAndamento
      ? diaDoMes(Number(mesFatura.slice(0, 4)), Number(mesFatura.slice(5, 7)), cartao.diaVencimento)
      : vencimentoDaCompra(data, cartao.diaFechamento, cartao.diaVencimento);
    return gerarParcelas(primeiro, cartao.diaVencimento, emAndamento ? nAtual : 1, nParcelas);
  }, [credito, cartao, data, emAndamento, mesFatura, nAtual, nParcelas]);

  // Repetir todo mês: só lançamento novo, sem parcelas, seu, que ainda não veio de um fixo.
  const podeRepetir = !editando && !parcelado && !donoCartao && !(comCartao && deQuem) && !inicial.recorrenteId;
  const mostrarCasa = perguntaCasa && tipo === "saida" && categoria === "Casa" && !parcelado && !(comCartao && deQuem) && !donoCartao;

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
      deQuem: donoCartao ? eu.id : comCartao && deQuem ? deQuem : null, reembolsoId: inicial.reembolsoId ?? null,
      recorrenteId: inicial.recorrenteId ?? null, recorrenteMes: inicial.recorrenteMes ?? null,
      ...(donoCartao ? { dono: donoCartao } : {}),
    };
    if (editando) {
      // Editar mexe só nesta linha (numa compra parcelada, só nesta parcela, que fica na fatura dela).
      // Compra à vista no crédito: a data digitada é a da compra; a fatura é recalculada.
      const datas = ehParcelaExistente
        ? { data: inicial.data, dataCompra: inicial.dataCompra ?? null }
        : datasDoLancamento(data, base.pagamento === "credito", cartao);
      return salvar([{ ...base, ...datas }], "nao", false);
    }
    if (credito) {
      if (!previa) return "Confira o cartão e a data.";
      const compraId = novoId();
      const itens = previa.map((p) => ({
        ...base, valor: valores[p.parcela - 1] ?? centavos, data: p.data, dataCompra: emAndamento ? null : data, compraId,
        parcela: nParcelas > 1 ? p.parcela : null, parcelas: nParcelas > 1 ? p.parcelas : null,
      }));
      return salvar(itens, mostrarCasa ? paraCasa : "nao", podeRepetir && repetir);
    }
    return salvar([base], mostrarCasa ? paraCasa : "nao", podeRepetir && repetir);
  }

  const comoOpcoes: [Como, string][] = tipo === "saida"
    ? [["dinheiro", "Dinheiro/Pix"], ["debito", "Débito"], ["credito", "Crédito"], ["beneficio", "VR/VA"]]
    : [["dinheiro", "Dinheiro"], ["beneficio", "VR / VA"]];

  return (
    <Folha
      titulo={inicial.recorrenteId && !editando ? `Lançar fixo: ${inicial.descricao}` : compraNoCartaoDeOutro && !editando ? `Compra no ${cartao ? nomeEmprestado(cartao, nomeDe(inicial.dono)) : "cartão"}` : editando ? (ehParcelaExistente ? `Parcela ${inicial.parcela}/${inicial.parcelas}` : "Editar lançamento") : "Novo lançamento"}
      fechar={fechar}
      salvar={enviar}
      apagar={apagar}
      textoApagar={ehParcelaExistente ? "Apagar a compra toda" : "Apagar lançamento"}
    >
      {!ehParcelaExistente && !compraNoCartaoDeOutro && <Segmento rotulo="Tipo" valor={tipo} mudar={setTipo} opcoes={[["saida", "Saída"], ["entrada", "Entrada"]]} />}
      {!ehParcelaExistente && !compraNoCartaoDeOutro && <Segmento rotulo="Como" valor={como} mudar={setComo} opcoes={comoOpcoes} />}

      {(como === "debito" || como === "credito") && tipo === "saida" && !ehParcelaExistente && !compraNoCartaoDeOutro && (
        opcoesCartao.length ? (
          <label className="campo" htmlFor="f-cartao">
            Cartão
            <select id="f-cartao" value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
              {opcoesCartao.map((c) => <option key={c.id} value={c.id}>{c.dono ? nomeEmprestado(c, nomeDe(c.dono)) : nomeCartao(c)}</option>)}
            </select>
          </label>
        ) : (
          <p className="nota">Nenhum cartão com {como === "credito" ? "crédito" : "débito"}. <button type="button" className="link" onClick={cadastrarCartao}>Cadastrar cartão</button></p>
        )
      )}

      {donoCartao && (
        <div className="previa"><p>Cartão <b>{cartao ? nomeEmprestado(cartao, nomeDe(donoCartao)) : ""}</b>, emprestado, sempre no crédito. A compra entra na fatura e aparece para vocês dois. Fica em “Você deve” até {nomeDe(donoCartao)} marcar que recebeu.</p></div>
      )}

      {comCartao && opcoesCartao.length > 0 && !inicial.reembolsoId && !donoCartao && (
        <label className="campo" htmlFor="f-dequem">
          De quem é a compra?
          <select id="f-dequem" value={deQuem} onChange={(e) => setDeQuem(e.target.value)}>
            <option value="">Minha</option>
            {familia.filter((p) => p.id !== eu.id).map((p) => <option key={p.id} value={p.id}>De {p.nome} (vai me pagar)</option>)}
          </select>
        </label>
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
          {parcelado ? (valorE === "total" ? "Valor total da compra" : "Valor de cada parcela") : "Valor (R$)"}
          <input id="f-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
        {!(parcelado && emAndamento) && !ehParcelaExistente && (
          <label className="campo" htmlFor="f-data">
            {como === "credito" && tipo === "saida" ? "Data da compra" : "Data"}
            <input id="f-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
        )}
      </div>

      {parcelado && (
        <Segmento rotulo="O valor digitado é" valor={valorE} mudar={setValorE} opcoes={[["total", "Total da compra"], ["parcela", "De cada parcela"]]} />
      )}

      <label className="campo" htmlFor="f-categoria">
        Categoria
        <select id="f-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      {tipo === "saida" && categoria === "Cartão" && como !== "credito" && (
        <p className="nota alerta">As compras no crédito já entram sozinhas na fatura do mês. Não lance aqui o pagamento da fatura, senão o gasto conta duas vezes. Use “Cartão” só para anuidade, juros ou tarifa.</p>
      )}

      {previa && centavos !== null && (
        <div className="previa">
          {previa.length === 1 ? (
            <p>Entra na fatura que vence em <b>{dataCurta(previa[0].data)}/{previa[0].data.slice(0, 4)}</b>.</p>
          ) : (
            <>
              <p><b>{nParcelas}x</b> de {reais(valores[nParcelas - 1])}{valores[0] !== valores[nParcelas - 1] ? ` (1ª de ${reais(valores[0])})` : ""} · total {reais(totalCompra)}</p>
              {emAndamento && previa.length < nParcelas && <p className="nota">Faltam {previa.length} parcelas: {reais(previa.reduce((s, p) => s + (valores[p.parcela - 1] ?? 0), 0))}.</p>}
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
      {podeRepetir && (
        <label className="campo marcar" htmlFor="f-repetir">
          <input id="f-repetir" type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
          Repetir todo mês (ex.: salário, aluguel, assinatura)
        </label>
      )}
      {inicial.recorrenteId && !editando && <p className="nota">Lançamento fixo de {nomeMes(inicial.recorrenteMes ?? "").split(" ")[0].toLowerCase()}. Mude o valor se veio diferente.</p>}
      {ehParcelaExistente && <p className="nota">Alterar muda só esta parcela. Apagar remove todas as parcelas desta compra.</p>}
    </Folha>
  );
}

export const CARTAO_NOVO: Omit<Cartao, "id"> = { banco: "Bradesco", apelido: null, temCredito: true, temDebito: true, diaFechamento: null, diaVencimento: null, usadoPor: null };

export function FormCartao({ eu, familia, inicial, voltar, salvar, remover }: {
  eu: Perfil;
  familia: Perfil[];
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
  const [usadoPor, setUsadoPor] = useState(inicial.usadoPor && inicial.usadoPor !== eu.id ? inicial.usadoPor : "");
  const [fechamento, setFechamento] = useState(inicial.diaFechamento ? String(inicial.diaFechamento) : "");
  const [vencimento, setVencimento] = useState(inicial.diaVencimento ? String(inicial.diaVencimento) : "");
  const temCredito = funcoes !== "debito";
  const dia = (t: string) => { const n = parseInt(t, 10); return n >= 1 && n <= 31 ? n : null; };

  return (
    <Folha titulo={inicial.id ? "Editar cartão" : "Novo cartão"} fechar={voltar} apagar={remover} textoApagar="Remover cartão" salvar={async () => {
      const nomeBanco = banco === "Outro" ? outro.trim() : banco;
      if (!nomeBanco) return "Escreva o nome do banco.";
      if (temCredito && (!dia(fechamento) || !dia(vencimento))) return "Informe o dia de fechamento e o de vencimento (1 a 31).";
      await salvar({ id: inicial.id, banco: nomeBanco, apelido: apelido.trim() || null, temCredito, temDebito: funcoes !== "credito", diaFechamento: temCredito ? dia(fechamento) : null, diaVencimento: temCredito ? dia(vencimento) : null, usadoPor: usadoPor || null });
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
      <Segmento rotulo="Funções" valor={funcoes} mudar={setFuncoes} opcoes={[["ambos", "Flex"], ["credito", "Só crédito"], ["debito", "Só débito"]]} />
      {funcoes === "ambos" && <p className="nota">Flex: em cada compra você escolhe se foi no crédito ou no débito.</p>}
      {temCredito && (
        <div className="duas">
          <label className="campo" htmlFor="k-fecha">Dia que fecha<input id="k-fecha" inputMode="numeric" value={fechamento} onChange={(e) => setFechamento(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex.: 3" /></label>
          <label className="campo" htmlFor="k-vence">Dia que vence<input id="k-vence" inputMode="numeric" value={vencimento} onChange={(e) => setVencimento(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Ex.: 10" /></label>
        </div>
      )}
      <label className="campo" htmlFor="k-usa">
        Quem usa este cartão
        <select id="k-usa" value={usadoPor} onChange={(e) => setUsadoPor(e.target.value)}>
          <option value="">Eu</option>
          {familia.filter((p) => p.id !== eu.id).map((p) => <option key={p.id} value={p.id}>{p.nome} (paga para mim)</option>)}
        </select>
      </label>
      {temCredito && <p className="nota">Compras feitas até o dia antes do fechamento entram na fatura do mês; a partir do fechamento, na seguinte.</p>}
    </Folha>
  );
}


/** Marcar várias compras de uma vez: "Recebi" (dono do cartão) ou "Paguei" (quem comprou). */
function MarcarCompras({ titulo, nota, rotuloData, textoSalvar, itens, opcao, fechar, salvar }: {
  titulo: string;
  nota: (total: number) => string;
  rotuloData: string;
  textoSalvar: (total: number) => string;
  itens: Lancamento[];
  /** Caixa de marcar extra, que começa marcada (ex.: lançar a saída em Minhas). */
  opcao?: string;
  fechar: () => void;
  salvar: (ids: string[], data: string, opcaoMarcada: boolean) => Promise<void>;
}) {
  const [comOpcao, setComOpcao] = useState(true);
  // Se a pessoa já avisou que pagou, começa com essas compras e a data do aviso.
  const avisadas = itens.filter((l) => l.pagamentoInformadoEm);
  const [marcados, setMarcados] = useState<string[]>((avisadas.length ? avisadas : itens).map((l) => l.id));
  const [data, setData] = useState(avisadas.map((l) => l.pagamentoInformadoEm!).sort().pop() ?? hojeISO());
  const total = itens.filter((l) => marcados.includes(l.id)).reduce((s, l) => s + l.valor, 0);
  return (
    <Folha titulo={titulo} fechar={fechar} textoSalvar={textoSalvar(total)} salvar={async () => {
      if (!marcados.length) return "Marque pelo menos uma compra.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Escolha a data.";
      await salvar(marcados, data, Boolean(opcao) && comOpcao);
    }}>
      <p className="nota">{nota(total)}</p>
      <ul className="lista">
        {itens.map((l) => (
          <li key={l.id}>
            <label className="item marcar-item" htmlFor={`r-${l.id}`}>
              <input id={`r-${l.id}`} type="checkbox" checked={marcados.includes(l.id)}
                onChange={(e) => setMarcados(e.target.checked ? [...marcados, l.id] : marcados.filter((x) => x !== l.id))} />
              <span className="texto"><b>{l.descricao}</b><span>{l.categoria} · {dataCurta(l.data)}{l.parcelas && l.parcelas > 1 ? ` · ${l.parcela}/${l.parcelas}` : ""}{l.pagamentoInformadoEm ? ` · pago em ${dataCurta(l.pagamentoInformadoEm)}` : ""}</span></span>
              <span className="valor">{reais(l.valor)}</span>
            </label>
          </li>
        ))}
      </ul>
      <label className="campo" htmlFor="r-data">{rotuloData}<input id="r-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
      {opcao && (
        <label className="campo marcar" htmlFor="r-opcao">
          <input id="r-opcao" type="checkbox" checked={comOpcao} onChange={(e) => setComOpcao(e.target.checked)} />
          {opcao}
        </label>
      )}
    </Folha>
  );
}
