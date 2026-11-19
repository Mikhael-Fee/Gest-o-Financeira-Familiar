import { useEffect, useMemo, useState } from "react";
import { hojeISO, mesDe, nomeMes, somarMes, type Lancamento } from "./lancamentos";
import { reais } from "./dinheiro";
import type { Repositorio } from "./repositorio";
import type { RepositorioCasa } from "./repositorioCasa";
import type { Despesa } from "./casa";
import { compromissos, gastosPorCategoria, maioresGastos, sobraPorMes } from "./resumo";
import { situacaoLimites, type Limites } from "./fixos";
import { FormLimites } from "./Fixos";
import { comCor, corBanco, corCategoria } from "./cores";
import { nomeCartao, type Cartao } from "./cartoes";

export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesCurto = (m: string) => MESES_CURTOS[Number(m.slice(5, 7)) - 1];
const mesSo = (m: string) => nomeMes(m).split(" ")[0].toLowerCase();
const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** Valor curto para rótulos de gráfico: R$ 860 · R$ 1,3 mil. */
function curto(c: number) {
  const r = Math.abs(c) / 100;
  const s = r >= 1000 ? `${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(r).toLocaleString("pt-BR");
  return `${c < 0 ? "−" : ""}R$ ${s}`;
}

export function Resumo({ repo, casa }: { repo: Repositorio; casa: RepositorioCasa }) {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [lista, setLista] = useState<Lancamento[] | null>(null);
  const [contasCasa, setContasCasa] = useState<Despesa[]>([]);
  const [erro, setErro] = useState("");
  const [limites, setLimites] = useState<Limites>({});
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  useEffect(() => { repo.cartoes().then(setCartoes).catch(() => setCartoes([])); }, [repo]);
  const [editandoLimites, setEditandoLimites] = useState(false);
  useEffect(() => { repo.limites().then(setLimites).catch(() => setLimites({})); }, [repo]);

  useEffect(() => {
    let vivo = true;
    setLista(null);
    setErro("");
    Promise.all([repo.listarIntervalo(somarMes(mes, -5), somarMes(mes, 6)), casa.carregar(mes)])
      .then(([l, c]) => {
        if (!vivo) return;
        setLista(l);
        setContasCasa([...(c.atrasadas ?? []), ...c.despesas].filter((d) => d.status === "a_pagar").sort((a, b) => a.data.localeCompare(b.data)));
      })
      .catch((e) => vivo && (setErro(e instanceof Error ? e.message : "Erro ao carregar."), setLista([])));
    return () => { vivo = false; };
  }, [repo, casa, mes]);

  const dados = useMemo(() => {
    const l = lista ?? [];
    const categorias = gastosPorCategoria(l, mes);
    const total = categorias.reduce((s, f) => s + f.valor, 0);
    const totalAntes = categorias.reduce((s, f) => s + f.anterior, 0) + gastosPorCategoria(l, somarMes(mes, -1)).filter((f) => !categorias.some((c) => c.categoria === f.categoria)).reduce((s, f) => s + f.valor, 0);
    return { categorias, total, totalAntes, maiores: maioresGastos(l, mes), sobra: sobraPorMes(l, mes), futuro: compromissos(l, mes) };
  }, [lista, mes]);

  const { categorias, total, totalAntes, maiores, sobra, futuro } = dados;
  const maxCat = Math.max(1, ...categorias.map((f) => Math.max(f.valor, f.anterior)));
  const totalFuturo = futuro.reduce((s, c) => s + c.valor, 0);
  const totalCasa = contasCasa.reduce((s, d) => s + d.valor, 0);
  const situacao = situacaoLimites(limites, categorias);
  const cartoesCredito = cartoes.filter((k) => k.temCredito);
  const maxFatura = Math.max(1, ...cartoesCredito.map((k) => (lista ?? []).filter((l) => l.cartaoId === k.id && l.pagamento === "credito" && mesDe(l.data) === mes).reduce((s2, l) => s2 + l.valor, 0)));
  const variacao = totalAntes ? Math.round(((total - totalAntes) / totalAntes) * 100) : null;

  return (
    <>
      <div className="mes" role="group" aria-label="Mês">
        <button className="seta" aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>‹</button>
        <span>{nomeMes(mes)}</span>
        <button className="seta" aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>›</button>
      </div>

      {erro && <p className="erro painel" role="alert">{erro}</p>}
      {lista === null && <p className="nota">Carregando…</p>}

      {lista && (
        <>
          <section className="destaque">
            <span className="rotulo">Você gastou em {mesSo(mes)}</span>
            <p className="valor-grande">{reais(total)}</p>
            {variacao !== null && (
              <span className="mini">
                {total === totalAntes ? "Igual a" : variacao === 0 ? "Quase igual a" : `${Math.abs(variacao)}% ${variacao > 0 ? "a mais que" : "a menos que"}`} {mesSo(somarMes(mes, -1))} ({reais(totalAntes)})
              </span>
            )}
            <span className="mini">Dinheiro, Pix, débito e faturas. VR/VA e compras de outros no seu cartão ficam de fora.</span>
          </section>

          <section className="painel">
            <div className="cabeca">
              <h2>Limites do mês</h2>
              <button className="btn pequeno fantasma" onClick={() => setEditandoLimites(true)}>{situacao.length ? "Ajustar" : "+ Limites"}</button>
            </div>
            {situacao.length === 0 && <p className="nota">Defina quanto quer gastar no máximo por categoria. O app avisa quando chegar perto.</p>}
            <ul className="barras">
              {situacao.map((s) => (
                <li key={s.categoria}>
                  <div className="barra-topo">
                    <span className="com-selo"><span className={`estado-icone ${s.estado}`} aria-hidden="true">{s.estado === "passou" ? "!" : s.estado === "perto" ? "⚠" : "✓"}</span>{s.categoria}</span>
                    <b>{reais(s.gasto)} <span className="mini-cinza">de {reais(s.limite)}</span></b>
                  </div>
                  <div className={`limite-barra ${s.estado}`} role="meter" aria-valuemin={0} aria-valuemax={s.limite} aria-valuenow={Math.min(s.gasto, s.limite)} aria-label={`${s.categoria}: ${reais(s.gasto)} de ${reais(s.limite)}`}>
                    <span style={{ width: `${Math.min(1, s.parte) * 100}%` }} />
                  </div>
                  <span className="mini-cinza">
                    {s.estado === "passou" ? `Passou ${reais(s.gasto - s.limite)} do limite` : s.estado === "perto" ? `Perto do limite · sobram ${reais(s.limite - s.gasto)}` : `Sobram ${reais(s.limite - s.gasto)}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="painel">
            <h2>Para onde foi</h2>
            {categorias.length === 0 && <p className="nota">Nenhum gasto em {mesSo(mes)}.</p>}
            <ul className="barras" aria-label={`Gastos por categoria em ${mesSo(mes)}`}>
              {categorias.map((f) => {
                const delta = f.valor - f.anterior;
                return (
                  <li key={f.categoria} title={`${f.categoria}: ${reais(f.valor)} (em ${mesSo(somarMes(mes, -1))}: ${reais(f.anterior)})`}>
                    <div className="barra-topo"><span className="com-selo"><span className="ponto-cor" style={comCor(corCategoria(f.categoria))} aria-hidden="true" />{f.categoria}</span><b>{reais(f.valor)}</b></div>
                    <div className="trilho">
                      <span className="preenche" style={{ width: `${(f.valor / maxCat) * 100}%`, background: corCategoria(f.categoria) }} />
                      {f.anterior > 0 && <span className="marca-antes" style={{ left: `${(f.anterior / maxCat) * 100}%` }} aria-hidden="true" />}
                    </div>
                    <span className="mini-cinza">
                      {f.anterior === 0 ? `não teve em ${mesSo(somarMes(mes, -1))}` : delta === 0 ? `igual a ${mesCurto(somarMes(mes, -1))}` : `${delta > 0 ? "▲" : "▼"} ${reais(Math.abs(delta))} ${delta > 0 ? "a mais" : "a menos"} que ${mesCurto(somarMes(mes, -1))}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {categorias.some((f) => f.anterior > 0) && <p className="nota legenda"><span className="marca-antes-legenda" aria-hidden="true" /> traço = quanto foi em {mesSo(somarMes(mes, -1))}</p>}
          </section>

          {maiores.length > 0 && (
            <section className="painel">
              <h2>Maiores gastos</h2>
              <ol className="lista">
                {maiores.map((l) => (
                  <li key={l.id}>
                    <span className="icone com-cor" style={comCor(corCategoria(l.categoria))} aria-hidden="true">{l.categoria.slice(0, 2)}</span>
                    <span className="texto"><b>{l.descricao}</b><span>{l.categoria} · {dataCurta(l.data)}{l.parcelas && l.parcelas > 1 ? ` · parcela ${l.parcela}/${l.parcelas}` : ""}</span></span>
                    <span className="valor">{reais(l.valor)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {cartoesCredito.length > 0 && (
            <section className="painel">
              <h2>Cartões em {mesSo(mes)}</h2>
              <ul className="barras">
                {cartoesCredito.map((k) => {
                  const fatura = (lista ?? []).filter((l) => l.cartaoId === k.id && l.pagamento === "credito" && mesDe(l.data) === mes).reduce((s2, l) => s2 + l.valor, 0);
                  const depois = futuro.reduce((s2, c) => s2 + c.itens.filter((l) => l.cartaoId === k.id).reduce((t, l) => t + l.valor, 0), 0);
                  return (
                    <li key={k.id}>
                      <div className="barra-topo">
                        <span className="com-selo"><span className="icone cartao com-cor mini" style={comCor(corBanco(k.banco))} aria-hidden="true">{k.banco.slice(0, 2)}</span>{nomeCartao(k)}</span>
                        <b>{reais(fatura)}</b>
                      </div>
                      <div className="trilho"><span className="preenche" style={{ width: `${(fatura / maxFatura) * 100}%`, background: corBanco(k.banco) }} /></div>
                      <span className="mini-cinza">{k.diaVencimento ? `vence dia ${k.diaVencimento}` : ""}{depois > 0 ? ` · ${reais(depois)} já marcados nos próximos meses` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="painel">
            <div className="cabeca"><h2>Próximos meses</h2><span className="nota">Parcelas já lançadas</span></div>
            {totalFuturo === 0 ? (
              <p className="nota">Nenhuma parcela marcada para os próximos 6 meses.</p>
            ) : (
              <>
                <p className="nota">{reais(totalFuturo)} já comprometidos até {mesSo(futuro[futuro.length - 1].mes)}.</p>
                <Colunas rotulo="Faturas já marcadas por mês, por cartão" pontos={futuro.map((c) => ({
                  mes: c.mes, valor: c.valor,
                  partes: cartoesCredito.map((k) => ({ nome: k.banco, cor: corBanco(k.banco), valor: c.itens.filter((l) => l.cartaoId === k.id).reduce((s2, l) => s2 + l.valor, 0) })).filter((x) => x.valor > 0),
                }))} />
                <Legenda itens={cartoesCredito.filter((k) => futuro.some((c) => c.itens.some((l) => l.cartaoId === k.id))).map((k) => ({ nome: nomeCartao(k), cor: corBanco(k.banco) }))} />
              </>
            )}
          </section>

          {contasCasa.length > 0 && (
            <section className="painel">
              <div className="cabeca"><h2>Contas da Casa a pagar</h2><b className="valor">{reais(totalCasa)}</b></div>
              <ul className="lista">
                {contasCasa.map((d) => (
                  <li key={d.id}>
                    <span className="texto"><b>{d.descricao}</b><span>vence {dataCurta(d.data)}</span></span>
                    <span className="valor">{reais(d.valor)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="painel">
            <h2>Sobra nos últimos 6 meses</h2>
            <Colunas pontos={sobra} rotulo="Sobra em dinheiro por mês" destacar={mes} />
          </section>
        </>
      )}
      {editandoLimites && (
        <FormLimites inicial={limites} fechar={() => setEditandoLimites(false)} salvar={async (mudancas) => {
          for (const [c, v] of Object.entries(mudancas)) await repo.salvarLimite(c, v);
          setLimites(await repo.limites());
          setEditandoLimites(false);
        }} />
      )}
    </>
  );
}

/** Colunas simples com o valor em cima: positivo sobe, negativo desce da linha do zero. */
type Parte = { nome: string; cor: string; valor: number };

/** Legenda de cores (sempre junto de gráfico com mais de uma série). */
export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  if (itens.length < 2) return null;
  return (
    <ul className="legenda-cores">
      {itens.map((i) => <li key={i.nome}><span className="ponto-cor" style={comCor(i.cor)} aria-hidden="true" />{i.nome}</li>)}
    </ul>
  );
}

export function Colunas({ pontos, rotulo, destacar, aoTocar, cor }: { pontos: { mes: string; valor: number; partes?: Parte[] }[]; rotulo: string; destacar?: string; aoTocar?: (mes: string) => void; cor?: string }) {
  const max = Math.max(1, ...pontos.map((p) => Math.abs(p.valor)));
  const temNegativo = pontos.some((p) => p.valor < 0);
  // Com muitas colunas os valores não cabem: mostra só o do mês destacado.
  const rotular = (m: string) => pontos.length <= 6 || m === destacar;
  return (
    <figure className="colunas" aria-label={rotulo} style={cor ? comCor(cor) : undefined}>
      <div className={`colunas-area${temNegativo ? " com-negativo" : ""}`}>
        {pontos.map((p) => (
          <div key={p.mes} className={`coluna${p.mes === destacar ? " atual" : ""}${aoTocar ? " tocavel" : ""}`} title={`${nomeMes(p.mes)}: ${reais(p.valor)}`}
            {...(aoTocar ? { role: "button", tabIndex: 0, "aria-label": `${nomeMes(p.mes)}: ${reais(p.valor)}`, "aria-pressed": p.mes === destacar, onClick: () => aoTocar(p.mes), onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && aoTocar(p.mes) } : {})}>
            <div className="metade cima">
              {p.valor > 0 && rotular(p.mes) && <span className="rotulo-col">{curto(p.valor)}</span>}
              {p.valor > 0 && (p.partes && p.partes.length ? (
                <span className="pilar empilhado" style={{ height: `${(p.valor / max) * 100}%` }}>
                  {p.partes.map((x) => <span key={x.nome} title={`${x.nome}: ${reais(x.valor)}`} style={{ flexGrow: x.valor, background: x.cor }} />)}
                </span>
              ) : <span className="pilar" style={{ height: `${(p.valor / max) * 100}%` }} />)}
              {p.valor === 0 && <span className="rotulo-col zero">—</span>}
            </div>
            {temNegativo && (
              <div className="metade baixo">
                {p.valor < 0 && <span className="pilar negativo" style={{ height: `${(-p.valor / max) * 100}%` }} />}
                {p.valor < 0 && rotular(p.mes) && <span className="rotulo-col">{curto(p.valor)}</span>}
              </div>
            )}
            <span className="mes-col">{mesCurto(p.mes)}</span>
          </div>
        ))}
      </div>
      <table className="so-leitor">
        <caption>{rotulo}</caption>
        <tbody>{pontos.map((p) => <tr key={p.mes}><th>{nomeMes(p.mes)}</th><td>{reais(p.valor)}{p.partes?.length ? ` (${p.partes.map((x) => `${x.nome} ${reais(x.valor)}`).join(", ")})` : ""}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
