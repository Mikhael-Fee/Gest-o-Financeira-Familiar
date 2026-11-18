import { useCallback, useEffect, useState } from "react";
import type { Repositorio } from "./repositorio";
import { ROTULO_PAPEL, type Perfil } from "./tipos";
import { nomeCartao, nomeEmprestado, type Cartao } from "./cartoes";
import { CARTAO_NOVO, FormCartao } from "./Minhas";
import { BotaoInstalar } from "./Instalar";
import { lerValor, reais } from "./dinheiro";
import { hojeISO, mesDe, nomeMes } from "./lancamentos";
import type { NovoRecorrente, Recorrente } from "./fixos";
import { FIXO_NOVO, FormFixo, descreverFixo } from "./Fixos";
import { comCor, corBanco, corCategoria } from "./cores";

type CartaoEditavel = Omit<Cartao, "id"> & { id?: string };

/** Tudo o que se mexe pouco: cartões, conta, instalar e sair. Fica fora da tela do dia a dia. */
export function Ajustes({ repo, perfil, familia, sair }: { repo: Repositorio; perfil: Perfil; familia: Perfil[]; sair: () => void }) {
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [queUso, setQueUso] = useState<Cartao[]>([]);
  const [editando, setEditando] = useState<CartaoEditavel | null>(null);
  const [erro, setErro] = useState("");
  const [fixos, setFixos] = useState<Recorrente[]>([]);
  const [fixoEditando, setFixoEditando] = useState<NovoRecorrente | null>(null);
  const [saldo, setSaldo] = useState<{ mes: string; valor: number } | null>(null);
  const [editandoSaldo, setEditandoSaldo] = useState(false);
  const [saldoValor, setSaldoValor] = useState("");
  const [saldoMes, setSaldoMes] = useState(mesDe(hojeISO()));
  const [saldoErro, setSaldoErro] = useState("");
  const nomeDe = (id?: string | null) => familia.find((p) => p.id === id)?.nome ?? "Alguém";

  const carregar = useCallback(async () => {
    try {
      const [c, q, f, si] = await Promise.all([repo.cartoes(), repo.cartoesQueUso(), repo.recorrentes(), repo.saldoInicial()]);
      setSaldo(si);
      setCartoes(c);
      setFixos(f);
      setQueUso(q);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os cartões.");
      setCartoes([]);
    }
  }, [repo]);
  useEffect(() => void carregar(), [carregar]);

  return (
    <>
      <h1 className="titulo-pagina">Ajustes</h1>

      <section className="painel">
        <div className="cabeca">
          <h2>Meus cartões</h2>
          <button className="btn pequeno" onClick={() => setEditando({ ...CARTAO_NOVO })}>+ Cartão</button>
        </div>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {cartoes?.length === 0 && !erro && <p className="nota">Cadastre seus cartões para lançar compras no débito, no crédito e parceladas.</p>}
        <ul className="lista">
          {cartoes?.map((c) => (
            <li key={c.id}>
              <button type="button" className="item" onClick={() => setEditando(c)}>
                <span className="icone cartao com-cor" style={comCor(corBanco(c.banco))} aria-hidden="true">{c.banco.slice(0, 2)}</span>
                <span className="texto">
                  <b>{nomeCartao(c)}</b>
                  <span>
                    {[c.temCredito && c.temDebito ? "Flex" : c.temCredito ? "Crédito" : "Débito", c.temCredito && `fecha ${c.diaFechamento}, vence ${c.diaVencimento}`, c.usadoPor && c.usadoPor !== perfil.id && `usado por ${nomeDe(c.usadoPor)}`].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="link">Editar</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="painel">
        <div className="cabeca">
          <h2>Saldo inicial</h2>
          {!editandoSaldo && (
            <button className="btn pequeno fantasma" onClick={() => {
              setSaldoValor(saldo ? (saldo.valor / 100).toFixed(2).replace(".", ",") : "");
              setSaldoMes(saldo?.mes ?? mesDe(hojeISO()));
              setSaldoErro("");
              setEditandoSaldo(true);
            }}>{saldo ? "Alterar" : "Informar"}</button>
          )}
        </div>
        {!editandoSaldo && (
          <p className="nota">
            {saldo
              ? `${reais(saldo.valor)} em ${nomeMes(saldo.mes).toLowerCase()}. O saldo acumulado em Minhas soma isso às sobras de cada mês.`
              : "Quanto você tinha em conta quando começou a usar o app. Assim o saldo acumulado bate com o banco."}
          </p>
        )}
        {editandoSaldo && (
          <form className="form-inline" onSubmit={async (e) => {
            e.preventDefault();
            const t = saldoValor.trim();
            const negativo = t.startsWith("-");
            const v = lerValor(t.replace(/^-/, ""));
            if (t && v === null && t.replace(/^-/, "") !== "0") return setSaldoErro("Confira o valor, como 1.200,00.");
            if (!/^\d{4}-\d{2}$/.test(saldoMes)) return setSaldoErro("Escolha o mês.");
            try {
              await repo.salvarSaldoInicial(t ? { mes: saldoMes, valor: (v ?? 0) * (negativo ? -1 : 1) } : null);
              setEditandoSaldo(false);
              await carregar();
            } catch (err) {
              setSaldoErro(err instanceof Error ? err.message : "Erro ao salvar.");
            }
          }}>
            <div className="duas">
              <label className="campo" htmlFor="s-valor">Valor em conta (R$)<input id="s-valor" inputMode="decimal" value={saldoValor} onChange={(e) => setSaldoValor(e.target.value)} placeholder="0,00" /></label>
              <label className="campo" htmlFor="s-mes">No começo de<input id="s-mes" type="month" value={saldoMes} onChange={(e) => setSaldoMes(e.target.value)} /></label>
            </div>
            {saldoErro && <p className="erro" role="alert">{saldoErro}</p>}
            <p className="nota">Use o saldo do primeiro dia do mês. Deixe vazio para tirar. Se estava no negativo, comece com “-”.</p>
            <div className="duas">
              <button type="button" className="btn fantasma" onClick={() => setEditandoSaldo(false)}>Cancelar</button>
              <button type="submit" className="btn">Salvar</button>
            </div>
          </form>
        )}
      </section>

      <section className="painel">
        <div className="cabeca">
          <h2>Lançamentos fixos</h2>
          <button className="btn pequeno" onClick={() => setFixoEditando({ ...FIXO_NOVO })}>+ Fixo</button>
        </div>
        {fixos.length === 0 && <p className="nota">Salário, aluguel, academia, assinaturas… Cadastre uma vez e lance todo mês com um toque.</p>}
        <ul className="lista">
          {fixos.map((f) => (
            <li key={f.id}>
              <button type="button" className="item" onClick={() => setFixoEditando(f)}>
                <span className={`icone ${f.tipo} ${f.meio}${f.tipo === "saida" && f.meio === "dinheiro" ? " com-cor" : ""}`} style={comCor(corCategoria(f.categoria))} aria-hidden="true">{f.categoria.slice(0, 2)}</span>
                <span className="texto"><b>{f.descricao}</b><span>{descreverFixo(f, cartoes ?? [])}</span></span>
                <span className={`valor ${f.tipo}`}>{f.tipo === "entrada" ? "+" : "−"}{reais(f.valor)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {queUso.length > 0 && (
        <section className="painel">
          <h2>Cartões emprestados para você</h2>
          <ul className="lista">
            {queUso.map((c) => (
              <li key={c.id}>
                <span className="icone cartao com-cor" style={comCor(corBanco(c.banco))} aria-hidden="true">{c.banco.slice(0, 2)}</span>
                <span className="texto"><b>{nomeEmprestado(c, nomeDe(c.dono))}</b><span>Emprestado · fecha {c.diaFechamento}, vence {c.diaVencimento}</span></span>
              </li>
            ))}
          </ul>
          <p className="nota">Quem decide quem usa é a pessoa dona do cartão.</p>
        </section>
      )}

      <section className="painel">
        <h2>Sua conta</h2>
        <dl className="dados">
          <dt>Nome</dt><dd>{perfil.nome}</dd>
          <dt>Papel</dt><dd>{ROTULO_PAPEL[perfil.papel]}</dd>
        </dl>
        <button className="btn fantasma" onClick={sair}>Sair da conta</button>
      </section>

      <BotaoInstalar />

      {fixoEditando && (
        <FormFixo inicial={fixoEditando} cartoes={cartoes ?? []} fechar={() => setFixoEditando(null)}
          salvar={async (r) => { await repo.salvarRecorrente(r); setFixoEditando(null); await carregar(); }}
          parar={fixoEditando.id ? async () => { await repo.pararRecorrente(fixoEditando.id!); setFixoEditando(null); await carregar(); } : undefined} />
      )}
      {editando && (
        <FormCartao eu={perfil} familia={familia} inicial={editando} voltar={() => setEditando(null)}
          salvar={async (c) => { await repo.salvarCartao(c); setEditando(null); await carregar(); }}
          remover={editando.id ? async () => { await repo.removerCartao(editando.id!); setEditando(null); await carregar(); } : undefined} />
      )}
    </>
  );
}
