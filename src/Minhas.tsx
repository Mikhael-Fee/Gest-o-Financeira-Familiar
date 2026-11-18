import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIAS, hojeISO, mesDe, nomeMes, resumir, somarMes, type Lancamento, type Meio, type Tipo } from "./lancamentos";
import { lerValor, reais } from "./dinheiro";
import type { Repositorio, NovoLancamento } from "./repositorio";

export function Minhas({ repo, nome }: { repo: Repositorio; nome: string }) {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [lista, setLista] = useState<Lancamento[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<NovoLancamento | null>(null);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      setLista(await repo.listar(mes));
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
    const t = setTimeout(() => setAviso(""), 2200);
    return () => clearTimeout(t);
  }, [aviso]);

  const r = useMemo(() => resumir(lista ?? [], mes), [lista, mes]);
  const temBeneficio = r.beneficioRecebido > 0 || r.beneficioGasto > 0;

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
          {lista?.map((l) => (
            <li key={l.id}>
              <button className="item" onClick={() => setEditando(l)}>
                <span className={`icone ${l.tipo} ${l.meio}`} aria-hidden="true">{l.categoria.slice(0, 2)}</span>
                <span className="texto">
                  <b>{l.descricao}</b>
                  <span>{l.categoria} · {l.data.slice(8, 10)}/{l.data.slice(5, 7)}{l.meio === "beneficio" ? " · VR/VA" : ""}</span>
                </span>
                <span className={`valor ${l.tipo}`}>{l.tipo === "entrada" ? "+" : "−"}{reais(l.valor)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {editando && (
        <Formulario
          inicial={editando}
          fechar={() => setEditando(null)}
          salvar={async (l) => {
            await repo.salvar(l);
            setEditando(null);
            setAviso(l.id ? "Lançamento atualizado" : "Lançamento salvo");
            if (mesDe(l.data) !== mes) setMes(mesDe(l.data));
            else await carregar();
          }}
          apagar={
            editando.id
              ? async () => {
                  await repo.apagar(editando.id!);
                  setEditando(null);
                  setAviso("Lançamento apagado");
                  await carregar();
                }
              : undefined
          }
        />
      )}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </>
  );
}

function Formulario({ inicial, fechar, salvar, apagar }: {
  inicial: NovoLancamento;
  fechar: () => void;
  salvar: (l: NovoLancamento) => Promise<void>;
  apagar?: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<Tipo>(inicial.tipo);
  const [meio, setMeio] = useState<Meio>(inicial.meio);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [valor, setValor] = useState(inicial.valor ? (inicial.valor / 100).toFixed(2).replace(".", ",") : "");
  const [categoria, setCategoria] = useState(inicial.categoria);
  const [data, setData] = useState(inicial.data);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  const categorias = CATEGORIAS[tipo];
  useEffect(() => {
    if (!categorias.includes(categoria)) setCategoria(categorias[0]);
  }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const centavos = lerValor(valor);
    if (!descricao.trim()) return setErro("Escreva uma descrição.");
    if (centavos === null) return setErro("Digite um valor maior que zero, como 150,00.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return setErro("Escolha a data.");
    setErro("");
    setOcupado(true);
    try {
      await salvar({ id: inicial.id, tipo, meio, descricao: descricao.trim(), valor: centavos, categoria, data });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
      setOcupado(false);
    }
  }

  async function confirmar() {
    setOcupado(true);
    try {
      await apagar!();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível apagar.");
      setOcupado(false);
    }
  }

  return (
    <div className="fundo-folha" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form className="folha" onSubmit={enviar} aria-label={inicial.id ? "Editar lançamento" : "Novo lançamento"}>
        <h2>{inicial.id ? "Editar lançamento" : "Novo lançamento"}</h2>

        <div className="segmento" role="group" aria-label="Tipo">
          <button type="button" aria-pressed={tipo === "saida"} onClick={() => setTipo("saida")}>Saída</button>
          <button type="button" aria-pressed={tipo === "entrada"} onClick={() => setTipo("entrada")}>Entrada</button>
        </div>
        <div className="segmento" role="group" aria-label="Forma">
          <button type="button" aria-pressed={meio === "dinheiro"} onClick={() => setMeio("dinheiro")}>Dinheiro</button>
          <button type="button" aria-pressed={meio === "beneficio"} onClick={() => setMeio("beneficio")}>VR / VA</button>
        </div>

        <label className="campo" htmlFor="f-descricao">
          Descrição
          <input id="f-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "entrada" ? "Ex.: Salário" : "Ex.: Mercado"} maxLength={80} />
        </label>
        <div className="duas">
          <label className="campo" htmlFor="f-valor">
            Valor (R$)
            <input id="f-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </label>
          <label className="campo" htmlFor="f-data">
            Data
            <input id="f-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
        </div>
        <label className="campo" htmlFor="f-categoria">
          Categoria
          <select id="f-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {categorias.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>

        {erro && <p className="erro" role="alert">{erro}</p>}

        {confirmarApagar ? (
          <div className="confirmar">
            <p>Apagar este lançamento? Não dá para desfazer.</p>
            <div className="duas">
              <button type="button" className="btn fantasma" onClick={() => setConfirmarApagar(false)}>Manter</button>
              <button type="button" className="btn perigo" disabled={ocupado} onClick={confirmar}>Apagar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="duas">
              <button type="button" className="btn fantasma" onClick={fechar}>Cancelar</button>
              <button className="btn" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar"}</button>
            </div>
            {apagar && <button type="button" className="link-perigo" onClick={() => setConfirmarApagar(true)}>Apagar lançamento</button>}
          </>
        )}
      </form>
    </div>
  );
}
