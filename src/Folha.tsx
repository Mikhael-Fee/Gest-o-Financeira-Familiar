import { useState, type ReactNode } from "react";

/** Folha que sobe de baixo, com Cancelar/Salvar e, opcionalmente, apagar com confirmação. */
export function Folha({ titulo, children, fechar, salvar, apagar, textoApagar = "Apagar", textoSalvar = "Salvar" }: {
  titulo: string;
  children: ReactNode;
  fechar: () => void;
  salvar: () => Promise<string | void>; // retorna mensagem de erro de validação, se houver
  apagar?: () => Promise<void>;
  textoApagar?: string;
  textoSalvar?: string;
}) {
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  async function rodar(acao: () => Promise<string | void>) {
    setErro("");
    setOcupado(true);
    try {
      const msg = await acao();
      if (msg) setErro(msg);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="fundo-folha" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form className="folha" aria-label={titulo} onSubmit={(e) => { e.preventDefault(); void rodar(salvar); }}>
        <h2>{titulo}</h2>
        {children}
        {erro && <p className="erro" role="alert">{erro}</p>}
        {confirmar ? (
          <div className="confirmar">
            <p>{textoApagar}? Não dá para desfazer.</p>
            <div className="duas">
              <button type="button" className="btn fantasma" onClick={() => setConfirmar(false)}>Manter</button>
              <button type="button" className="btn perigo" disabled={ocupado} onClick={() => void rodar(async () => apagar!())}>{textoApagar}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="duas">
              <button type="button" className="btn fantasma" onClick={fechar}>Cancelar</button>
              <button className="btn" disabled={ocupado}>{ocupado ? "Salvando…" : textoSalvar}</button>
            </div>
            {apagar && <button type="button" className="link-perigo" onClick={() => setConfirmar(true)}>{textoApagar}</button>}
          </>
        )}
      </form>
    </div>
  );
}

export function Segmento<T extends string>({ rotulo, valor, opcoes, mudar }: {
  rotulo: string;
  valor: T;
  opcoes: [T, string][];
  mudar: (v: T) => void;
}) {
  return (
    <div className="segmento" role="group" aria-label={rotulo} style={{ gridTemplateColumns: `repeat(${opcoes.length}, 1fr)` }}>
      {opcoes.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => mudar(v)}>{t}</button>
      ))}
    </div>
  );
}
