// Explicit operator action only. Never run as part of setup or CI.
import { createClient } from "@supabase/supabase-js";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_EMAIL_DOMAIN",
  "BOOTSTRAP_USERNAME",
  "BOOTSTRAP_PASSWORD",
];
for (const name of required)
  if (!process.env[name]) throw Error(`Variável ausente: ${name}`);
if (
  !/^[a-z0-9_]{3,32}$/.test(process.env.BOOTSTRAP_USERNAME) ||
  !/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,128}/.test(
    process.env.BOOTSTRAP_PASSWORD,
  )
)
  throw Error("Username ou senha fora da política.");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const email = `member-${crypto.randomUUID()}@${process.env.AUTH_EMAIL_DOMAIN}`;
const { data, error } = await client.auth.admin.createUser({
  email,
  password: process.env.BOOTSTRAP_PASSWORD,
  email_confirm: true,
});
if (error) throw Error("Não foi possível provisionar administrador.");
const { error: setupError } = await client.rpc("bootstrap_identity", {
  auth_id: data.user.id,
  login_name: process.env.BOOTSTRAP_USERNAME,
  tech_email: email,
  family_name: "Minha Casa",
});
if (setupError) {
  await client.auth.admin.deleteUser(data.user.id);
  throw Error("Bootstrap recusado. Verifique se já foi realizado.");
}
console.log("Administrador criado. Nenhuma credencial foi exibida.");
