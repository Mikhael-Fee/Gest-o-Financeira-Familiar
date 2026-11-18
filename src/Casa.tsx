import { useCallback, useEffect, useMemo, useState } from "react";
import { hojeISO, mesDe, nomeMes, somarMes, type Meio } from "./lancamentos";
import { lerValor, reais } from "./dinheiro";
import { resumirCasa, type Ajuda, type Combinado, type DadosCasa, type Despesa, type Forma } from "./casa";
import type { RepositorioCasa } from "./repositorioCasa";
import { podeGerenciarCasa, type Perfil } from "./tipos";
import { Folha, Segmento } from "./Folha";

type Aberto =
  | { tipo: "ajuda" }
  | { tipo: "entrada" }
  | { tipo: "despesa"; despesa?: Despesa }
  | { tipo: "combinado"; filho: Perfil; atual: Combinado | null }
  | { tipo: "pendente"; ajuda: Ajuda };

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const centavosParaTexto = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

export function Casa({ repo, eu, familia }: { repo: RepositorioCasa; eu: Perfil; familia: Perfil[] }) {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [dados, setDados] = useState<DadosCasa | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [aviso, setAviso] = useState("");
  const gerencia = podeGerenciarCasa(eu);
  const nome = (id: string | null) => familia.find((p) => p.id === id)?.nome ?? "Alguém";

  const carregar = useCallback(async () => {
    setErro("");
    try {
      setDados(await repo.carregar(mes));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar a Casa.");
    }
  }, [repo, mes]);

  useEffect(() => {
    setDados(null);
    void carregar();
  }, [carregar]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 2400);
    return () => clearTimeout(t);
  }, [aviso]);

  const r = useMemo(() => (dados ? resumirCasa(dados, familia, mes) : null), [dados, familia, mes]);
  const pendentes = dados?.ajudas.filter((a) => a.status === "informado") ?? [];
  const entradas = dados?.ajudas.filter((a) => a.status === "confirmado") ?? [];

  async function feito(msg: string, acao: () => Promise<void>) {
    await acao();
    setAberto(null);
    setAviso(msg);
    await carregar();
  }
  const dataPadrao = mes === mesDe(hojeISO()) ? hojeISO() : `${mes}-01`;

  return (
    <>
      <div className="mes" role="group" aria-label="Mês">
        <button className="seta" aria-label="Mês anterior" onClick={() => setMes(somarMes(mes, -1))}>‹</button>
        <span>{nomeMes(mes)}</span>
        <button className="seta" aria-label="Próximo mês" onClick={() => setMes(somarMes(mes, 1))}>›</button>
      </div>

      {erro && <p className="erro painel" role="alert">{erro}</p>}
      {!r && !erro && <p className="nota">Carregando a Casa…</p>}

      {r && dados && (
        <>
          <section className="destaque">
            <span className="rotulo">Caixa da Casa em dinheiro</span>
            <p className="valor-grande">{reais(r.caixaDinheiro)}</p>
            <div className="duas">
              <div><span className="mini">Em VR/VA</span><b>{reais(r.caixaBeneficio)}</b></div>
              <div><span className="mini">Contas a pagar</span><b>{reais(r.aPagar)}</b></div>
            </div>
          </section>

          <section className="painel">
            <div className="cabeca">
              <h2>Ajuda do mês</h2>
              {!gerencia && <button className="btn pequeno" onClick={() => setAberto({ tipo: "ajuda" })}>Informar ajuda</button>}
            </div>
            {r.porFilho.length === 0 && <p className="nota">Nenhum filho cadastrado.</p>}
            {r.porFilho.map((f) => {
              const c = f.combinado;
              const podeAjustar = gerencia || f.perfil.id === eu.id;
              return (
                <div key={f.perfil.id} className="filho">
                  <div className="cabeca">
                    <b>{f.perfil.nome}{f.perfil.id === eu.id ? " (você)" : ""}</b>
                    {podeAjustar && (
                      <button className="link" onClick={() => setAberto({ tipo: "combinado", filho: f.perfil, atual: c })}>
                        {c ? "Ajustar combinado" : "Definir combinado"}
                      </button>
                    )}
                  </div>
                  <Progresso rotulo="Dinheiro" feito={f.dinheiro} meta={c?.dinheiro ?? null} />
                  <Progresso rotulo={c?.beneficioNome ?? "VR/VA"} feito={f.beneficio} meta={c ? c.beneficio : null} beneficio />
                  {f.pendentes > 0 && <span className="selo pend">{f.pendentes} aguardando confirmação</span>}
                </div>
              );
            })}
          </section>

          {pendentes.length > 0 && (
            <section className="painel">
              <h2>Aguardando confirmação</h2>
              <ul className="lista">
                {pendentes.map((a) => (
                  <li key={a.id}>
                    <span className={`icone ${a.meio}`} aria-hidden="true">{nome(a.quem).slice(0, 2)}</span>
                    <span className="texto">
                      <b>{nome(a.quem)} · {a.descricao}</b>
                      <span>{a.forma === "pago_direto" ? "Pagou direto" : "Enviou"} · {a.meio === "beneficio" ? "VR/VA" : "dinheiro"} · {dataCurta(a.data)}</span>
                    </span>
                    <span className="fim">
                      <b className="valor">{reais(a.valor)}</b>
                      {gerencia ? (
                        <button className="btn pequeno" onClick={() => void feito("Ajuda confirmada", () => repo.confirmarAjuda(a.id))}>Confirmar</button>
                      ) : a.quem === eu.id ? (
                        <button className="link" onClick={() => setAberto({ tipo: "pendente", ajuda: a })}>Corrigir</button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="painel">
            <div className="cabeca">
              <h2>Despesas</h2>
              {gerencia ? <button className="btn pequeno" onClick={() => setAberto({ tipo: "despesa" })}>+ Despesa</button> : <span className="nota">Os responsáveis lançam</span>}
            </div>
            {r.totalDespesas > 0 && (
              <>
                <div className="barra" role="img" aria-label={`Pago ${reais(r.pagoTotal)} de ${reais(r.totalDespesas)}`}>
                  <i style={{ width: `${(r.pagoTotal / r.totalDespesas) * 100}%` }} />
                </div>
                <p className="nota">{reais(r.pagoTotal)} pagos de {reais(r.totalDespesas)}</p>
              </>
            )}
            {dados.despesas.length === 0 && <p className="nota">Nenhuma despesa em {nomeMes(mes).toLowerCase()}.</p>}
            <ul className="lista">
              {dados.despesas.map((d) => (
                <li key={d.id}>
                  <button className="item" disabled={!gerencia} onClick={() => setAberto({ tipo: "despesa", despesa: d })}>
                    <span className={`icone ${d.meio}`} aria-hidden="true">{d.descricao.slice(0, 2)}</span>
                    <span className="texto">
                      <b>{d.descricao}</b>
                      <span>{dataCurta(d.data)} · {d.meio === "beneficio" ? "VR/VA" : "dinheiro"}</span>
                    </span>
                  </button>
                  <span className="fim">
                    <b className="valor">{reais(d.valor)}</b>
                    {d.status === "paga" ? (
                      <span className="selo ok">{d.pagaPor ? `Paga por ${nome(d.pagaPor)}` : "Paga"}</span>
                    ) : gerencia ? (
                      <button className="btn pequeno fantasma" onClick={() => void feito("Despesa marcada como paga", () => repo.marcarPaga(d.id))}>Marcar paga</button>
                    ) : (
                      <span className="selo pend">A pagar</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="painel">
            <div className="cabeca">
              <h2>Entradas confirmadas</h2>
              {gerencia && <button className="btn pequeno fantasma" onClick={() => setAberto({ tipo: "entrada" })}>+ Entrada</button>}
            </div>
            {entradas.length === 0 && <p className="nota">Nada confirmado ainda neste mês.</p>}
            <ul className="lista">
              {entradas.map((a) => (
                <li key={a.id}>
                  <span className={`icone entrada ${a.meio}`} aria-hidden="true">{nome(a.quem).slice(0, 2)}</span>
                  <span className="texto">
                    <b>{nome(a.quem)} · {a.descricao}</b>
                    <span>{a.forma === "pago_direto" ? "Pagou direto" : "Enviou"} · {a.meio === "beneficio" ? "VR/VA" : "dinheiro"} · {dataCurta(a.data)}</span>
                  </span>
                  <span className="fim"><b className="valor entrada">{reais(a.valor)}</b></span>
                </li>
              ))}
            </ul>
            <p className="nota">Dinheiro e VR/VA têm saldos separados: VR/VA só paga comida. Despesa paga direto por alguém conta como ajuda dessa pessoa e não sai do caixa.</p>
          </section>
        </>
      )}

      {aberto?.tipo === "ajuda" && (
        <FormAjuda dataPadrao={dataPadrao} fechar={() => setAberto(null)}
          salvar={(a) => feito(a.forma === "pago_direto" ? "Despesa paga informada" : "Ajuda informada", () => repo.informarAjuda(eu.id, a))} />
      )}
      {aberto?.tipo === "pendente" && (
        <Folha titulo="Ajuda informada" fechar={() => setAberto(null)} textoSalvar="Fechar" salvar={async () => setAberto(null)}
          textoApagar="Apagar esta ajuda" apagar={() => feito("Ajuda apagada", () => repo.apagarAjuda(aberto.ajuda))}>
          <p>{aberto.ajuda.descricao} · {reais(aberto.ajuda.valor)}</p>
          <p className="nota">Enquanto seus pais não confirmam, você pode apagar e informar de novo com o valor certo.</p>
        </Folha>
      )}
      {aberto?.tipo === "entrada" && (
        <FormEntrada eu={eu} familia={familia} dataPadrao={dataPadrao} fechar={() => setAberto(null)}
          salvar={(quem, a) => feito("Entrada registrada", () => repo.registrarEntrada(quem, a))} />
      )}
      {aberto?.tipo === "despesa" && (
        <FormDespesa despesa={aberto.despesa} dataPadrao={dataPadrao} fechar={() => setAberto(null)}
          salvar={(d) => feito(d.id ? "Despesa atualizada" : "Despesa adicionada", () => repo.salvarDespesa(d))}
          apagar={aberto.despesa ? () => feito("Despesa apagada", () => repo.apagarDespesa(aberto.despesa!.id)) : undefined} />
      )}
      {aberto?.tipo === "combinado" && (
        <FormCombinado filho={aberto.filho} atual={aberto.atual} fechar={() => setAberto(null)}
          salvar={(c) => feito("Combinado salvo", () => repo.salvarCombinado(c))} />
      )}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
    </>
  );
}

function Progresso({ rotulo, feito, meta, beneficio }: { rotulo: string; feito: number; meta: number | null; beneficio?: boolean }) {
  const completo = meta !== null && meta > 0 && feito >= meta;
  return (
    <div className="progresso">
      <span className="mini">{rotulo}</span>
      <span className="barra fina">
        <i className={beneficio ? "beneficio" : ""} style={{ width: meta ? `${Math.min(100, (feito / meta) * 100)}%` : feito ? "100%" : "0%" }} />
      </span>
      <span className="quanto">
        {reais(feito)}{meta !== null ? ` de ${reais(meta)}` : " · varia"}{completo ? " ✓" : ""}
      </span>
    </div>
  );
}

function CamposValor({ valor, setValor, data, setData }: { valor: string; setValor: (v: string) => void; data: string; setData: (v: string) => void }) {
  return (
    <div className="duas">
      <label className="campo" htmlFor="c-valor">Valor (R$)<input id="c-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></label>
      <label className="campo" htmlFor="c-data">Data<input id="c-data" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
    </div>
  );
}

function validar(descricao: string, valor: string, data: string): string | number {
  const c = lerValor(valor);
  if (!descricao.trim()) return "Escreva uma descrição.";
  if (c === null) return "Digite um valor maior que zero, como 150,00.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "Escolha a data.";
  return c;
}

function FormAjuda({ dataPadrao, fechar, salvar }: { dataPadrao: string; fechar: () => void; salvar: (a: { data: string; descricao: string; valor: number; meio: Meio; forma: Forma }) => Promise<void> }) {
  const [forma, setForma] = useState<Forma>("enviado");
  const [meio, setMeio] = useState<Meio>("dinheiro");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(dataPadrao);
  return (
    <Folha titulo="Informar ajuda para a Casa" fechar={fechar} salvar={async () => {
      const v = validar(descricao || (forma === "enviado" ? "Ajuda" : ""), valor, data);
      if (typeof v === "string") return v;
      await salvar({ forma, meio, descricao: descricao.trim() || "Ajuda", valor: v, data });
    }}>
      <Segmento rotulo="Como ajudou" valor={forma} mudar={setForma} opcoes={[["enviado", "Enviei para a Casa"], ["pago_direto", "Paguei uma despesa"]]} />
      <Segmento rotulo="Forma" valor={meio} mudar={setMeio} opcoes={[["dinheiro", "Dinheiro"], ["beneficio", "VR / VA"]]} />
      <label className="campo" htmlFor="c-desc">
        {forma === "pago_direto" ? "O que você pagou?" : "Descrição (opcional)"}
        <input id="c-desc" value={descricao} maxLength={80} onChange={(e) => setDescricao(e.target.value)} placeholder={forma === "pago_direto" ? "Ex.: Mercado do mês" : "Ex.: Ajuda fixa"} />
      </label>
      <CamposValor valor={valor} setValor={setValor} data={data} setData={setData} />
      <p className="nota">{forma === "pago_direto" ? "A despesa entra na Casa como paga por você. " : ""}Seus pais confirmam quando virem.</p>
    </Folha>
  );
}

function FormEntrada({ eu, familia, dataPadrao, fechar, salvar }: { eu: Perfil; familia: Perfil[]; dataPadrao: string; fechar: () => void; salvar: (quem: string, a: { data: string; descricao: string; valor: number; meio: Meio }) => Promise<void> }) {
  const [quem, setQuem] = useState(eu.id);
  const [meio, setMeio] = useState<Meio>("dinheiro");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(dataPadrao);
  return (
    <Folha titulo="Registrar entrada na Casa" fechar={fechar} salvar={async () => {
      const v = validar(descricao, valor, data);
      if (typeof v === "string") return v;
      await salvar(quem, { meio, descricao: descricao.trim(), valor: v, data });
    }}>
      <label className="campo" htmlFor="c-quem">De quem
        <select id="c-quem" value={quem} onChange={(e) => setQuem(e.target.value)}>
          {familia.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu.id ? " (você)" : ""}</option>)}
        </select>
      </label>
      <Segmento rotulo="Forma" valor={meio} mudar={setMeio} opcoes={[["dinheiro", "Dinheiro"], ["beneficio", "VR / VA"]]} />
      <label className="campo" htmlFor="c-desc">Descrição<input id="c-desc" value={descricao} maxLength={80} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: VA da Mãe" /></label>
      <CamposValor valor={valor} setValor={setValor} data={data} setData={setData} />
      <p className="nota">Entra já confirmada. Use para os benefícios de vocês ou para uma ajuda que chegou sem ser informada.</p>
    </Folha>
  );
}

function FormDespesa({ despesa, dataPadrao, fechar, salvar, apagar }: { despesa?: Despesa; dataPadrao: string; fechar: () => void; salvar: (d: { id?: string; data: string; descricao: string; valor: number; meio: Meio }) => Promise<void>; apagar?: () => Promise<void> }) {
  const [meio, setMeio] = useState<Meio>(despesa?.meio ?? "dinheiro");
  const [descricao, setDescricao] = useState(despesa?.descricao ?? "");
  const [valor, setValor] = useState(centavosParaTexto(despesa?.valor));
  const [data, setData] = useState(despesa?.data ?? dataPadrao);
  return (
    <Folha titulo={despesa ? "Editar despesa" : "Nova despesa da Casa"} fechar={fechar} textoApagar="Apagar despesa" apagar={apagar} salvar={async () => {
      const v = validar(descricao, valor, data);
      if (typeof v === "string") return v;
      await salvar({ id: despesa?.id, meio, descricao: descricao.trim(), valor: v, data });
    }}>
      <label className="campo" htmlFor="c-desc">Descrição<input id="c-desc" value={descricao} maxLength={80} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Conta de luz" /></label>
      <CamposValor valor={valor} setValor={setValor} data={data} setData={setData} />
      <Segmento rotulo="Pagar com" valor={meio} mudar={setMeio} opcoes={[["dinheiro", "Dinheiro"], ["beneficio", "VR / VA"]]} />
      {despesa?.pagaPor && <p className="nota">Esta despesa foi paga direto por um dos filhos e conta como ajuda dele.</p>}
    </Folha>
  );
}

function FormCombinado({ filho, atual, fechar, salvar }: { filho: Perfil; atual: Combinado | null; fechar: () => void; salvar: (c: Combinado) => Promise<void> }) {
  const [varia, setVaria] = useState(atual ? atual.dinheiro === null : false);
  const [dinheiro, setDinheiro] = useState(centavosParaTexto(atual?.dinheiro));
  const [beneficioNome, setBeneficioNome] = useState(atual?.beneficioNome ?? "VR");
  const [beneficio, setBeneficio] = useState(centavosParaTexto(atual?.beneficio));
  return (
    <Folha titulo={`Combinado de ${filho.nome}`} fechar={fechar} salvar={async () => {
      const d = varia ? null : lerValor(dinheiro);
      if (!varia && d === null) return "Digite o valor fixo em dinheiro ou marque que varia.";
      const b = beneficio.trim() ? lerValor(beneficio) : 0;
      if (b === null) return "Digite o valor do benefício, como 700,00.";
      await salvar({ filho: filho.id, dinheiro: d, beneficioNome, beneficio: b });
    }}>
      <Segmento rotulo="Dinheiro" valor={varia ? "varia" : "fixo"} mudar={(v) => setVaria(v === "varia")} opcoes={[["fixo", "Valor fixo"], ["varia", "Varia todo mês"]]} />
      {!varia && <label className="campo" htmlFor="c-din">Dinheiro por mês (R$)<input id="c-din" inputMode="decimal" value={dinheiro} onChange={(e) => setDinheiro(e.target.value)} placeholder="500,00" /></label>}
      <div className="duas">
        <label className="campo" htmlFor="c-bnome">Benefício
          <select id="c-bnome" value={beneficioNome} onChange={(e) => setBeneficioNome(e.target.value)}>
            <option>VR</option><option>VA</option><option>VR + VA</option>
          </select>
        </label>
        <label className="campo" htmlFor="c-bval">Valor inteiro (R$)<input id="c-bval" inputMode="decimal" value={beneficio} onChange={(e) => setBeneficio(e.target.value)} placeholder="700,00" /></label>
      </div>
      <p className="nota">O benefício conta inteiro para a Casa, seja enviado ou gasto direto em coisas da casa.</p>
    </Folha>
  );
}
