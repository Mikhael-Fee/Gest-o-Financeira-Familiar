import { useCallback, useEffect, useState } from "react";
import type { Repositorio } from "./repositorio";
import { ROTULO_PAPEL, type Perfil } from "./tipos";
import { nomeCartao, nomeEmprestado, type Cartao } from "./cartoes";
import { CARTAO_NOVO, FormCartao } from "./Minhas";
import { BotaoInstalar } from "./Instalar";

type CartaoEditavel = Omit<Cartao, "id"> & { id?: string };

/** Tudo o que se mexe pouco: cartões, conta, instalar e sair. Fica fora da tela do dia a dia. */
export function Ajustes({ repo, perfil, familia, sair }: { repo: Repositorio; perfil: Perfil; familia: Perfil[]; sair: () => void }) {
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [queUso, setQueUso] = useState<Cartao[]>([]);
  const [editando, setEditando] = useState<CartaoEditavel | null>(null);
  const [erro, setErro] = useState("");
  const nomeDe = (id?: string | null) => familia.find((p) => p.id === id)?.nome ?? "Alguém";

  const carregar = useCallback(async () => {
    try {
      const [c, q] = await Promise.all([repo.cartoes(), repo.cartoesQueUso()]);
      setCartoes(c);
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
                <span className="icone cartao" aria-hidden="true">{c.banco.slice(0, 2)}</span>
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

      {queUso.length > 0 && (
        <section className="painel">
          <h2>Cartões emprestados para você</h2>
          <ul className="lista">
            {queUso.map((c) => (
              <li key={c.id}>
                <span className="icone cartao" aria-hidden="true">{c.banco.slice(0, 2)}</span>
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

      {editando && (
        <FormCartao eu={perfil} familia={familia} inicial={editando} voltar={() => setEditando(null)}
          salvar={async (c) => { await repo.salvarCartao(c); setEditando(null); await carregar(); }}
          remover={editando.id ? async () => { await repo.removerCartao(editando.id!); setEditando(null); await carregar(); } : undefined} />
      )}
    </>
  );
}
