import { useEffect, useMemo, useState } from "react";
import { supabase, dominioLogin } from "./supabase";
import { usuarioParaEmail } from "./usuario";
import { PERFIS_DEMO, cartoesDemo, cartoesQueUsoDemo, casaDemo, devoDemo, lancamentosDemo } from "./demo";
import { Casa } from "./Casa";
import { Familia } from "./Familia";
import { repositorioPrivacidadeDemo, repositorioPrivacidadeSupabase } from "./privacidade";
import { repositorioCasaDemo, repositorioCasaSupabase } from "./repositorioCasa";
import { Minhas } from "./Minhas";
import { repositorioDemo, repositorioSupabase } from "./repositorio";
import { ROTULO_PAPEL, type Perfil } from "./tipos";
import { BotaoInstalar } from "./Instalar";

type Sessao = { perfil: Perfil; demo: boolean };
type Aba = "minhas" | "casa" | "familia";

export function App() {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    const cliente = supabase;
    const carregarPerfil = async (userId: string | undefined) => {
      if (!userId) {
        setSessao((s) => (s?.demo ? s : null));
        setCarregando(false);
        return;
      }
      const { data } = await cliente.from("perfis").select("id, nome, papel").eq("id", userId).maybeSingle();
      if (data) setSessao({ perfil: data as Perfil, demo: false });
      setCarregando(false);
    };
    cliente.auth.getSession().then(({ data }) => carregarPerfil(data.session?.user.id));
    const { data } = cliente.auth.onAuthStateChange((_e, s) => {
      void carregarPerfil(s?.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (carregando) return <div className="tela-centro">Carregando…</div>;
  if (!sessao) return <Entrar onDemo={(p) => setSessao({ perfil: p, demo: true })} />;

  return (
    <Inicio
      sessao={sessao}
      trocarDemo={(p) => setSessao({ perfil: p, demo: true })}
      sair={async () => {
        if (!sessao.demo && supabase) await supabase.auth.signOut();
        setSessao(null);
      }}
    />
  );
}

function Entrar({ onDemo }: { onDemo: (p: Perfil) => void }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setErro("");
    setEnviando(true);
    try {
      const email = usuarioParaEmail(usuario, dominioLogin);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) throw new Error("Usuário ou senha incorretos.");
      const { data: perfil } = await supabase.from("perfis").select("id").eq("id", data.user.id).maybeSingle();
      if (!perfil) {
        await supabase.auth.signOut();
        throw new Error("Sua conta ainda não foi liberada. Peça para quem cuida do app.");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="entrar wrap">
      <div className="marca">
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>Entre Nós</h1>
        <p>As finanças de cada um, e um espaço para a Casa.</p>
      </div>

      {supabase ? (
        <form className="painel" onSubmit={enviar}>
          <label className="campo" htmlFor="usuario">
            Usuário
            <input id="usuario" autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
          </label>
          <label className="campo" htmlFor="senha">
            Senha
            <input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button className="btn" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
        </form>
      ) : (
        <p className="nota painel">O app ainda não está ligado ao banco de dados. Explore a demonstração abaixo.</p>
      )}

      <section className="painel">
        <h2>Ver demonstração</h2>
        <p className="nota">Dados de exemplo. Escolha quem você quer ser:</p>
        <div className="grade-pessoas">
          {PERFIS_DEMO.map((p) => (
            <button key={p.id} className="btn fantasma" onClick={() => onDemo(p)}>
              {p.nome}
            </button>
          ))}
        </div>
      </section>
      <BotaoInstalar />
    </main>
  );
}

function Inicio({ sessao, sair, trocarDemo }: { sessao: Sessao; sair: () => void; trocarDemo: (p: Perfil) => void }) {
  const [aba, setAba] = useState<Aba>("minhas");
  const [familia, setFamilia] = useState<Perfil[]>(sessao.demo ? PERFIS_DEMO : []);
  const { perfil } = sessao;
  // Na demonstração, a Casa é uma só para todos: trocar de pessoa mantém o que foi feito.
  const repoCasa = useMemo(() => (sessao.demo ? repositorioCasaDemo(casaDemo()) : repositorioCasaSupabase), [sessao.demo]);
  const repoPrivacidade = useMemo(
    () => (sessao.demo ? repositorioPrivacidadeDemo({ "demo-filha": "situacao", "demo-pai": "tudo" }, (p) => lancamentosDemo(p)) : repositorioPrivacidadeSupabase),
    [sessao.demo],
  );
  const repo = useMemo(
    () => (sessao.demo ? repositorioDemo(lancamentosDemo(perfil.id), cartoesDemo(perfil.id), devoDemo(perfil.id), cartoesQueUsoDemo(perfil.id)) : repositorioSupabase(perfil.id)),
    [sessao.demo, perfil.id],
  );

  useEffect(() => {
    if (sessao.demo || !supabase) return;
    supabase
      .from("perfis")
      .select("id, nome, papel")
      .order("papel")
      .order("nome")
      .then(({ data }) => setFamilia((data as Perfil[]) ?? []));
  }, [sessao.demo]);

  return (
    <div className="app">
      <header className="topo wrap">
        <div className="linha">
          <div>
            <div className="marca-mini">Entre Nós</div>
            <div className="sub">Olá, {perfil.nome}</div>
          </div>
          <button className="btn fantasma pequeno" onClick={sair}>Sair</button>
        </div>
        {sessao.demo && (
          <div className="demo" role="group" aria-label="Ver como">
            <span>Demonstração · ver como</span>
            <div className="chips">
              {PERFIS_DEMO.map((p) => (
                <button key={p.id} aria-pressed={p.id === perfil.id} onClick={() => trocarDemo(p)}>
                  {p.nome}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="conteudo wrap">
        {aba === "minhas" && <Minhas key={perfil.id} repo={repo} perfil={perfil} casa={repoCasa} familia={familia} />}

        {aba === "casa" && familia.length > 0 && <Casa key={perfil.id} repo={repoCasa} eu={perfil} familia={familia} />}
        {aba === "casa" && familia.length === 0 && <p className="nota">Carregando a família…</p>}

        {aba === "familia" && familia.length > 0 && (
          <>
            <Familia key={perfil.id} repo={repoPrivacidade} eu={perfil} familia={familia} />
            <section className="painel">
              <h2>Sua conta</h2>
              <dl className="dados">
                <dt>Nome</dt><dd>{perfil.nome}</dd>
                <dt>Papel</dt><dd>{ROTULO_PAPEL[perfil.papel]}</dd>
              </dl>
            </section>
            <BotaoInstalar />
          </>
        )}
      </main>

      <nav className="abas" aria-label="Seções">
        <div className="abas-in">
          {([
            ["minhas", "Minhas", IconeEu],
            ["casa", "Casa", IconeCasa],
            ["familia", "Família", IconeFamilia],
          ] as const).map(([id, rotulo, Icone]) => (
            <button key={id} aria-current={aba === id ? "page" : undefined} onClick={() => setAba(id)}>
              <Icone />
              {rotulo}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}


const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
const IconeEu = () => (<svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
const IconeCasa = () => (<svg {...svg}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>);
const IconeFamilia = () => (<svg {...svg}><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2.5 20c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" /><path d="M14 16c.8-1 2-1.6 3-1.6 2 0 3.6 1.4 4.3 4" /></svg>);
