import { useEffect, useMemo, useState } from "react";
import { mesDe, nomeMes, somarMes, type Lancamento } from "./lancamentos";
import { reais } from "./dinheiro";
import type { Repositorio } from "./repositorio";
import { nomeCartao, type Cartao } from "./cartoes";
import { faturasDoCartao, parcelamentosAbertos } from "./resumo";
import { Colunas, mesCurto } from "./Resumo";
import { comCor, corBanco, corCategoria, iconeCategoria } from "./cores";

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const mesSo = (m: string) => nomeMes(m).split(" ")[0].toLowerCase();

/** Tudo de um cartão: fatura do mês escolhido, faturas ao longo dos meses e parcelamentos que faltam. */
export function CartaoDetalhe({ repo, cartao, cartoes, trocar, mesInicial, nomeDe, voltar, abrir }: {
  repo: Repositorio;
  cartao: Cartao;
  /** Todos os seus cartões, para passar de um para outro com as setas. */
  cartoes: Cartao[];
  trocar: (c: Cartao, mes: string) => void;
  mesInicial: string;
  nomeDe: (id?: string | null) => string;
  voltar: () => void;
  abrir: (l: Lancamento) => void;
}) {
  const [mes, setMes] = useState(mesInicial);
  const [lista, setLista] = useState<Lancamento[] | null>(null);
  const [erro, setErro] = useState("");
  // Janela fixa: 2 meses antes e 5 depois do mês em que a tela abriu (cabe na tela do celular).
  const inicio = somarMes(mesInicial, -2);
  const N = 8;

  useEffect(() => {
    let vivo = true;
    // Até 5 anos à frente: parcelamentos longos (até 48x) aparecem inteiros em "Parcelamentos".
    repo.listarIntervalo(inicio, somarMes(inicio, N + 59))
      .then((l) => vivo && setLista(l.filter((x) => x.cartaoId === cartao.id)))
      .catch((e) => vivo && (setErro(e instanceof Error ? e.message : "Erro ao carregar."), setLista([])));
    return () => { vivo = false; };
  }, [repo, cartao.id, inicio, mesInicial]);

  const l = lista ?? [];
  const posicao = Math.max(0, cartoes.findIndex((c) => c.id === cartao.id));
  const anterior = cartoes[(posicao - 1 + cartoes.length) % cartoes.length] ?? cartao;
  const proximo = cartoes[(posicao + 1) % cartoes.length] ?? cartao;
  const faturas = useMemo(() => faturasDoCartao(l, cartao.id, inicio, N), [l, cartao.id, inicio]);
  const doMes = l.filter((x) => mesDe(x.data) === mes);
  const credito = doMes.filter((x) => x.pagamento === "credito");
  const debito = doMes.filter((x) => x.pagamento === "debito");
  const totalCredito = credito.reduce((s, x) => s + x.valor, 0);
  const deOutros = credito.filter((x) => x.deQuem).reduce((s, x) => s + x.valor, 0);
  const parcelamentos = parcelamentosAbertos(l, cartao.id, mes);
  const vencimento = cartao.diaVencimento ? `${String(cartao.diaVencimento).padStart(2, "0")}/${mes.slice(5, 7)}` : null;
  const foraDaJanela = mes < inicio || mes > somarMes(inicio, N - 1);

  return (
    <>
      <div className="voltar-linha">
        <button className="btn fantasma pequeno" onClick={voltar}>‹ Voltar</button>
        {cartoes.length > 1 && <span className="nota">{posicao + 1} de {cartoes.length}</span>}
      </div>
      <header className="cartao-topo">
        {cartoes.length > 1 && <button className="seta troca" aria-label={`Cartão anterior: ${nomeCartao(anterior)}`} onClick={() => trocar(anterior, mes)}>‹</button>}
        <span className="icone cartao grande com-cor" style={comCor(corBanco(cartao.banco))} aria-hidden="true">{cartao.banco.slice(0, 2)}</span>
        <div>
          <h1 className="titulo-pagina">{nomeCartao(cartao)}</h1>
          <span className="nota">
            {[cartao.temCredito && cartao.temDebito ? "Flex" : cartao.temCredito ? "Crédito" : "Débito", cartao.temCredito && `fecha dia ${cartao.diaFechamento}, vence dia ${cartao.diaVencimento}`, cartao.usadoPor && `usado por ${nomeDe(cartao.usadoPor)}`].filter(Boolean).join(" · ")}
          </span>
        </div>
        {cartoes.length > 1 && <button className="seta troca" aria-label={`Próximo cartão: ${nomeCartao(proximo)}`} onClick={() => trocar(proximo, mes)}>›</button>}
      </header>

      <div className="mes" role="group" aria-label="Mês">
        <button className="seta" aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>‹</button>
        <span>{nomeMes(mes)}</span>
        <button className="seta" aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>›</button>
      </div>

      {erro && <p className="erro painel" role="alert">{erro}</p>}
      {lista === null && <p className="nota">Carregando…</p>}

      {lista && cartao.temCredito && (
        <section className="destaque">
          <span className="rotulo">Fatura de {mesSo(mes)}{vencimento ? ` · vence ${vencimento}` : ""}</span>
          <p className="valor-grande">{reais(totalCredito)}</p>
          {deOutros > 0 && <span className="mini">Inclui {reais(deOutros)} de compras de outras pessoas</span>}
          {foraDaJanela && <span className="mini">Volte alguns meses para ver o gráfico.</span>}
        </section>
      )}

      {lista && cartao.temCredito && (
        <section className="painel">
          <div className="cabeca"><h2>Faturas mês a mês</h2><span className="nota">Toque num mês</span></div>
          <Colunas pontos={faturas} rotulo={`Faturas do ${cartao.banco} por mês`} destacar={mes} aoTocar={setMes} cor={corBanco(cartao.banco)} />
          <p className="nota">Os meses depois de {mesCurto(mesInicial)} mostram as parcelas já lançadas.</p>
        </section>
      )}

      {lista && cartao.temCredito && (
        <section className="painel">
          <h2>Compras na fatura de {mesSo(mes)}</h2>
          {credito.length === 0 && <p className="nota">Nada nesta fatura.</p>}
          <ul className="lista">
            {credito.map((x) => (
              <li key={x.id}>
                <button className="item" onClick={() => abrir(x)}>
                  <span className="icone com-cor" style={comCor(corCategoria(x.categoria))} aria-hidden="true"><span className="emoji">{iconeCategoria(x.categoria)}</span></span>
                  <span className="texto">
                    <b>{x.descricao}</b>
                    <span>{x.categoria}{x.dataCompra ? ` · comprou ${dataCurta(x.dataCompra)}` : ""}{x.parcelas && x.parcelas > 1 ? ` · ${x.parcela}/${x.parcelas}` : ""}{x.deQuem ? ` · de ${nomeDe(x.deQuem)}` : ""}</span>
                  </span>
                  <span className="valor saida">−{reais(x.valor)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lista && parcelamentos.length > 0 && (
        <section className="painel">
          <h2>Parcelamentos em andamento</h2>
          <ul className="lista">
            {parcelamentos.map((p) => (
              <li key={p.compraId}>
                <span className="texto">
                  <b>{p.descricao}</b>
                  <span>{p.restantes}× de {reais(p.valorParcela)} · próxima {p.proxima}/{p.parcelas} · termina em {mesCurto(mesDe(p.ultimaFatura))}/{p.ultimaFatura.slice(2, 4)}{p.deQuem ? ` · de ${nomeDe(p.deQuem)}` : ""}</span>
                </span>
                <span className="fim"><b className="valor">{reais(p.totalRestante)}</b><span className="mini-cinza">falta</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lista && cartao.temDebito && (
        <section className="painel">
          <div className="cabeca"><h2>Débito em {mesSo(mes)}</h2><b className="valor">{reais(debito.reduce((s, x) => s + x.valor, 0))}</b></div>
          {debito.length === 0 && <p className="nota">Nenhuma compra no débito.</p>}
          <ul className="lista">
            {debito.map((x) => (
              <li key={x.id}>
                <button className="item" onClick={() => abrir(x)}>
                  <span className="texto"><b>{x.descricao}</b><span>{x.categoria} · {dataCurta(x.data)}</span></span>
                  <span className="valor saida">−{reais(x.valor)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
