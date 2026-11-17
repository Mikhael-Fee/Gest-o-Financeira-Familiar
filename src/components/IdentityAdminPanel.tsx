import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../data/store";
import type { State } from "../domain/finance";
import { Field } from "./ui";

type Invitation = {
  id: string;
  expires_at: string;
  used_at: string | null;
  claimed: boolean;
  reset_user: string | null;
  revoked: boolean;
};
export function IdentityAdminPanel({
  userId,
  profiles,
  demo,
  onRefresh,
}: {
  userId: string;
  profiles: State["profiles"];
  demo: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [login, setLogin] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingMember, setPendingMember] = useState<string | null>(null);
  const admin = profiles.find((p) => p.id === userId)?.role === "admin";
  async function call(request: Record<string, unknown>) {
    if (!supabase || demo)
      throw Error("Esta ação exige uma conta autenticada.");
    const { data, error } = await supabase.functions.invoke("identity", {
      body: { action: "manage_identity", request },
    });
    if (error || data?.error)
      throw Error(
        "Não foi possível concluir. Atualize a lista e tente novamente.",
      );
    return data;
  }
  async function load() {
    const self = await call({ action: "self" });
    setLogin(self.username || "");
    if (admin) setInvites((await call({ action: "list" })).invites);
    setCheckedAt(Date.now());
  }
  useEffect(() => {
    let alive = true;
    if (!demo && supabase) {
      void call({ action: "self" })
        .then((data) => {
          if (alive) setLogin(data.username || "");
        })
        .catch(() => {
          if (alive)
            setMessage("Não foi possível carregar seu nome de usuário.");
        });
    }
    return () => {
      alive = false;
    };
    // Session identity determines this private panel's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, demo]);
  async function run(request: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await call({ ...request, key: crypto.randomUUID() });
      await load();
      await onRefresh();
      setPendingMember(null);
      setMessage("Alteração de acesso registrada com segurança.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  }
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run({
      action: "username",
      username: form.get("username"),
      expected_username: login,
    });
  }
  if (demo)
    return (
      <section className="panel">
        <h3>Gerenciar acesso</h3>
        <p>
          A demonstração não cria contas ou convites reais. Entre com uma conta
          autenticada para gerenciar o acesso.
        </p>
      </section>
    );
  return (
    <section className="panel">
      <h3>Seu acesso</h3>
      <p>
        O administrador gerencia acesso e convites. As finanças de cada pessoa
        continuam privadas.
      </p>
      {login && (
        <form onSubmit={rename}>
          <Field label="Novo nome de usuário">
            <input
              name="username"
              required
              pattern="[a-z0-9_]{3,32}"
              minLength={3}
              maxLength={32}
              defaultValue={login}
              key={login}
              autoComplete="username"
            />
          </Field>
          <button className="secondary" disabled={busy}>
            Alterar nome de usuário
          </button>
        </form>
      )}
      {admin && (
        <>
          <h3>Membros da Casa</h3>
          <p>
            Desativar impede novas leituras e operações, revoga sessões
            renováveis e preserva o histórico. Tokens já emitidos podem existir
            por até 15 minutos, mas a RLS bloqueia o membro desativado
            imediatamente.
          </p>
          {profiles
            .filter((p) => p.id !== userId)
            .map((p) => (
              <div className="list-row" key={p.id}>
                <span>
                  {p.name} · {p.active ? "Ativo" : "Desativado"} ·{" "}
                  {p.role === "admin" ? "Administrador" : "Membro"}
                </span>
                {pendingMember === p.id ? (
                  <>
                    <p>
                      Confirma {p.active ? "desativar" : "reativar"} o acesso de{" "}
                      {p.name}?
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run({
                          action: "member_active",
                          id: p.id,
                          active: !p.active,
                          expected_active: p.active,
                        })
                      }
                    >
                      Confirmar alteração de acesso
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setPendingMember(null)}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setPendingMember(p.id)}
                  >
                    {p.active ? "Desativar" : "Reativar"} acesso
                  </button>
                )}
              </div>
            ))}
          <h3>Convites emitidos</h3>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void load()
                .catch(() =>
                  setMessage("Não foi possível atualizar os convites."),
                )
                .finally(() => setBusy(false));
            }}
          >
            Atualizar convites
          </button>
          {invites.map((invite) => (
            <div className="list-row" key={invite.id}>
              <span>
                {invite.reset_user ? "Recuperação" : "Convite"} ·{" "}
                {invite.used_at
                  ? "Utilizado"
                  : invite.revoked
                    ? "Revogado"
                    : invite.claimed
                      ? "Em processamento"
                      : new Date(invite.expires_at).getTime() <= checkedAt
                        ? "Expirado"
                        : "Disponível"}{" "}
                · validade {new Date(invite.expires_at).toLocaleString("pt-BR")}
              </span>
              {!invite.used_at && !invite.revoked && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run({ action: "revoke", id: invite.id })}
                >
                  Revogar convite
                </button>
              )}
            </div>
          ))}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
