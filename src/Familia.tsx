import { useCallback, useEffect, useState } from "react";
import { hojeISO, mesDe, nomeMes, somarMes } from "./lancamentos";
import { reais } from "./dinheiro";
import { NIVEIS, type Nivel, type RepositorioPrivacidade, type VisaoPessoa } from "./privacidade";
import { ROTULO_PAPEL, type Perfil } from "./tipos";
import { comCor, corCategoria } from "./cores";

export function Familia({ repo, eu, familia }: { repo: RepositorioPrivacidade; eu: Perfil; familia: Perfil[] }) {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [meuNivel, setMeuNivel] = useState<Nivel | null>(null);
  const [visoes, setVisoes] = useState<Record<string, VisaoPessoa>>({});
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const outros = familia.filter((p) => p.id !== eu.id);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const niveis = await repo.niveis();
      setMeuNivel(niveis[eu.id] ?? "nada");
      const lista = await Promise.all(outros.map(async (p) => [p.id, await repo.ver(p.id, mes)] as const));
      setVisoes(Object.fromEntries(lista));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    }
  }, [repo, eu.id, mes, familia]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 2200);
    return () => clearTimeout(t);
  }, [aviso]);

  async function escolher(n: Nivel) {
    const antes = meuNivel;
    setMeuNivel(n);
    try {
      await repo.salvarNivel(eu.id, n);
      setAviso(n === "nada" ? "Suas finanças estão privadas" : "Compartilhamento atualizado");
    } catch (e) {
      setMeuNivel(antes);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <>
      <section className="painel">
        <h2>O que eu mostro para a família</h2>
        <div className="opcoes" role="radiogroup" aria-label="O que eu mostro">
          {NIVEIS.map(([n, titulo, texto]) => (
            <button key={n} role="radio" aria-checked={meuNivel === n} className="opcao" onClick={() => void escolher(n)} disabled={meuNivel === null}>
              <span className="marca-radio" aria-hidden="true" />
              <span className="texto"><b>{titulo}</b><span>{texto}</span></span>
            </button>
          ))}
        </div>
        <p className="nota">A Casa é sempre de todos. Isto vale só para a aba Minhas.</p>
      </section>

      <div className="mes" role="group" aria-label="Mês">
        <button className="seta" aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>‹</button>
        <span>{nomeMes(mes)}</span>
        <button className="seta" aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>›</button>
      </div>

      {erro && <p className="erro painel" role="alert">{erro}</p>}

      {outros.map((p) => {
        const v = visoes[p.id];
        if (!v) return <section key={p.id} className="painel"><p className="nota">Carregando {p.nome}…</p></section>;
        if (v.nivel === "nada" || !v.resumo)
          return (
            <section key={p.id} className="trancado">
              <span className="cadeado" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              </span>
              <span className="texto"><b>{p.nome}</b><span>Finanças privadas</span></span>
              <span className={`selo ${p.papel}`}>{ROTULO_PAPEL[p.papel]}</span>
            </section>
          );
        const r = v.resumo;
        return (
          <section key={p.id} className="painel">
            <div className="cabeca"><h2>{p.nome}</h2><span className="selo ok">{v.nivel === "tudo" ? "Compartilha tudo" : "Compartilha a situação"}</span></div>
            <div className="tres">
              <div><span className="mini">Entrou</span><b>{reais(r.entrou)}</b></div>
              <div><span className="mini">Saiu</span><b>{reais(r.saiu)}</b></div>
              <div><span className="mini">Sobra</span><b>{reais(r.entrou - r.saiu)}</b></div>
            </div>
            {(r.beneficioRecebido > 0 || r.beneficioGasto > 0) && (
              <p className="nota">VR/VA: recebeu {reais(r.beneficioRecebido)}, usou ou enviou {reais(r.beneficioGasto)}.</p>
            )}
            {v.lancamentos && (
              <ul className="lista">
                {v.lancamentos.length === 0 && <li className="nota">Nenhum lançamento neste mês.</li>}
                {v.lancamentos.map((l) => (
                  <li key={l.id}>
                    <span className={`icone ${l.tipo} ${l.meio}${l.tipo === "saida" && l.meio === "dinheiro" ? " com-cor" : ""}`} style={comCor(corCategoria(l.categoria))} aria-hidden="true">{l.categoria.slice(0, 2)}</span>
                    <span className="texto"><b>{l.descricao}</b><span>{l.categoria} · {l.data.slice(8, 10)}/{l.data.slice(5, 7)}{l.meio === "beneficio" ? " · VR/VA" : ""}</span></span>
                    <span className={`valor ${l.tipo}`}>{l.tipo === "entrada" ? "+" : "−"}{reais(l.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </>
  );
}
