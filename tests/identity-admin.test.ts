// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003",
  family = "00000000-0000-4000-8000-000000000010";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const name of [
    "202611120001_foundation.sql",
    "202611120002_identity.sql",
    "202611120003_workflows.sql",
    "202611120004_corrections.sql",
    "202611120005_snapshot.sql",
    "202611120006_categories.sql",
    "202611120007_settlement_corrections.sql",
    "202611120008_loan_receipts.sql",
    "202611120009_effective_dates.sql",
    "202611120010_monthly_income.sql",
    "202611120011_partial_loan_calendar.sql",
    "202611160016_identity_activation.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}`, "utf8"));
  await db.exec(
    `insert into auth.users values('${a}'),('${b}'),('${c}');insert into public.families values('${family}','Fictícia'),('00000000-0000-4000-8000-000000000011','Outra');insert into public.profiles values('${a}','${family}','admin_a','admin',true),('${b}','${family}','member_b','member',true),('${c}','00000000-0000-4000-8000-000000000011','other_c','admin',true);insert into private.username_identities values('admin_a','${a}','a@identity.example.test'),('member_b','${b}','b@identity.example.test'),('other_c','${c}','c@identity.example.test');insert into public.accounts(id,owner_id,name,kind,opening,cutoff) values(gen_random_uuid(),'${b}','Privada B','bank',10000,'2026-11-01');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
async function manage(actor: string, request: Record<string, unknown>) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    "select public.manage_identity($1,$2::jsonb) result",
    [actor, JSON.stringify(request)],
  );
  return result.rows[0].result;
}
async function asUser(id: string, sql: string) {
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
  );
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}
it("ordinary users cannot call privileged identity RPC or manage other members", async () => {
  await expect(
    asUser(a, `select public.manage_identity('${a}','{"action":"list"}')`),
  ).rejects.toThrow(/permission denied/);
  await expect(manage(b, { action: "list" })).rejects.toThrow(/Unauthorized/);
  await expect(
    manage(b, {
      action: "member_active",
      key: crypto.randomUUID(),
      id: a,
      active: false,
      expected_active: true,
    }),
  ).rejects.toThrow(/Unauthorized/);
});
it("invitation metadata excludes digest, and cross-family revocation is denied", async () => {
  const digest = "a".repeat(64);
  await db.query("select public.create_invite($1,$2,null)", [a, digest]);
  const listed = await manage(a, { action: "list" });
  expect(JSON.stringify(listed)).not.toContain(digest);
  expect(JSON.stringify(listed)).not.toContain("token_hash");
  const invite = (listed.invites as { id: string }[])[0];
  await expect(
    manage(c, { action: "revoke", id: invite.id, key: crypto.randomUUID() }),
  ).rejects.toThrow(/Invitation unavailable/);
  await manage(a, {
    action: "revoke",
    id: invite.id,
    key: crypto.randomUUID(),
  });
  await expect(
    db.query("select public.claim_invite($1,false)", [digest]),
  ).rejects.toThrow(/Invalid invitation/);
});
it("deactivation revokes renewable sessions and RLS while preserving private records", async () => {
  const digest = "b".repeat(64);
  await db.query("select public.create_invite($1,$2,$3)", [a, digest, b]);
  await db.exec(`insert into auth.sessions values(gen_random_uuid(),'${b}')`);
  const request = {
    action: "member_active",
    key: crypto.randomUUID(),
    id: b,
    active: false,
    expected_active: true,
  };
  await manage(a, request);
  await manage(a, request);
  expect(
    (await db.query(`select * from auth.sessions where user_id='${b}'`)).rows,
  ).toHaveLength(0);
  expect((await asUser(b, "select * from public.accounts")).rows).toHaveLength(
    0,
  );
  expect(
    (await db.query(`select * from public.accounts where owner_id='${b}'`))
      .rows,
  ).toHaveLength(1);
  await expect(
    db.query("select public.claim_invite($1,true)", [digest]),
  ).rejects.toThrow(/Invalid invitation/);
  await expect(
    manage(a, { ...request, key: crypto.randomUUID() }),
  ).rejects.toThrow(/Member conflict/);
  await expect(manage(a, { ...request, active: true })).rejects.toThrow(
    /Idempotency conflict/,
  );
  await manage(a, {
    action: "member_active",
    key: crypto.randomUUID(),
    id: b,
    active: true,
    expected_active: false,
  });
  expect((await asUser(b, "select * from public.accounts")).rows).toHaveLength(
    1,
  );
});
it("current or last administrator cannot deactivate themselves", async () => {
  await expect(
    manage(a, {
      action: "member_active",
      key: crypto.randomUUID(),
      id: a,
      active: false,
      expected_active: true,
    }),
  ).rejects.toThrow(/Cannot deactivate/);
  await expect(
    manage(a, {
      action: "member_active",
      key: crypto.randomUUID(),
      id: c,
      active: false,
      expected_active: true,
    }),
  ).rejects.toThrow(/Member conflict/);
});
it("username changes are self-owned, unique, version-checked, and audited", async () => {
  expect(await manage(b, { action: "self" })).toEqual({ username: "member_b" });
  await expect(
    manage(b, {
      action: "username",
      key: crypto.randomUUID(),
      username: "admin_a",
      expected_username: "member_b",
    }),
  ).rejects.toThrow(/duplicate/);
  const request = {
    action: "username",
    key: crypto.randomUUID(),
    username: "new_member_b",
    expected_username: "member_b",
  };
  await manage(b, request);
  await manage(b, request);
  expect(await manage(b, { action: "self" })).toEqual({
    username: "new_member_b",
  });
  await expect(
    manage(b, { ...request, key: crypto.randomUUID() }),
  ).rejects.toThrow(/Username conflict/);
  const audits = await db.query(
    "select action from public.audit_logs where action='identity_username'",
  );
  expect(audits.rows).toHaveLength(1);
});
it("recovery invitations remain single use and limited to 20 minutes", async () => {
  const digest = "c".repeat(64);
  await db.query("select public.create_invite($1,$2,$3)", [a, digest, b]);
  expect(
    (
      await db.query<{ ttl: boolean }>(
        "select expires_at<=now()+interval '20 minutes' ttl from private.invites where token_hash=$1",
        [digest],
      )
    ).rows[0].ttl,
  ).toBe(true);
  const claimed = await db.query<{ value: { reset_user: string } }>(
    "select public.claim_invite($1,true) value",
    [digest],
  );
  expect(claimed.rows[0].value.reset_user).toBe(b);
  await expect(
    db.query("select public.claim_invite($1,true)", [digest]),
  ).rejects.toThrow(/Invalid invitation/);
});
