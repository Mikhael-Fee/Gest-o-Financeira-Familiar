import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const origin = Deno.env.get("APP_ORIGIN")!;
const domain = Deno.env.get("AUTH_EMAIL_DOMAIN")!;
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,32}$/);
const password = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v),
    "Senha fraca",
  );
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
Deno.serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (req.headers.get("origin") && req.headers.get("origin") !== origin)
    return reply({ error: "Acesso recusado" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Método inválido" }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: "Solicitação inválida" }, 400);
    const body = JSON.parse(raw);
    // Rate limits persist in PostgreSQL; unknown usernames consume the same budget.
    const login = body.username ? username.parse(body.username) : "";
    const { data: globalAllowed, error: rateError } = await admin.rpc(
      "identity_rate_limit",
      { bucket_key: "identity:global", max_attempts: 300 },
    );
    const { data: allowed } = await admin.rpc("identity_rate_limit", {
      bucket_key: `identity:${await hash(login || req.headers.get("x-forwarded-for") || "anonymous")}`,
      max_attempts: 10,
    });
    if (rateError || !globalAllowed || !allowed)
      return reply({ error: "Tente novamente mais tarde" }, 429);
    if (body.action === "create_invite") {
      const bearer = req.headers.get("authorization")?.replace(/^Bearer /, "");
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(bearer);
      if (error || !user) throw Error();
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const { error: inviteError } = await admin.rpc("create_invite", {
        actor: user.id,
        token_digest: await hash(token),
        reset_id: body.reset_id ?? null,
      });
      if (inviteError) throw Error();
      return reply({
        token,
        expires_in: body.reset_id ? "20 minutos" : "48 horas",
      });
    }
    const auth = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    if (body.action === "login") {
      const secret = z.string().min(1).max(128).parse(body.password);
      const { data: email } = await admin.rpc("identity_lookup", {
        login_name: login,
      });
      // Always call password auth, including unknown identities, with a generic response.
      const { data, error } = await auth.auth.signInWithPassword({
        email: email || `unknown@${domain}`,
        password: secret,
      });
      if (error || !data.session) throw Error();
      return reply({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      });
    }
    if (!["invite", "reset"].includes(body.action)) throw Error();
    const secret = password.parse(body.password);
    const token = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(body.token);
    const digest = await hash(token);
    const reset = body.action === "reset";
    const { data: invitation, error: claimError } = await admin.rpc(
      "claim_invite",
      { token_digest: digest, reset_mode: reset },
    );
    if (claimError || !invitation) throw Error();
    let authId: string;
    let email: string;
    if (reset) {
      authId = invitation.reset_user;
      const { data, error } = await admin.auth.admin.getUserById(authId);
      if (error || !data.user?.email) throw Error();
      email = data.user.email;
      // Disable existing sessions before allowing the new password to be used.
      const { error: updateError } = await admin.auth.admin.updateUserById(
        authId,
        { password: secret },
      );
      if (updateError) throw Error();
      // Supabase access JWTs already issued last until their short configured expiry.
    } else {
      if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw Error();
      email = `member-${crypto.randomUUID()}@${domain}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: secret,
        email_confirm: true,
      });
      if (error || !data.user) throw Error();
      authId = data.user.id;
    }
    const { error: finishError } = await admin.rpc("finish_identity", {
      token_digest: digest,
      auth_id: authId,
      login_name: login,
      tech_email: email,
      reset_mode: reset,
    });
    if (finishError) {
      if (!reset) await admin.auth.admin.deleteUser(authId);
      throw Error();
    }
    const { data, error } = await auth.auth.signInWithPassword({
      email,
      password: secret,
    });
    if (error || !data.session) throw Error();
    return reply({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch {
    return reply(
      {
        error:
          "Não foi possível concluir. Verifique os dados ou solicite novo convite.",
      },
      400,
    );
  }
});
