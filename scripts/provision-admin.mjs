import { TextEncoder } from "node:util";
import { URLSearchParams } from "node:url";
// Explicit operator action. No default password, no credential in output.
// Writes a short-lived activation link to a NEW private file outside checkout.
import { createClient } from "@supabase/supabase-js";
import { open, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { verifyAdminBrowser } from "./verify-admin-browser.mjs";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_EMAIL_DOMAIN",
  "BOOTSTRAP_USERNAME",
  "APP_ORIGIN",
  "ACTIVATION_FILE",
];
for (const name of required)
  if (!process.env[name]) throw Error(`Variável ausente: ${name}`);
const login = process.env.BOOTSTRAP_USERNAME;
const domain = process.env.AUTH_EMAIL_DOMAIN;
if (
  !/^[a-z0-9_]{3,32}$/.test(login) ||
  !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)
)
  throw Error("Identidade inválida.");
const service = new URL(process.env.SUPABASE_URL);
const origin = new URL(process.env.APP_ORIGIN);
const local = ["localhost", "127.0.0.1"].includes(service.hostname);
if (
  !local &&
  (service.origin !== "https://ovoqhnoaigjzihhpdukn.supabase.co" ||
    origin.origin !== "https://entre-nos-homologacao.netlify.app")
)
  throw Error("Projeto fora do escopo autorizado.");
if (!local && domain !== origin.hostname)
  throw Error("Use o domínio técnico controlado desta homologação.");
if (origin.pathname !== "/" || origin.search || origin.hash)
  throw Error("Origem inválida.");
const checkout = await realpath(new URL("..", import.meta.url));
if (!isAbsolute(process.env.ACTIVATION_FILE))
  throw Error("Use caminho absoluto privado fora do checkout.");
const destination = resolve(process.env.ACTIVATION_FILE);
const parent = await realpath(dirname(destination));
const fromCheckout = relative(checkout, parent);
if (
  !fromCheckout ||
  (!fromCheckout.startsWith(`..${sep}`) &&
    fromCheckout !== ".." &&
    !isAbsolute(fromCheckout))
)
  throw Error("Arquivo de ativação deve ficar fora do repositório.");
const output = await open(destination, "wx", 0o600);
const client = createClient(
  service.origin,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
let completed = false;
try {
  // This random password never leaves memory; the owner chooses their own using
  // the same audited single-use recovery flow as ordinary members.
  const temporary = `Aa9_${crypto.randomUUID()}_${crypto.randomUUID()}`;
  const email = `member-${crypto.randomUUID()}@${domain}`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: temporary,
    email_confirm: true,
  });
  if (error || !data.user) throw Error("Provisionamento Auth recusado.");
  const authId = data.user.id;
  const { error: bootstrapError } = await client.rpc("bootstrap_identity", {
    auth_id: authId,
    login_name: login,
    tech_email: email,
    family_name: "Casa de homologação",
  });
  if (bootstrapError) {
    await client.auth.admin.deleteUser(authId);
    throw Error("Bootstrap recusado; não substitua identidades existentes.");
  }
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,role,active")
    .eq("id", authId)
    .single();
  if (profileError || profile?.role !== "admin" || !profile.active)
    throw Error("Perfil administrativo não confirmado.");
  // Remote provisioning only becomes a validated access after a real browser
  // login. Local API integration tests exercise this path independently.
  if (!local) {
    await verifyAdminBrowser({
      origin: origin.origin,
      username: login,
      password: temporary,
    });
    console.log(
      "Login público real, Meu espaço, Casa, Configurações, convite e saída/recarga validados.",
    );
  }
  const { error: invalidateError } = await client.auth.admin.updateUserById(
    authId,
    { password: `Aa9_${crypto.randomUUID()}_${crypto.randomUUID()}` },
  );
  if (invalidateError)
    throw Error(
      "Não foi possível invalidar o acesso temporário de validação. Não entregue o acesso ainda.",
    );
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  const { error: inviteError } = await client.rpc("create_invite", {
    actor: authId,
    token_digest: digest,
    reset_id: authId,
  });
  if (inviteError)
    throw Error(
      "Administrador provisionado, mas ativação indisponível. Emita nova recuperação pelo operador autorizado.",
    );
  const fragment = new URLSearchParams({ activate: token, username: login });
  await output.writeFile(
    `ACESSO PRIVADO — NÃO COMPARTILHAR\n\nValidade: 20 minutos; uso único.\nAbra o endereço abaixo em um dispositivo privado e escolha sua própria senha.\n${origin.origin}/#${fragment}\n\nA senha temporária não é conhecida nem exibida. Se o link expirar, solicite nova ativação ao operador.\n`,
  );
  await output.sync();
  completed = true;
  console.log(
    local
      ? "Bootstrap local confirmado; ativação gravada no arquivo privado solicitado. Não é homologação pública."
      : "Administrador confirmado e login público real validado; ativação gravada no arquivo privado solicitado.",
  );
} finally {
  await output.close();
  if (!completed) await rm(destination, { force: true });
}
