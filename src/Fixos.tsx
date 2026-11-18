import { useState } from "react";
import { CATEGORIAS, hojeISO, mesDe, type Tipo } from "./lancamentos";
import { lerValor, reais } from "./dinheiro";
import { nomeCartao, type Cartao } from "./cartoes";
import type { Limites, NovoRecorrente, Recorrente } from "./fixos";
import { Folha, Segmento } from "./Folha";

type Como = "dinheiro" | "debito" | "credito" | "beneficio";

export const FIXO_NOVO: NovoRecorrente = { descricao: "", categoria: "Outros", valor: 0, tipo: "saida", meio: "dinheiro", pagamento: null, cartaoId: null, dia: 5, desde: mesDe(hojeISO()), ativo: true };

export function descreverFixo(f: Recorrente, cartoes: Cartao[]) {
  const c = cartoes.find((x) => x.id === f.cartaoId);
  const como = f.pagamento ? `${c ? c.banco : "cartão"} ${f.pagamento === "credito" ? "crédito" : "débito"}` : f.meio === "beneficio" ? "VR/VA" : f.tipo === "entrada" ? "entrada" : "dinheiro/Pix";
  return `todo dia ${f.dia} · ${como}${f.usarMedia ? " · pela média" : ""}`;
}

/** Cadastrar ou mudar um lançamento fixo. */
export function FormFixo({ inicial, cartoes, fechar, salvar, parar }: {
  inicial: NovoRecorrente;
  cartoes: Cartao[];
  fechar: () => void;
  salvar: (r: NovoRecorrente) => Promise<void>;
  parar?: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState<Tipo>(inicial.tipo);
  const [como, setComo] = useState<Como>(inicial.meio === "beneficio" ? "beneficio" : (inicial.pagamento as Como) ?? "dinheiro");
  const [cartaoId, setCartaoId] = useState(inicial.cartaoId ?? "");
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [valor, setValor] = useState(inicial.valor ? (inicial.valor / 100).toFixed(2).replace(".", ",") : "");
  const [categoria, setCategoria] = useState(inicial.categoria);
  const [dia, setDia] = useState(String(inicial.dia));
  const [usarMedia, setUsarMedia] = useState(inicial.usarMedia ?? false);
  const categorias = CATEGORIAS[tipo];
  const comCartao = tipo === "saida" && (como === "debito" || como === "credito");
  const opcoes = cartoes.filter((c) => (como === "credito" ? c.temCredito : c.temDebito));
  const cartaoEscolhido = opcoes.find((c) => c.id === cartaoId) ?? opcoes[0];

  async function enviar(): Promise<string | void> {
    const centavos = lerValor(valor);
    const d = parseInt(dia, 10);
    if (!descricao.trim()) return "Escreva uma descrição.";
    if (centavos === null) return "Digite um valor maior que zero.";
    if (!(d >= 1 && d <= 31)) return "O dia vai de 1 a 31.";
    if (comCartao && !cartaoEscolhido) return "Cadastre um cartão primeiro.";
    await salvar({
      ...inicial, tipo, descricao: descricao.trim(), valor: centavos, dia: d, usarMedia,
      categoria: categorias.includes(categoria) ? categoria : categorias[0],
      meio: como === "beneficio" ? "beneficio" : "dinheiro",
      pagamento: comCartao ? (como as "debito" | "credito") : null,
      cartaoId: comCartao ? cartaoEscolhido!.id : null,
    });
  }

  return (
    <Folha titulo={inicial.id ? "Lançamento fixo" : "Novo lançamento fixo"} fechar={fechar} salvar={enviar} apagar={parar} textoApagar="Parar de repetir">
      <Segmento rotulo="Tipo" valor={tipo} mudar={(t: Tipo) => { setTipo(t); if (t === "entrada" && (como === "debito" || como === "credito")) setComo("dinheiro"); }} opcoes={[["saida", "Saída"], ["entrada", "Entrada"]]} />
      <Segmento rotulo="Como" valor={como} mudar={setComo}
        opcoes={tipo === "saida" ? [["dinheiro", "Dinheiro/Pix"], ["debito", "Débito"], ["credito", "Crédito"], ["beneficio", "VR/VA"]] : [["dinheiro", "Dinheiro"], ["beneficio", "VR / VA"]]} />
      {comCartao && (opcoes.length ? (
        <label className="campo" htmlFor="x-cartao">
          Cartão
          <select id="x-cartao" value={cartaoEscolhido?.id ?? ""} onChange={(e) => setCartaoId(e.target.value)}>
            {opcoes.map((c) => <option key={c.id} value={c.id}>{nomeCartao(c)}</option>)}
          </select>
        </label>
      ) : <p className="nota">Nenhum cartão com {como === "credito" ? "crédito" : "débito"}. Cadastre em Meus cartões.</p>)}
      <label className="campo" htmlFor="x-descricao">
        Descrição
        <input id="x-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === "entrada" ? "Ex.: Salário" : "Ex.: Aluguel, academia"} maxLength={80} />
      </label>
      <div className="duas">
        <label className="campo" htmlFor="x-valor">
          Valor (R$)
          <input id="x-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
        </label>
        <label className="campo" htmlFor="x-dia">
          Todo dia
          <input id="x-dia" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
      </div>
      <label className="campo" htmlFor="x-categoria">
        Categoria
        <select id="x-categoria" value={categorias.includes(categoria) ? categoria : categorias[0]} onChange={(e) => setCategoria(e.target.value)}>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="campo marcar" htmlFor="x-media">
        <input id="x-media" type="checkbox" checked={usarMedia} onChange={(e) => setUsarMedia(e.target.checked)} />
        O valor varia: sugerir a média dos últimos 3 meses
      </label>
      {usarMedia && <p className="nota">Bom para salário com hora extra. Enquanto não houver meses lançados, usa o valor acima.</p>}
      <p className="nota">Todo mês ele aparece em Minhas para você lançar com um toque. Se o valor mudar, dá para ajustar antes.</p>
    </Folha>
  );
}

/** Definir o limite de cada categoria de gasto. Campo vazio = sem limite. */
export function FormLimites({ inicial, fechar, salvar }: { inicial: Limites; fechar: () => void; salvar: (l: Record<string, number | null>) => Promise<void> }) {
  const [valores, setValores] = useState<Record<string, string>>(
    Object.fromEntries(CATEGORIAS.saida.map((c) => [c, inicial[c] ? (inicial[c] / 100).toFixed(0) : ""])),
  );
  return (
    <Folha titulo="Limites por mês" fechar={fechar} salvar={async () => {
      const novo: Record<string, number | null> = {};
      for (const c of CATEGORIAS.saida) {
        const t = valores[c].trim();
        if (!t) { if (inicial[c]) novo[c] = null; continue; }
        const v = lerValor(t);
        if (v === null) return `Confira o valor de ${c}.`;
        if (v !== inicial[c]) novo[c] = v;
      }
      await salvar(novo);
    }}>
      <p className="nota">Quanto você quer gastar no máximo em cada categoria por mês. Deixe vazio para não ter limite. Conta dinheiro, Pix, débito e cartão; VR/VA fica de fora.</p>
      <div className="limites-form">
        {CATEGORIAS.saida.map((c) => (
          <label key={c} className="campo linha-campo" htmlFor={`lim-${c}`}>
            <span>{c}</span>
            <input id={`lim-${c}`} inputMode="decimal" placeholder="sem limite" value={valores[c]} onChange={(e) => setValores({ ...valores, [c]: e.target.value })} />
          </label>
        ))}
      </div>
    </Folha>
  );
}

export const textoLimite = (gasto: number, limite: number) => `${reais(gasto)} de ${reais(limite)}`;
