import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIAS, hojeISO, mesDe, nomeMes, somarMes, type Lancamento } from "./lancamentos";
import { reais } from "./dinheiro";
import type { Repositorio } from "./repositorio";
import { nomeCartao, type Cartao } from "./cartoes";
import { FILTRO_VAZIO, filtrar, porMes, type Filtro } from "./busca";
import { comCor, corCategoria } from "./cores";
import { Segmento } from "./Folha";

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const PERIODOS: [string, string][] = [["3", "3 meses"], ["12", "12 meses"], ["tudo", "Tudo"]];

/** Buscar em todos os seus lançamentos, com filtros. Tocar num resultado abre para editar. */
export function Busca({ repo, cartoes, versao, voltar, abrir }: {
  repo: Repositorio;
  cartoes: Cartao[];
  versao: number;
  voltar: () => void;
  abrir: (l: Lancamento) => void;
}) {
  const [todos, setTodos] = useState<Lancamento[] | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VAZIO);
  const [periodo, setPeriodo] = useState("12");
  const campo = useRef<HTMLInputElement>(null);
  const atual = mesDe(hojeISO());

  useEffect(() => campo.current?.focus(), []);
  useEffect(() => {
    let vivo = true;
    // Inclui parcelas futuras (até 4 anos à frente).
    repo.listarIntervalo("2000-01", somarMes(atual, 48))
      .then((l) => vivo && setTodos(l))
      .catch((e) => vivo && (setErro(e instanceof Error ? e.message : "Erro ao buscar."), setTodos([])));
    return () => { vivo = false; };
  }, [repo, atual, versao]);

  const resultado = useMemo(() => {
    const desde = periodo === "tudo" ? "0000-00" : somarMes(atual, -(Number(periodo) - 1));
    return filtrar((todos ?? []).filter((l) => l.data.slice(0, 7) >= desde), filtro);
  }, [todos, filtro, periodo, atual]);
  const grupos = porMes(resultado);
  const mudar = (p: Partial<Filtro>) => setFiltro({ ...filtro, ...p });
  const categorias = filtro.tipo === "entrada" ? CATEGORIAS.entrada : filtro.tipo === "saida" ? CATEGORIAS.saida : [...CATEGORIAS.saida, ...CATEGORIAS.entrada.filter((c) => !CATEGORIAS.saida.includes(c))];
  const temFiltro = filtro.texto || filtro.tipo !== "todos" || filtro.categoria || filtro.cartaoId;
  const totalSaiu = resultado.filter((l) => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  const totalEntrou = resultado.filter((l) => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);

  return (
    <>
      <div className="voltar-linha">
        <button className="btn fantasma pequeno" onClick={voltar}>‹ Voltar</button>
        {temFiltro && <button className="link" onClick={() => setFiltro(FILTRO_VAZIO)}>Limpar filtros</button>}
      </div>
      <h1 className="titulo-pagina">Buscar</h1>

      <section className="painel">
        <label className="campo busca-campo" htmlFor="b-texto">
          <span className="so-leitor">O que procura</span>
          <input id="b-texto" ref={campo} type="search" inputMode="search" placeholder="Ex.: farmácia, uber, notebook…" value={filtro.texto} onChange={(e) => mudar({ texto: e.target.value })} />
        </label>
        <Segmento rotulo="Período" valor={periodo} mudar={setPeriodo} opcoes={PERIODOS} />
        <Segmento rotulo="Tipo" valor={filtro.tipo} mudar={(t: Filtro["tipo"]) => mudar({ tipo: t, categoria: "" })} opcoes={[["todos", "Tudo"], ["saida", "Saídas"], ["entrada", "Entradas"]]} />
        <div className="duas">
          <label className="campo" htmlFor="b-categoria">
            Categoria
            <select id="b-categoria" value={filtro.categoria} onChange={(e) => mudar({ categoria: e.target.value })}>
              <option value="">Todas</option>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="campo" htmlFor="b-cartao">
            Cartão
            <select id="b-cartao" value={filtro.cartaoId} onChange={(e) => mudar({ cartaoId: e.target.value })}>
              <option value="">Todos</option>
              <option value="sem">Sem cartão</option>
              {cartoes.map((c) => <option key={c.id} value={c.id}>{nomeCartao(c)}</option>)}
            </select>
          </label>
        </div>
      </section>

      {erro && <p className="erro painel" role="alert">{erro}</p>}
      {todos === null && <p className="nota">Carregando…</p>}

      {todos && (
        <section className="painel">
          <div className="cabeca">
            <h2>{resultado.length} {resultado.length === 1 ? "lançamento" : "lançamentos"}</h2>
            <span className="nota">{totalSaiu > 0 && `−${reais(totalSaiu)}`}{totalSaiu > 0 && totalEntrou > 0 && " · "}{totalEntrou > 0 && `+${reais(totalEntrou)}`}</span>
          </div>
          {resultado.length === 0 && <p className="nota">Nada encontrado. Tente outra palavra ou tire algum filtro.</p>}
          {grupos.map((g) => (
            <div key={g.mes} className="grupo-mes">
              <div className="cabeca-mes">
                <b>{nomeMes(g.mes)}{g.mes > atual ? " · futuro" : ""}</b>
                <span className="mini-cinza">{g.saiu > 0 && `−${reais(g.saiu)}`}{g.saiu > 0 && g.entrou > 0 && " · "}{g.entrou > 0 && `+${reais(g.entrou)}`}</span>
              </div>
              <ul className="lista">
                {g.itens.map((l) => {
                  const c = cartoes.find((x) => x.id === l.cartaoId);
                  return (
                    <li key={l.id}>
                      <button className="item" onClick={() => abrir(l)}>
                        <span className={`icone ${l.tipo} ${l.meio}${l.tipo === "saida" && l.meio === "dinheiro" ? " com-cor" : ""}`} style={comCor(corCategoria(l.categoria))} aria-hidden="true">{l.categoria.slice(0, 2)}</span>
                        <span className="texto">
                          <b>{l.descricao}</b>
                          <span>{l.categoria} · {dataCurta(l.data)}{c ? ` · ${c.banco}` : ""}{l.parcelas && l.parcelas > 1 ? ` · ${l.parcela}/${l.parcelas}` : ""}{l.meio === "beneficio" ? " · VR/VA" : ""}</span>
                        </span>
                        <span className={`valor ${l.tipo}`}>{l.tipo === "entrada" ? "+" : "−"}{reais(l.valor)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
