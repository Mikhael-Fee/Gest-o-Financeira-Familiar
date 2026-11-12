import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  CreditCard,
  Download,
  House,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import {
  addMonths,
  balance,
  contribution,
  conservativeSalary,
  divideSources,
  emptyState,
  forecast,
  loanSummary,
  money,
  parseMoney,
  remaining,
  status,
  today,
  totals,
  type State,
} from "./domain/finance";
import {
  DemoRepository,
  demoIdentity,
  id,
  RemoteRepository,
  supabase,
  type Command,
  type Identity,
} from "./data/store";
const navigation = [
  ["/", "Início", House],
  ["/movimentacoes", "Movimentações", ArrowDownLeft],
  ["/casa", "Casa", House],
  ["/contas", "Contas e cartões", Wallet],
  ["/planejamento", "Planejamento", ChartNoAxesCombined],
  ["/relatorios", "Relatórios", ChartNoAxesCombined],
  ["/configuracoes", "Configurações", ShieldCheck],
] as const;
const categories = [
  "Alimentação",
  "Moradia",
  "Contas da Casa",
  "Transporte",
  "Saúde",
  "Educação",
  "Compras pessoais",
  "Lazer",
  "Assinaturas",
  "Família/Ajuda",
  "Financeiro",
  "Outros",
];
const institutions = [
  "Inter",
  "Nubank",
  "Itaú",
  "Bradesco",
  "Mercado Pago",
  "Caixa",
  "Outro",
];
function friendlyError(e: unknown) {
  if (e && typeof e === "object" && "issues" in e)
    return "Confira os valores: use quantias positivas, datas válidas e uma conta autorizada.";
  return e instanceof Error
    ? e.message
    : "Não foi possível concluir. Tente novamente.";
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            "aria-label": label,
          })
        : children}
    </label>
  );
}
function Metric({
  label,
  value,
  hint,
  positive = false,
}: {
  label: string;
  value: string;
  hint: string;
  positive?: boolean;
}) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
function Auth({
  onDemo,
  onLogin,
}: {
  onDemo: () => void;
  onLogin: (u: Identity) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"login" | "invite" | "reset">("login");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      if (!supabase)
        throw Error(
          "Supabase ainda não configurado. Explore a demonstração sem dados reais.",
        );
      const { data: response, error: err } = await supabase.functions.invoke(
        "identity",
        {
          body: {
            action: mode,
            username: data.get("username"),
            password: data.get("password"),
            token: data.get("token"),
          },
        },
      );
      if (err || !response?.session)
        throw Error(
          "Não foi possível entrar. Verifique os dados ou a validade do convite.",
        );
      const { error: sessionError } = await supabase.auth.setSession(
        response.session,
      );
      if (sessionError) throw sessionError;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,family_id,name")
        .single();
      if (profileError || !profile) throw Error("Perfil indisponível.");
      onLogin(profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <div className="auth-story">
        <div className="brand">
          <span className="brand-icon">
            <House />
          </span>{" "}
          entre nós<span className="brand-dot">.</span>
        </div>
        <span className="eyebrow">FINANÇAS FAMILIARES</span>
        <h1>
          Mais clareza.
          <br />
          Mais tranquilidade.
          <br />
          <em>Juntos.</em>
        </h1>
        <p>Seu dinheiro, seu espaço. As contas da Casa, em um só lugar.</p>
        <div className="privacy">
          <ShieldCheck /> Suas finanças pessoais continuam privadas.
        </div>
      </div>
      <section className="auth-card">
        <span className="eyebrow">BEM-VINDO À SUA CASA</span>
        {!navigator.onLine && (
          <p role="status" className="error">
            Você está sem conexão. Entrar e salvar lançamentos exigem internet.
          </p>
        )}
        <h2>
          {mode === "login"
            ? "Que bom ter você aqui"
            : mode === "invite"
              ? "Vamos começar?"
              : "Recupere seu acesso"}
        </h2>
        <p className="muted">
          {mode === "login"
            ? "Entre para organizar o que importa."
            : "Use o convite individual enviado pela administração."}
        </p>
        <form onSubmit={submit}>
          <Field label="Nome de usuário">
            <input
              name="username"
              required
              autoComplete="username"
              minLength={3}
              maxLength={32}
            />
          </Field>
          <Field label="Senha">
            <input
              name="password"
              type="password"
              required
              minLength={mode === "login" ? 1 : 12}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>
          {mode !== "login" && (
            <Field label="Código do convite ou recuperação">
              <input name="token" required autoComplete="off" />
            </Field>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? "Entrar com segurança"
                : "Continuar"}
            <ChevronRight size={18} />
          </button>
        </form>
        <div className="auth-options">
          <button
            onClick={() => setMode(mode === "invite" ? "login" : "invite")}
          >
            {mode === "invite" ? "Já tenho acesso" : "Tenho um convite"}
          </button>
          <button onClick={() => setMode(mode === "reset" ? "login" : "reset")}>
            Recuperar acesso
          </button>
        </div>
        <div className="divider" />
        <button className="secondary full" onClick={onDemo}>
          Explorar demonstração
        </button>
        <small className="muted">
          Somente dados fictícios. As alterações da demonstração são descartadas
          ao sair.
        </small>
      </section>
    </main>
  );
}
export default function App() {
  const [user, setUser] = useState<Identity | null>(null),
    [demo, setDemo] = useState(false),
    [state, setState] = useState<State>(emptyState),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7)),
    [scope, setScope] = useState("personal"),
    [form, setForm] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [invite, setInvite] = useState("");
  const repository = useRef<DemoRepository | RemoteRepository>(
    new RemoteRepository(),
  );
  const lock = useRef(false);
  const epoch = useRef(0);
  const draft = useRef(id());
  const requestKey = useRef(id());
  const partIds = useRef([id(), id()]);
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);
  useEffect(() => {
    if (form) {
      draft.current = id();
      requestKey.current = id();
      partIds.current = [id(), id()];
      dialogRef.current?.showModal();
      dialogRef.current?.querySelector("input")?.focus();
    } else dialogRef.current?.close();
  }, [form]);
  async function load() {
    const generation = epoch.current;
    const repo = repository.current;
    setLoading(true);
    try {
      const next = await repo.load();
      if (generation !== epoch.current) return;
      setState(next);
      setError("");
    } catch (e) {
      if (generation === epoch.current) setError(friendlyError(e));
    } finally {
      if (generation === epoch.current) setLoading(false);
    }
  }
  async function start(u: Identity, isDemo = false) {
    epoch.current++;
    repository.current = isDemo ? new DemoRepository() : new RemoteRepository();
    setUser(u);
    setDemo(isDemo);
    navigate("/");
    await load();
  }
  async function execute(type: Command["type"], payload: Command["payload"]) {
    if (lock.current || !user) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!online && !demo)
        throw Error("Você está sem conexão. Reconecte para salvar.");
      await repository.current.execute(
        { key: form ? requestKey.current : id(), type, payload },
        user,
      );
      await load();
      setForm("");
      setNotice("Salvo com segurança.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function logout() {
    epoch.current++;
    if (supabase && !demo) await supabase.auth.signOut();
    setState(emptyState());
    setUser(null);
    setDemo(false);
    setError("");
    setNotice("");
    setInvite("");
  }
  if (!user)
    return (
      <Auth
        onDemo={() => void start(demoIdentity, true)}
        onLogin={(u) => void start(u)}
      />
    );
  const availableCategories = [
    ...categories.filter(
      (name) =>
        !state.categories.some(
          (c) => c.owner_id === user.id && c.name === name && !c.active,
        ),
    ),
    ...state.categories
      .filter(
        (c) =>
          c.owner_id === user.id && c.active && !categories.includes(c.name),
      )
      .map((c) => c.name),
  ];
  const personal = scope === "personal";
  const t = totals(state, month, personal ? user.id : undefined, !personal);
  const accounts = state.accounts.filter((a) => a.owner_id === user.id);
  const bankBalance = accounts
    .filter((a) => !["VA", "VR"].includes(a.kind))
    .reduce((n, a) => n + balance(a, state), 0);
  const benefit = accounts
    .filter((a) => ["VA", "VR"].includes(a.kind))
    .reduce((n, a) => n + balance(a, state), 0);
  const obligations = state.obligations
    .filter((o) => (personal ? o.owner_id === user.id : o.house))
    .filter((o) => remaining(o, state.payments) > 0)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const entries = state.entries
    .filter(
      (e) =>
        !e.voided &&
        (personal ? e.consumer_id === user.id : e.house) &&
        e.occurred_on.startsWith(month) &&
        `${e.description} ${e.category} ${e.tags?.join(" ") ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const goal = contribution(state, user.id, month);
  const heading = (title: string, subtitle: string, action?: ReactNode) => (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
  const entryList = (limit?: number) => (
    <div className="entry-list">
      {entries.length ? (
        entries.slice(0, limit).map((e) => (
          <div className="entry-row" key={e.id}>
            <span
              className={`entry-icon ${e.kind === "income" ? "green" : ""}`}
            >
              {e.kind === "income" ? (
                <ArrowDownLeft size={20} />
              ) : (
                <ArrowUpRight size={20} />
              )}
            </span>
            <div className="entry-info">
              <strong>{e.description}</strong>
              <small>
                {e.category} · {e.occurred_on.split("-").reverse().join("/")}
                {e.house ? " · Casa" : ""}
                {e.card_id ? " · Crédito" : ""}
              </small>
            </div>
            <strong className={e.kind === "income" ? "positive" : ""}>
              {e.kind === "expense" ? "−" : "+"} {money(e.amount)}
            </strong>
            {!limit && e.owner_id === user.id && !e.card_id && (
              <button
                className="text-button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Anular este lançamento? O histórico será preservado.",
                    )
                  )
                    void execute("void", { id: e.id, version: e.version });
                }}
              >
                Anular
              </button>
            )}
          </div>
        ))
      ) : (
        <Empty>
          Nenhuma movimentação neste período. Use “Adicionar” para começar.
        </Empty>
      )}
    </div>
  );
  const obligationList = (limit?: number) => (
    <div className="entry-list">
      {obligations.length ? (
        obligations.slice(0, limit).map((o) => (
          <div className="entry-row" key={o.id}>
            <span className="date-tile">
              <b>{o.due_on.slice(8)}</b>
              <small>
                {o.due_on.slice(5, 7)}/{o.due_on.slice(0, 4)}
              </small>
            </span>
            <div className="entry-info">
              <strong>{o.description}</strong>
              <Badge>{status(o, state.payments)}</Badge>
            </div>
            <div className="align-right">
              <strong>{money(remaining(o, state.payments))}</strong>
              {(o.owner_id === user.id || o.house) && (
                <button
                  className="text-button"
                  onClick={() => setForm(`pay:${o.id}`)}
                >
                  Registrar pagamento
                </button>
              )}
            </div>
          </div>
        ))
      ) : (
        <Empty>
          Nenhuma obrigação em aberto. As dívidas antigas também aparecerão
          aqui.
        </Empty>
      )}
    </div>
  );
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          { exported_at: new Date().toISOString(), ...state },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "financas-exportacao-privada.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "");
    const num = (k: string) => Number(f.get(k));
    try {
      if (form === "account")
        await execute("account", {
          id: draft.current,
          name: `${str("institution")} · ${str("description")}`,
          kind: str("kind"),
          opening: parseMoney(str("amount")),
          cutoff: str("date"),
        });
      else if (form === "card")
        await execute("card", {
          id: draft.current,
          name: `${str("institution")} · ${str("description")}`,
          closing: num("closing"),
          due: num("due"),
          authorized: [],
        });
      else if (form === "loan")
        await execute("plan", {
          id: draft.current,
          description: str("description"),
          first_due: str("date"),
          count: num("count"),
          amount: parseMoney(str("amount")),
          last_paid: num("last_paid"),
          last_paid_on: str("paid_on") || null,
          history_confirmed: f.get("history") === "on",
          payoff: null,
          kind: "loan",
        });
      else if (form.startsWith("pay:")) {
        const o = state.obligations.find((o) => o.id === form.slice(4))!;
        await execute("pay", {
          obligation_id: o.id,
          amount: parseMoney(str("amount")),
          account_id: str("account"),
          paid_on: str("date"),
          version: o.version,
        });
      } else if (form.startsWith("permission:"))
        await execute("permission", {
          id: form.slice(11),
          member_id: str("member"),
          allowed: f.get("allowed") === "on",
        });
      else if (form === "transfer" || form === "reconcile")
        await execute(form, {
          account_id: str("account"),
          destination_id: str("destination"),
          amount: parseMoney(str("amount")),
          date: str("date"),
          reason: str("reason"),
        });
      else if (form === "recurrence")
        await execute("recurrence", {
          id: draft.current,
          description: str("description"),
          amount: parseMoney(str("amount")),
          date: str("date"),
          house: f.get("house") === "on",
          variable: f.get("variable") === "on",
        });
      else if (form.startsWith("replace:") || form.startsWith("replace_plan:"))
        await execute("replace", {
          id: draft.current,
          sources: form.startsWith("replace_plan:")
            ? state.obligations
                .filter(
                  (o) =>
                    o.plan_id === form.slice(13) &&
                    remaining(o, state.payments) > 0,
                )
                .map((o) => o.id)
            : [form.slice(8)],
          description: str("description"),
          date: str("date"),
          count: num("count"),
          fee: parseMoney(str("fee")),
          occurred_on: str("occurred_on"),
          quote: str("quote") ? parseMoney(str("quote")) : null,
        });
      else if (form.startsWith("adjust_due:")) {
        const o = state.obligations.find((o) => o.id === form.slice(11))!;
        await execute("adjust_due", {
          id: o.id,
          version: o.version,
          date: str("date"),
          amount: parseMoney(str("amount")),
          reason: str("reason"),
        });
      } else if (form.startsWith("category")) {
        const cat = state.categories.find((c) => c.id === form.slice(9));
        await execute("category", {
          id: cat?.id ?? draft.current,
          name: str("description"),
          parent_id: str("parent") || null,
          active: true,
          version: cat?.version ?? 0,
        });
      } else if (form === "salary")
        await execute("salary", {
          base: parseMoney(str("amount")),
          payday: num("payday"),
        });
      else if (form.startsWith("reverse_payment:"))
        await execute("reverse_payment", {
          id: form.slice(16),
          date: str("date"),
          reason: str("reason"),
        });
      else if (form.startsWith("history:")) {
        const o = state.obligations.find((o) => o.id === form.slice(8))!;
        await execute("history", {
          id: o.id,
          version: o.version,
          amount: parseMoney(str("amount")),
          date: str("date"),
          account_id: str("account"),
          reason: str("reason"),
        });
      } else if (
        form.startsWith("reject:") ||
        form.startsWith("reverse_settlement:")
      ) {
        const parts = form.split(":");
        const x = state.settlements.find((x) => x.id === parts[1])!;
        await execute(parts[0] as Command["type"], {
          id: x.id,
          version: x.version,
          transfer_id: parts[2],
          date: str("date"),
          reason: str("reason"),
        });
      } else if (form === "goal")
        await execute("goal", { month, amount: parseMoney(str("amount")) });
      else if (form.startsWith("send:"))
        await execute("send", {
          id: form.slice(5),
          amount: parseMoney(str("amount")),
          sent_on: str("date"),
          account_id: str("account"),
        });
      else if (form.startsWith("confirm:")) {
        const x = state.settlements.find((x) => x.id === form.slice(8))!;
        await execute("confirm", {
          id: x.id,
          version: x.version,
          date: str("date"),
          account_id: str("account"),
        });
      } else {
        const amount = parseMoney(str("amount"));
        const second = f.get("second_amount")
          ? parseMoney(str("second_amount"))
          : 0;
        const entry = {
          id: draft.current,
          description: str("description"),
          kind: form,
          amount,
          occurred_on: str("date"),
          installments: form === "expense" ? num("installments") : 1,
          tags: str("tags")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          beneficiary_id: str("beneficiary") || null,
          loan_id: str("loan_id") || null,
          income_type: form === "income" ? str("income_type") : null,
          category:
            form === "expense"
              ? str("category")
              : form === "benefit"
                ? "Benefício"
                : "Salário / extra",
          house: f.get("house") === "on",
          consumer_id: str("consumer") || user!.id,
          responsible_id: str("responsible") || null,
          card_id: str("card") || null,
          splits: str("card")
            ? []
            : [
                { account_id: str("account"), amount: amount - second },
                ...(second
                  ? [{ account_id: str("second_account"), amount: second }]
                  : []),
              ],
        };
        const housePart = str("house_part") ? parseMoney(str("house_part")) : 0;
        if (form === "expense" && housePart > 0 && housePart < amount) {
          const [houseSources, privateSources] = entry.card_id
            ? [[], []]
            : divideSources(entry.splits, housePart);
          await execute("purchase_split", {
            id: draft.current,
            amount,
            parts: [
              {
                ...entry,
                id: partIds.current[0],
                amount: housePart,
                house: true,
                description:
                  str("house_description") || "Parte compartilhada da compra",
                category: str("house_category"),
                splits: houseSources,
              },
              {
                ...entry,
                id: partIds.current[1],
                amount: amount - housePart,
                house: false,
                splits: privateSources,
              },
            ],
          });
        } else {
          if (housePart > amount)
            throw Error("Parte da Casa maior que o total.");
          await execute("entry", entry);
        }
      }
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  const rawFormType = form.split(":")[0];
  const formType = rawFormType === "replace_plan" ? "replace" : rawFormType;
  const formTitle: Record<string, string> = {
    expense: "Nova despesa",
    income: "Nova receita",
    benefit: "Recarga VA/VR",
    account: "Adicionar conta ou benefício",
    card: "Adicionar cartão",
    loan: "Empréstimo em andamento",
    pay: "Registrar pagamento",
    goal: "Meta flexível da Casa",
    send: "Informar Pix enviado",
    confirm: "Confirmar recebimento do Pix",
    transfer: "Transferir entre minhas contas",
    reconcile: "Conferir saldo registrado",
    recurrence: "Conta recorrente",
    replace: "Transportar saldo / renegociar",
    adjust_due: "Ajustar obrigação confirmada",
    permission: "Autorizar uso do cartão",
    category: "Nova categoria",
    salary: "Referência de salário",
    loan_received: "Empréstimo recebido",
    history: "Confirmar pagamento histórico",
    reverse_payment: "Estornar pagamento registrado",
    reject: "Rejeitar declaração de Pix",
    reverse_settlement: "Corrigir confirmação de Pix",
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "expanded" : ""}`}>
        <NavLink className="brand" to="/">
          <span className="brand-icon">
            <House size={22} />
          </span>
          entre nós<span className="brand-dot">.</span>
        </NavLink>
        <span className="sidebar-label">SEU ESPAÇO FINANCEIRO</span>
        <nav aria-label="Navegação principal">
          {navigation.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              onClick={() => setMenu(false)}
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={18} />
            <span>
              Privacidade por padrão
              <br />
              <small>Seu espaço é só seu.</small>
            </span>
          </div>
          <button className="profile" onClick={() => void logout()}>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              {user.name}
              <small>{demo ? "Demonstração" : "Sessão privada"}</small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Minha organização <ChevronRight size={14} />{" "}
            <strong>Visão geral</strong>
          </span>
          <div className="header-right">
            <span className="secure">
              <span className="status-dot" />{" "}
              {demo ? "Ambiente de demonstração" : "Conexão privada"}
            </span>
            <button
              className="icon-button"
              aria-label="Ver pendências"
              onClick={() => navigate("/planejamento")}
            >
              <Bell size={19} />
            </button>
            <span className="avatar small">{user.name.slice(0, 1)}</span>
          </div>
        </header>
        <main id="main-content" className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">UM PASSO DE CADA VEZ</span>
              <h1>
                Olá, {user.name}
                <span className="greeting-dot">.</span>
              </h1>
              <p>Vamos cuidar do que importa para você e sua família.</p>
            </div>
            <button className="primary" onClick={() => setForm("choose")}>
              <Plus size={19} /> Adicionar
            </button>
          </div>
          {demo && (
            <div className="demo-banner">
              <ShieldCheck size={17} />
              <span>
                Dados fictícios · Explore à vontade. Nada será salvo depois de
                sair.
              </span>
            </div>
          )}
          {!online && (
            <p className="error" role="status">
              Você está sem conexão. Lançamentos exigem internet.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error} <button onClick={() => void load()}>Atualizar</button>
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
              <button
                aria-label="Fechar confirmação"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </p>
          )}
          <div className="toolbar">
            <div className="segmented" aria-label="Visão financeira">
              <button
                aria-pressed={personal}
                onClick={() => setScope("personal")}
              >
                <Wallet size={16} /> Meu espaço
              </button>
              <button
                aria-pressed={!personal}
                onClick={() => setScope("house")}
              >
                <House size={16} /> Casa
              </button>
            </div>
            <label className="month-picker">
              Período{" "}
              <input
                aria-label="Mês de referência"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
          </div>
          {loading ? (
            <p role="status">Carregando seus dados…</p>
          ) : (
            <Routes>
              <Route
                path="/"
                element={
                  <>
                    <div className="metrics">
                      <Metric
                        label="Saldo em contas"
                        value={money(bankBalance)}
                        hint="Saldo registrado · confira no banco"
                      />
                      <Metric
                        label="Entradas do mês"
                        value={money(t.income)}
                        hint="Somente receitas confirmadas"
                        positive
                      />
                      <Metric
                        label="Consumo do mês"
                        value={money(t.consumption)}
                        hint="Sem duplicar pagamentos de fatura"
                      />
                      <Metric
                        label="Obrigações em aberto"
                        value={money(t.due)}
                        hint="Inclui pendências dos meses anteriores"
                      />
                    </div>
                    <div className="dashboard-grid">
                      <section className="panel">
                        {heading(
                          "Próximos compromissos",
                          "Um olhar para o que precisa de atenção.",
                          <button
                            className="text-button"
                            onClick={() => navigate("/planejamento")}
                          >
                            Ver todos <ChevronRight size={15} />
                          </button>,
                        )}
                        {obligationList(4)}
                      </section>
                      <section className="house-panel">
                        <span className="house-symbol">
                          <House size={24} />
                        </span>
                        <span className="eyebrow">NOSSA CASA</span>
                        <h2>
                          Cada contribuição
                          <br />
                          faz a diferença.
                        </h2>
                        <p>
                          Um objetivo compartilhado, sem transformar a diferença
                          em dívida.
                        </p>
                        <div className="goal-values">
                          <strong>{money(goal.actual)}</strong>
                          <span>de {money(goal.goal)}</span>
                        </div>
                        <progress
                          aria-label="Progresso da meta Casa"
                          value={Math.min(goal.actual, goal.goal)}
                          max={goal.goal || 1}
                        />
                        <small>
                          {goal.above
                            ? `${money(goal.above)} acima da meta`
                            : `Faltam ${money(goal.missing)} para sua meta flexível`}
                        </small>
                        <button
                          className="secondary full"
                          onClick={() => navigate("/casa")}
                        >
                          Acompanhar a Casa <ChevronRight size={17} />
                        </button>
                      </section>
                      <section className="panel">
                        {heading(
                          "Últimas movimentações",
                          "O dia a dia do seu dinheiro.",
                          <button
                            className="text-button"
                            onClick={() => navigate("/movimentacoes")}
                          >
                            Ver todas <ChevronRight size={15} />
                          </button>,
                        )}
                        {entryList(5)}
                      </section>
                      <section className="panel benefit-panel">
                        {heading(
                          "Alimentação, bem cuidada",
                          "Benefícios separados do dinheiro em conta.",
                        )}
                        <span className="benefit-total">{money(benefit)}</span>
                        <p className="muted">Saldo registrado em VA e VR</p>
                        <div className="divider" />
                        <p>
                          Recargas não são salário. Gastos com alimentação da
                          Casa podem contar como contribuição.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => navigate("/contas")}
                        >
                          Ver minhas carteiras <ChevronRight size={16} />
                        </button>
                      </section>
                    </div>
                    <div className="footer-note">
                      <ShieldCheck size={15} /> Seu dinheiro é pessoal. O
                      cuidado com a Casa é compartilhado.
                    </div>
                  </>
                }
              />
              <Route
                path="/movimentacoes"
                element={
                  <section className="panel">
                    {heading(
                      "Movimentações",
                      "Consumo e receitas confirmados. Pagamentos de dívidas ficam no fluxo de caixa.",
                    )}
                    <Field label="Buscar descrição ou categoria">
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Ex.: mercado, alimentação…"
                      />
                    </Field>
                    {entryList()}
                  </section>
                }
              />
              <Route
                path="/casa"
                element={
                  <>
                    <div className="metrics">
                      <Metric
                        label="Consumo da Casa"
                        value={money(
                          totals(state, month, undefined, true).consumption,
                        )}
                        hint="Uma compra, uma única despesa"
                      />
                      <Metric
                        label="Minha contribuição"
                        value={money(goal.actual)}
                        hint="Gastos efetivos sem crédito"
                        positive
                      />
                      <Metric
                        label="Minha meta flexível"
                        value={money(goal.goal)}
                        hint="Não gera saldo devedor"
                      />
                    </div>
                    <section className="panel">
                      {heading(
                        "Contribuir do seu jeito",
                        "VA, VR ou dinheiro. A diferença para a meta nunca é uma dívida.",
                        <button
                          className="secondary"
                          onClick={() => setForm("goal")}
                        >
                          Ajustar minha meta
                        </button>,
                      )}
                      <p>
                        Realizado: {money(goal.actual)} · Falta:{" "}
                        {money(goal.missing)} · Acima: {money(goal.above)}
                      </p>
                      <h3>Realizado por pessoa</h3>
                      <div className="entry-list">
                        {state.profiles
                          .filter((p) => p.active)
                          .map((p) => (
                            <div className="entry-row" key={p.id}>
                              <span className="entry-info">{p.name}</span>
                              <strong>
                                {money(contribution(state, p.id, month).actual)}
                              </strong>
                            </div>
                          ))}
                      </div>
                    </section>
                    <Settlements />
                    <section className="panel">
                      {heading(
                        "Despesas compartilhadas",
                        "Sem revelar os saldos privados dos familiares.",
                      )}
                      <div className="entry-list">
                        {state.entries
                          .filter(
                            (e) =>
                              e.house &&
                              !e.voided &&
                              e.occurred_on.startsWith(month),
                          )
                          .map((e) => (
                            <div className="entry-row" key={e.id}>
                              <div className="entry-info">
                                <strong>{e.description}</strong>
                                <small>
                                  {e.category} · {e.occurred_on}
                                </small>
                              </div>
                              <strong>{money(e.amount)}</strong>
                            </div>
                          ))}
                      </div>
                    </section>
                  </>
                }
              />
              <Route
                path="/contas"
                element={
                  <>
                    <section className="panel">
                      {heading(
                        "Contas e benefícios",
                        "Saldos registrados, sujeitos à sua conferência.",
                        <button
                          className="secondary"
                          onClick={() => setForm("account")}
                        >
                          <Plus size={16} /> Adicionar conta
                        </button>,
                      )}
                      <div className="account-grid">
                        {accounts.length ? (
                          accounts.map((a) => (
                            <article className="account-card" key={a.id}>
                              <Wallet />
                              <Badge>
                                {a.kind === "bank" ? "Conta bancária" : a.kind}
                              </Badge>
                              <h3>{a.name}</h3>
                              <strong>{money(balance(a, state))}</strong>
                              <small>
                                Saldo de abertura em {a.cutoff} · a conferir
                              </small>
                            </article>
                          ))
                        ) : (
                          <Empty>
                            Cadastre uma conta com saldo inicial e data de
                            corte. Você pode começar com valor estimado.
                          </Empty>
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      {heading(
                        "Cartões de crédito",
                        "Titular, consumidor e pagador podem ser pessoas diferentes.",
                        <button
                          className="secondary"
                          onClick={() => setForm("card")}
                        >
                          Adicionar cartão
                        </button>,
                      )}
                      {state.cards.map((c) => (
                        <article className="card-detail" key={c.id}>
                          <CreditCard />
                          <div>
                            <h3>{c.name}</h3>
                            <p>
                              Fecha dia {c.closing} · Vence dia {c.due}
                            </p>
                            <small>
                              {c.owner_id === user.id
                                ? "Você é titular"
                                : "Você é usuário autorizado"}{" "}
                              · {c.authorized.length} autorização(ões)
                            </small>
                            {c.owner_id === user.id && (
                              <button
                                className="text-button"
                                onClick={() => setForm(`permission:${c.id}`)}
                              >
                                Gerenciar autorização
                              </button>
                            )}
                            <div className="statement-grid">
                              {[
                                ...new Set(
                                  state.obligations
                                    .filter((o) => o.card_id === c.id)
                                    .map((o) => o.due_on),
                                ),
                              ]
                                .sort()
                                .map((due) => {
                                  const lines = state.obligations.filter(
                                    (o) =>
                                      o.card_id === c.id && o.due_on === due,
                                  );
                                  const total = lines.reduce(
                                    (n, o) => n + o.amount,
                                    0,
                                  );
                                  const left = lines.reduce(
                                    (n, o) => n + remaining(o, state.payments),
                                    0,
                                  );
                                  return (
                                    <div key={due}>
                                      <strong>
                                        {c.owner_id === user.id
                                          ? "Fatura integral"
                                          : "Suas parcelas"}{" "}
                                        · {due}
                                      </strong>
                                      <span>Total: {money(total)}</span>
                                      <span>
                                        Pago ao banco:{" "}
                                        {money(
                                          lines.reduce(
                                            (n, o) =>
                                              n +
                                              o.confirmed +
                                              state.payments
                                                .filter(
                                                  (p) =>
                                                    p.obligation_id === o.id &&
                                                    !p.reversed_on,
                                                )
                                                .reduce(
                                                  (v, p) => v + p.amount,
                                                  0,
                                                ),
                                            0,
                                          ),
                                        )}
                                      </span>
                                      <b>Em aberto: {money(left)}</b>
                                      {lines.some((o) => o.replaced_by) && (
                                        <Badge>
                                          Saldo transportado / renegociado · não
                                          é quitação
                                        </Badge>
                                      )}
                                      <small>
                                        Acertos Pix são acompanhados
                                        separadamente abaixo.
                                      </small>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </article>
                      ))}
                    </section>
                    <Settlements />
                  </>
                }
              />
              <Route
                path="/planejamento"
                element={
                  <>
                    <section className="panel">
                      {heading(
                        "Empréstimos e parcelas",
                        "Preservamos o histórico e destacamos o que ainda precisa ser conferido.",
                        <button
                          className="secondary"
                          onClick={() => setForm("loan")}
                        >
                          Cadastrar empréstimo
                        </button>,
                      )}
                      {state.plans.length ? (
                        state.plans.map((p) => (
                          <details className="plan" key={p.id}>
                            <summary>
                              <span>
                                <strong>{p.description}</strong>
                                <small>
                                  {p.count} × {money(p.amount)} · Primeiro
                                  vencimento: {p.first_due}
                                </small>
                              </span>
                              <ChevronRight size={18} />
                            </summary>
                            <p>
                              Última informada na abertura: {p.last_paid}/
                              {p.count}
                              {p.last_paid_on
                                ? ` em ${p.last_paid_on}`
                                : ""}.{" "}
                              {p.history_confirmed
                                ? "Histórico anterior confirmado."
                                : "Parcelas anteriores permanecem a conferir."}
                            </p>
                            <p>
                              Maior número quitado:{" "}
                              {loanSummary(p, state).highestPaid}/{p.count}.
                              Próxima obrigação ainda aberta:{" "}
                              {loanSummary(p, state).earliestOpen?.number ??
                                "nenhuma"}{" "}
                              ·{" "}
                              {loanSummary(p, state).earliestOpen?.due_on ??
                                "—"}
                              .
                            </p>
                            <p>
                              Último vencimento contratual:{" "}
                              {addMonths(p.first_due, p.count - 1)}. Soma em
                              aberto:{" "}
                              {money(
                                state.obligations
                                  .filter((o) => o.plan_id === p.id)
                                  .reduce(
                                    (n, o) => n + remaining(o, state.payments),
                                    0,
                                  ),
                              )}
                              . Não equivale a saldo para quitação antecipada.
                            </p>
                            <button
                              className="secondary"
                              onClick={() => setForm(`replace_plan:${p.id}`)}
                            >
                              Renegociar saldo / registrar cotação de quitação
                            </button>
                            <div className="installments">
                              {state.obligations
                                .filter((o) => o.plan_id === p.id)
                                .map((o) => (
                                  <div key={o.id}>
                                    <b>
                                      {o.number}/{p.count}
                                    </b>
                                    <span>{o.due_on}</span>
                                    <strong>
                                      {money(remaining(o, state.payments))}
                                    </strong>
                                    <small>{status(o, state.payments)}</small>
                                    {remaining(o, state.payments) > 0 && (
                                      <button
                                        onClick={() => setForm(`pay:${o.id}`)}
                                      >
                                        Pagar
                                      </button>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </details>
                        ))
                      ) : (
                        <Empty>
                          Tem uma dívida em andamento? Cadastre a primeira data,
                          o total de parcelas e somente os pagamentos
                          confirmados.
                        </Empty>
                      )}
                    </section>
                    <section className="panel">
                      {heading(
                        "Todas as obrigações em aberto",
                        "Vencimentos antigos permanecem nas datas originais. Pix e pagamento de fatura são eventos separados.",
                      )}
                      {obligationList()}
                      <details>
                        <summary>Ajustar ou renegociar uma obrigação</summary>
                        {obligations
                          .filter((o) => o.owner_id === user.id)
                          .map((o) => (
                            <div className="entry-row" key={o.id}>
                              <span className="entry-info">
                                {o.description} · {o.due_on}
                              </span>
                              <button
                                className="text-button"
                                onClick={() => setForm(`adjust_due:${o.id}`)}
                              >
                                Conferir / ajustar
                              </button>
                              <button
                                className="text-button"
                                onClick={() => setForm(`replace:${o.id}`)}
                              >
                                Renegociar
                              </button>
                              <button
                                className="text-button"
                                onClick={() => setForm(`history:${o.id}`)}
                              >
                                Histórico
                              </button>
                            </div>
                          ))}
                      </details>
                    </section>
                    <section className="panel">
                      {heading(
                        "Fluxo de pagamentos",
                        "Saídas efetivas na data real, sem gerar novo consumo.",
                      )}
                      <div className="entry-list">
                        {state.payments.length ? (
                          state.payments.map((p) => (
                            <div className="entry-row" key={p.id}>
                              <div className="entry-info">
                                <strong>
                                  {
                                    state.obligations.find(
                                      (o) => o.id === p.obligation_id,
                                    )?.description
                                  }
                                </strong>
                                <small>Pago em {p.paid_on}</small>
                              </div>
                              <b>{money(p.amount)}</b>
                              {p.reversed_on ? (
                                <Badge>Estornado em {p.reversed_on}</Badge>
                              ) : (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    setForm(`reverse_payment:${p.id}`)
                                  }
                                >
                                  Estornar
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <Empty>
                            Nenhum pagamento registrado nesta sessão.
                          </Empty>
                        )}
                      </div>
                    </section>
                  </>
                }
              />
              <Route path="/relatorios" element={<Reports />} />
              <Route
                path="/configuracoes"
                element={
                  <section className="panel">
                    {heading(
                      "Seu espaço, com segurança",
                      "Configuração e continuidade.",
                    )}
                    <h3>Primeiros passos</h3>
                    <ol>
                      <li>Cadastre sua conta e a data inicial do controle.</li>
                      <li>
                        Registre salário recebido; previsões não são entradas
                        confirmadas.
                      </li>
                      <li>Adicione cartões e benefícios VA/VR.</li>
                      <li>
                        Cadastre empréstimos com a primeira data, N total,
                        última paga e data do pagamento. Confirme o histórico
                        somente se o conferiu.
                      </li>
                      <li>Combine uma meta flexível para a Casa.</li>
                    </ol>
                    {state.profiles.find((p) => p.id === user.id)?.role ===
                      "admin" && (
                      <>
                        <h3>Convites e recuperação de acesso</h3>
                        <p>
                          Compartilhe o código individual por um canal privado.
                          Ele só aparece nesta tela e expira automaticamente.
                        </p>
                        <button
                          className="secondary"
                          onClick={() => void createInvite()}
                        >
                          Criar convite individual
                        </button>
                        <Field label="Recuperar acesso de um membro">
                          <select id="reset-member">
                            <option value="">Selecione um membro</option>
                            {state.profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <button
                          className="secondary"
                          onClick={() => {
                            const member = (
                              document.getElementById(
                                "reset-member",
                              ) as HTMLSelectElement
                            ).value;
                            if (member) void createInvite(member);
                          }}
                        >
                          Gerar código de recuperação
                        </button>
                        {invite && (
                          <p role="status" className="invite-code">
                            Código privado (uso único): <code>{invite}</code>
                            <button onClick={() => setInvite("")}>
                              Ocultar
                            </button>
                          </p>
                        )}
                      </>
                    )}
                    <h3>Categorias e subcategorias</h3>
                    <button
                      className="secondary"
                      onClick={() => setForm("category")}
                    >
                      Criar categoria
                    </button>
                    <div className="category-settings">
                      {[
                        ...new Set([
                          ...categories,
                          ...state.categories.map((c) => c.name),
                        ]),
                      ].map((name) => {
                        const cat = state.categories.find(
                          (c) => c.owner_id === user.id && c.name === name,
                        );
                        return (
                          <div className="entry-row" key={name}>
                            <span className="entry-info">{name}</span>
                            {cat && (
                              <button
                                className="text-button"
                                onClick={() => setForm(`category:${cat.id}`)}
                              >
                                Editar
                              </button>
                            )}
                            <button
                              className="text-button"
                              onClick={() =>
                                void execute("category", {
                                  id: cat?.id ?? id(),
                                  name,
                                  active: cat ? !cat.active : false,
                                  version: cat?.version ?? 0,
                                  parent_id: cat?.parent_id ?? null,
                                })
                              }
                            >
                              {cat && !cat.active ? "Reativar" : "Desativar"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <h3>Privacidade e exportação</h3>
                    <p>
                      Sua exportação contém somente registros que sua sessão
                      pode consultar. Guarde o arquivo em local privado. Uma
                      exportação não substitui um backup do banco.
                    </p>
                    <button className="secondary" onClick={exportData}>
                      <Download size={17} /> Exportar JSON privado
                    </button>
                    <div className="divider" />
                    <p>
                      Versão de desenvolvimento. Acesso por convite depende da
                      configuração do servidor. Consulte os guias do repositório
                      antes de utilizar dados reais.
                    </p>
                    <button className="secondary" onClick={() => void logout()}>
                      <LogOut size={17} /> Sair e limpar sessão
                    </button>
                  </section>
                }
              />
              <Route
                path="*"
                element={
                  <Empty>
                    Página não encontrada. Use a navegação para continuar.
                  </Empty>
                }
              />
            </Routes>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegação no celular">
        {navigation.slice(0, 3).map(([p, l, Icon]) => (
          <NavLink key={p} to={p} end={p === "/"}>
            <Icon size={21} />
            <span>{l}</span>
          </NavLink>
        ))}
        <NavLink to="/planejamento">
          <ChartNoAxesCombined size={21} />
          <span>Planejar</span>
        </NavLink>
        <button onClick={() => setMenu(!menu)}>
          <Menu size={21} />
          <span>Mais</span>
        </button>
      </nav>
      <dialog
        aria-labelledby="financial-dialog-title"
        ref={dialogRef}
        onCancel={() => setForm("")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setForm("");
        }}
      >
        <div className="dialog-heading">
          <h2 id="financial-dialog-title">
            {form === "choose"
              ? "O que deseja adicionar?"
              : formTitle[formType]}
          </h2>
          <button
            className="icon-button"
            aria-label="Fechar formulário"
            onClick={() => setForm("")}
          >
            <X />
          </button>
        </div>
        {form === "choose" ? (
          <div className="action-grid">
            {[
              ["expense", "Despesa", "Uma compra ou gasto do dia a dia"],
              ["income", "Receita", "Salário ou entrada extra recebida"],
              ["benefit", "Recarga VA/VR", "Benefício separado do salário"],
              [
                "account",
                "Conta ou benefício",
                "Saldo inicial e data de referência",
              ],
              ["card", "Cartão de crédito", "Fechamento e vencimento"],
              [
                "loan",
                "Empréstimo em andamento",
                "Calendário e histórico a conferir",
              ],
              [
                "recurrence",
                "Conta recorrente",
                "Projeção mensal com valor fixo ou estimado",
              ],
              [
                "transfer",
                "Transferência entre minhas contas",
                "Sem criar receita ou consumo",
              ],
              [
                "reconcile",
                "Conferir saldo",
                "Ajuste auditado com justificativa",
              ],
              [
                "salary",
                "Referência de salário",
                "Planejar sem criar renda confirmada",
              ],
              [
                "loan_received",
                "Empréstimo recebido",
                "Entrada de crédito, separada de salário",
              ],
            ].map(([key, label, help]) => (
              <button
                key={key}
                onClick={() => {
                  setError("");
                  setForm(key);
                }}
              >
                <Plus size={19} />
                <span>
                  <strong>{label}</strong>
                  <small>{help}</small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} key={form}>
            {[
              "expense",
              "income",
              "benefit",
              "account",
              "card",
              "loan",
              "recurrence",
              "replace",
              "loan_received",
              "category",
            ].includes(formType) && (
              <Field label="Descrição / apelido">
                <input
                  name="description"
                  required
                  maxLength={formType === "category" ? 60 : 120}
                  defaultValue={
                    form.startsWith("category:")
                      ? state.categories.find((c) => c.id === form.slice(9))
                          ?.name
                      : undefined
                  }
                  placeholder="Ex.: mercado da semana"
                />
              </Field>
            )}
            {![
              "card",
              "replace",
              "confirm",
              "permission",
              "reverse_payment",
              "category",
              "reject",
              "reverse_settlement",
            ].includes(formType) && (
              <Field
                label={
                  formType === "account"
                    ? "Saldo inicial (R$)"
                    : formType === "loan"
                      ? "Valor de cada parcela (R$)"
                      : "Valor (R$)"
                }
              >
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder="0,00"
                  pattern="[0-9]+([,.][0-9]{1,2})?"
                />
              </Field>
            )}
            {!["goal", "card", "permission", "salary", "category"].includes(
              formType,
            ) && (
              <Field
                label={
                  formType === "loan"
                    ? "Data do PRIMEIRO vencimento"
                    : formType === "replace"
                      ? "Data do primeiro novo vencimento"
                      : formType === "account"
                        ? "Data de corte do saldo"
                        : "Data efetiva da operação"
                }
              >
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={today()}
                  max={
                    ["loan", "recurrence", "replace", "adjust_due"].includes(
                      formType,
                    )
                      ? undefined
                      : today()
                  }
                />
              </Field>
            )}
            {["account", "card"].includes(formType) && (
              <Field label="Instituição">
                <select name="institution">
                  {institutions.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </Field>
            )}
            {formType === "account" && (
              <Field label="Tipo de conta">
                <select name="kind">
                  <option value="bank">Conta bancária</option>
                  <option value="cash">Dinheiro físico</option>
                  <option>VA</option>
                  <option>VR</option>
                </select>
              </Field>
            )}
            {formType === "card" && (
              <>
                <Field label="Dia de fechamento">
                  <input
                    name="closing"
                    type="number"
                    min={1}
                    max={31}
                    required
                    defaultValue={5}
                  />
                </Field>
                <Field label="Dia de vencimento">
                  <input
                    name="due"
                    type="number"
                    min={1}
                    max={31}
                    required
                    defaultValue={15}
                  />
                </Field>
                <p className="muted">
                  Depois de salvar, use “Gerenciar autorização” para permitir
                  lançamentos por membros da Casa. Não informe números ou
                  códigos do cartão.
                </p>
              </>
            )}
            {[
              "expense",
              "income",
              "benefit",
              "pay",
              "transfer",
              "reconcile",
              "send",
              "confirm",
              "loan_received",
              "history",
            ].includes(formType) && (
              <Field label="Conta de origem / destino">
                <select name="account" required>
                  {accounts
                    .filter(
                      (a) =>
                        formType !== "benefit" || ["VA", "VR"].includes(a.kind),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {formType === "expense" && (
              <>
                <Field label="Categoria">
                  <select name="category">
                    {availableCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ou compra no cartão (não debita conta)">
                  <select name="card">
                    <option value="">Não · pagamento em conta/benefício</option>
                    {state.cards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantidade de parcelas no cartão (total contratado dividido em N)">
                  <input
                    name="installments"
                    type="number"
                    min={1}
                    max={600}
                    defaultValue={1}
                  />
                </Field>
                <details>
                  <summary>Consumidor e responsável financeiro</summary>
                  <Field label="Beneficiário (opcional)">
                    <select name="beneficiary">
                      <option value="">Não definido</option>
                      {state.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tags separadas por vírgulas">
                    <input
                      name="tags"
                      maxLength={250}
                      placeholder="Ex.: escola, viagem"
                    />
                  </Field>
                  <Field label="Quem consumiu (em cartão do qual você é titular)">
                    <select name="consumer">
                      <option value={user.id}>Eu</option>
                      {state.profiles
                        .filter((p) => p.id !== user.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Responsável financeiro (opcional)">
                    <select name="responsible">
                      <option value="">Ainda não definido</option>
                      {state.profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </details>
                <details>
                  <summary>Dividir entre dois meios de pagamento</summary>
                  <Field label="Segundo meio">
                    <select name="second_account">
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Valor pago no segundo meio (R$)">
                    <input
                      name="second_amount"
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </Field>
                </details>
                <label className="checkbox">
                  <input name="house" type="checkbox" /> Esta despesa é da Casa
                </label>
                <details>
                  <summary>Compra com parte pessoal e parte da Casa</summary>
                  <Field label="Somente a parte da Casa (R$)">
                    <input
                      name="house_part"
                      inputMode="decimal"
                      placeholder="Deixe em branco se não dividir"
                    />
                  </Field>
                  <Field label="Descrição visível à Casa">
                    <input
                      name="house_description"
                      maxLength={120}
                      placeholder="Parte compartilhada da compra"
                    />
                  </Field>
                  <Field label="Categoria da parte da Casa">
                    <select name="house_category">
                      {availableCategories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <p className="muted">
                    A parte pessoal fica privada. Os meios de pagamento são
                    divididos proporcionalmente, em centavos, entre as duas
                    partes.
                  </p>
                </details>
              </>
            )}
            {formType === "loan" && (
              <>
                <Field label="Quantidade TOTAL de parcelas">
                  <input
                    name="count"
                    type="number"
                    min={1}
                    max={600}
                    required
                    defaultValue={10}
                  />
                </Field>
                <Field label="Número da última parcela realmente paga (0 se nenhuma)">
                  <input
                    name="last_paid"
                    type="number"
                    min={0}
                    max={600}
                    defaultValue={0}
                    required
                  />
                </Field>
                <Field label="Data efetiva desse pagamento (obrigatória se informou parcela paga)">
                  <input name="paid_on" type="date" max={today()} />
                </Field>
                <label className="checkbox">
                  <input type="checkbox" name="history" /> Conferi e confirmo
                  TODAS as parcelas anteriores à última paga
                </label>
                <p className="muted">
                  Sem essa confirmação, o histórico fica a conferir. Não serão
                  criadas saídas bancárias antigas.
                </p>
              </>
            )}
            {formType === "category" && (
              <Field label="Categoria principal (opcional)">
                <select
                  name="parent"
                  defaultValue={
                    state.categories.find((c) => c.id === form.slice(9))
                      ?.parent_id ?? ""
                  }
                >
                  <option value="">Sem categoria principal</option>
                  {state.categories
                    .filter((c) => c.active && !c.parent_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {formType === "loan_received" && (
              <>
                <Field label="Contrato de empréstimo vinculado">
                  <select name="loan_id" required>
                    <option value="">
                      Selecione um contrato já cadastrado
                    </option>
                    {state.plans
                      .filter((p) => p.owner_id === user.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.description}
                        </option>
                      ))}
                  </select>
                </Field>
                <p className="muted">
                  Cadastre primeiro o contrato em Planejamento. O recebimento
                  entra no caixa, enquanto as parcelas já registradas
                  representam o passivo; não é salário.
                </p>
              </>
            )}
            {formType === "income" && (
              <Field label="Tipo de receita">
                <select name="income_type">
                  <option value="salary">Salário efetivamente recebido</option>
                  <option value="extra">Renda extra / bônus</option>
                </select>
              </Field>
            )}
            {formType === "salary" && (
              <>
                <Field label="Dia provável do recebimento">
                  <input
                    type="number"
                    name="payday"
                    min={1}
                    max={31}
                    required
                    defaultValue={5}
                  />
                </Field>
                <p className="muted">
                  Esta referência é uma previsão. Não cria entrada em conta;
                  salário recebido substitui a previsão do mês e extras ficam
                  separados.
                </p>
              </>
            )}
            {formType === "permission" && (
              <>
                <Field label="Membro da Casa">
                  <select name="member">
                    {state.profiles
                      .filter((p) => p.id !== user.id && p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <label className="checkbox">
                  <input type="checkbox" name="allowed" defaultChecked />{" "}
                  Autorizar novos lançamentos neste cartão
                </label>
                <p className="muted">
                  Desmarque para revogar. O membro não verá suas compras
                  privadas; o titular verá a fatura integral.
                </p>
              </>
            )}
            {formType === "transfer" && (
              <Field label="Conta de destino">
                <select name="destination" required>
                  {accounts
                    .filter((a) => !["VA", "VR"].includes(a.kind))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            {[
              "reconcile",
              "adjust_due",
              "history",
              "reverse_payment",
              "reject",
              "reverse_settlement",
            ].includes(formType) && (
              <Field label="Justificativa da conferência/alteração">
                <input name="reason" minLength={5} required maxLength={250} />
              </Field>
            )}
            {formType === "reconcile" && (
              <p className="muted">
                Informe o SALDO TOTAL conferido, não a diferença. O ajuste será
                registrado separadamente, sem criar receita.
              </p>
            )}
            {formType === "recurrence" && (
              <>
                <label className="checkbox">
                  <input type="checkbox" name="house" /> Conta da Casa
                </label>
                <label className="checkbox">
                  <input type="checkbox" name="variable" /> Valor variável ·
                  previsão a conferir
                </label>
                <p className="muted">
                  Serão criadas 12 ocorrências mensais. Confirme valores
                  variáveis antes do pagamento.
                </p>
              </>
            )}
            {formType === "replace" && (
              <>
                <Field label="Data do acordo confirmado">
                  <input
                    name="occurred_on"
                    type="date"
                    required
                    max={today()}
                    defaultValue={today()}
                  />
                </Field>
                <Field label="Quantidade de novas parcelas">
                  <input
                    type="number"
                    name="count"
                    min={1}
                    max={600}
                    required
                    defaultValue={1}
                  />
                </Field>
                <Field label="Encargos totais CONFIRMADOS pelo banco (R$)">
                  <input
                    name="fee"
                    inputMode="decimal"
                    required
                    defaultValue="0"
                  />
                </Field>
                <Field label="Saldo para quitação informado pelo credor (opcional, R$)">
                  <input name="quote" inputMode="decimal" />
                </Field>
                <p className="muted">
                  O saldo em aberto será transferido às novas obrigações. A
                  origem permanece no histórico e deixa de somar no exigível.
                  Não informe juros hipotéticos.
                </p>
              </>
            )}
            {formType === "goal" && (
              <p className="muted">
                Meta de {month}. A diferença nunca cria dívida.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Salvando…" : "Salvar com segurança"}
            </button>
          </form>
        )}
      </dialog>
    </div>
  );
  async function createInvite(reset_id?: string) {
    if (demo) {
      setNotice(
        "Convites reais exigem Supabase configurado. A demonstração não cria identidades.",
      );
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase!.functions.invoke("identity", {
        body: { action: "create_invite", reset_id },
      });
      if (error || !data?.token)
        throw Error(
          "Não foi possível criar o convite. Verifique sua permissão.",
        );
      setInvite(data.token);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  function Settlements() {
    return (
      <section className="panel">
        {heading(
          "Acertos familiares",
          "Informar Pix, confirmar recebimento e pagar a fatura são etapas diferentes.",
        )}
        {state.settlements.length ? (
          state.settlements.map((x) => (
            <article className="settlement" key={x.id}>
              <h3>{x.description}</h3>
              <div className="metrics compact">
                <Metric
                  label="A acertar"
                  value={money(x.amount - x.confirmed)}
                  hint="Somente confirmações reduzem o saldo"
                />
                <Metric
                  label="Enviado, a confirmar"
                  value={money(x.sent)}
                  hint={x.sent_on ?? "Sem envio informado"}
                />
                <Metric
                  label="Confirmado recebido"
                  value={money(x.confirmed)}
                  hint="Não é salário nem pagamento da fatura"
                />
              </div>
              {x.creditor_id === user!.id && x.sent > 0 && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setForm(`confirm:${x.id}`)}
                  >
                    Confirmar recebimento
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setForm(`reject:${x.id}`)}
                  >
                    Rejeitar envio
                  </button>
                </>
              )}
              {x.debtor_id === user!.id && (
                <button
                  className="secondary"
                  onClick={() => setForm(`send:${x.id}`)}
                >
                  Informar Pix enviado
                </button>
              )}
              <details>
                <summary>Histórico dos envios</summary>
                {state.settlement_transfers
                  .filter((t) => t.settlement_id === x.id)
                  .map((t) => (
                    <div className="entry-row" key={t.id}>
                      <div className="entry-info">
                        <strong>
                          {money(t.amount)} · enviado em {t.sent_on}
                        </strong>
                        <small>
                          {t.rejected_on
                            ? `Rejeitado em ${t.rejected_on}`
                            : t.reversed_on
                              ? `Confirmação corrigida em ${t.reversed_on}`
                              : t.confirmed_on
                                ? `Recebido em ${t.confirmed_on}`
                                : "Aguardando confirmação"}
                        </small>
                      </div>
                      {x.creditor_id === user!.id &&
                        t.confirmed_on &&
                        !t.reversed_on && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setForm(`reverse_settlement:${x.id}:${t.id}`)
                            }
                          >
                            Corrigir confirmação
                          </button>
                        )}
                    </div>
                  ))}
              </details>
            </article>
          ))
        ) : (
          <Empty>
            Nenhum acerto familiar. Despesas da Casa não geram reembolso
            automaticamente.
          </Empty>
        )}
      </section>
    );
  }
  function Reports() {
    const [base, setBase] = useState(
      String(
        (state.income_settings.find((x) => x.owner_id === user!.id)?.base ??
          0) / 100,
      ),
    );
    const [scenario, setScenario] = useState("manual");
    let salary = 0;
    try {
      salary = parseMoney(base);
    } catch {
      /* Preview remains zero while editing. */
    }
    const reference =
      state.income_settings.find((x) => x.owner_id === user!.id)?.base ?? 0;
    if (scenario === "base") salary = reference;
    if (scenario === "history") {
      const monthly = new Map<string, number>();
      state.entries
        .filter(
          (e) =>
            e.owner_id === user!.id &&
            e.kind === "income" &&
            e.income_type !== "extra" &&
            !e.voided,
        )
        .forEach((e) =>
          monthly.set(
            e.occurred_on.slice(0, 7),
            (monthly.get(e.occurred_on.slice(0, 7)) ?? 0) + e.amount,
          ),
        );
      salary = conservativeSalary(
        [...monthly.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, amount]) => amount),
        reference,
      );
    }
    const rows = forecast(
      {
        ...state,
        obligations: state.obligations.filter((o) => o.owner_id === user!.id),
        entries: state.entries.filter((e) => e.owner_id === user!.id),
      },
      month,
      salary,
    );
    return (
      <>
        <div className="metrics compact">
          {[30, 60, 90].map((days) => {
            const end = new Date(`${today()}T12:00:00Z`);
            end.setUTCDate(end.getUTCDate() + days);
            const through = end.toISOString().slice(0, 10);
            const due = state.obligations
              .filter((o) => o.owner_id === user!.id && o.due_on <= through)
              .reduce((n, o) => n + remaining(o, state.payments), 0);
            return (
              <Metric
                key={days}
                label={`Compromissos em até ${days} dias`}
                value={money(due)}
                hint="Inclui vencidos e histórico a conferir · não é saldo bancário"
              />
            );
          })}
        </div>
        <section className="panel">
          {heading(
            "Consumo por categoria",
            "Pagamentos de fatura e empréstimos não duplicam as compras.",
          )}
          <div className="category-bars">
            {[
              ...new Set([
                ...categories,
                ...state.entries.map((e) => e.category),
              ]),
            ]
              .map((c) => ({
                category: c,
                amount: entries
                  .filter((e) => e.kind === "expense" && e.category === c)
                  .reduce((n, e) => n + e.amount, 0),
              }))
              .filter((c) => c.amount)
              .map((c) => (
                <div key={c.category}>
                  <span>{c.category}</span>
                  <progress
                    aria-label={c.category}
                    value={c.amount}
                    max={t.consumption || 1}
                  />
                  <b>{money(c.amount)}</b>
                </div>
              ))}
          </div>
        </section>
        <section className="panel">
          {heading(
            "Planejamento de 12 meses",
            "Simulação manual. Não representa renda ou saldo bancário confirmado.",
          )}
          <Field label="Cenário de renda">
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="manual">Simulação manual</option>
              <option value="base">Referência conservadora cadastrada</option>
              <option value="history">
                Histórico de salários · mediana conservadora de até 6 meses
              </option>
            </select>
          </Field>
          <p className="muted">
            Histórico precisa de ao menos 3 meses; abaixo disso usa a referência
            cadastrada, sem tratar extras como salário.
          </p>
          <Field label="Salário líquido mensal previsto (R$)">
            <input
              inputMode="decimal"
              value={base}
              onChange={(e) => setBase(e.target.value)}
            />
          </Field>
          <div className="table-scroll">
            <table>
              <caption>
                Renda e obrigações pessoais · pendências antigas são mostradas
                separadamente
              </caption>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Renda</th>
                  <th>Obrigações</th>
                  <th>Diferença</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month}>
                    <th>{r.month}</th>
                    <td>{money(r.income)}</td>
                    <td>{money(r.due)}</td>
                    <td>{money(r.free)}</td>
                    <td>
                      {r.estimated
                        ? scenario === "history"
                          ? "Histórico / referência"
                          : scenario === "base"
                            ? "Referência cadastrada"
                            : "Estimativa manual"
                        : "Recebido"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Pendências anteriores ao período:{" "}
            {money(
              obligations
                .filter((o) => o.due_on < `${month}-01`)
                .reduce((n, o) => n + remaining(o, state.payments), 0),
            )}
            . Devem ser somadas à necessidade de caixa; não foram recriadas no
            mês.
          </p>
        </section>
      </>
    );
  }
}
