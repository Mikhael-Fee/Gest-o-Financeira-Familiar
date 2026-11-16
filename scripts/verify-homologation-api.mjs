// Explicitly scoped REAL remote integration. Never called by setup, CI or tests.
// Uses only fictitious data. Credentials/fixtures stay private outside checkout.
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";
import assert from "node:assert/strict";

export async function verifyHomologationApi({ url, origin, publicKey, username, password, fixturePath }) {
  if (url !== "https://ovoqhnoaigjzihhpdukn.supabase.co" || origin !== "https://entre-nos-homologacao.netlify.app") throw Error("Homologação fora do projeto autorizado.");
  if (!fixturePath || !isAbsolute(fixturePath)) throw Error("Fixture privada absoluta obrigatória.");
  const checkout = await realpath(new URL("..", import.meta.url));
  const parent = await realpath(dirname(fixturePath));
  const relation = relative(checkout, parent);
  if (!relation || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))) throw Error("Não salve fixture no repositório.");
  let fixture;
  try { fixture = JSON.parse(await readFile(fixturePath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; fixture = { members: [], ids: {}, commands: {}, date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) }; }
  const save = () => writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  const id = name => fixture.ids[name] ||= crypto.randomUUID();
  let step = "login público API";
  const evidence = {};
  const clients = [];
  const publicClient = () => { const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(client); return client; };
  async function authCall(action, body = {}, session) {
    const response = await fetch(`${url}/functions/v1/identity`, { method: "POST", headers: { "Content-Type": "application/json", apikey: publicKey, Origin: origin, ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ action, ...body }) });
    return { status: response.status, data: await response.json() };
  }
  async function authenticated(login, secret) {
    const response = await authCall("login", { username: login, password: secret });
    assert.equal(response.status, 200);
    const client = publicClient();
    const { data, error } = await client.auth.setSession(response.data.session);
    assert.ok(!error && data.user);
    return { client, session: response.data.session, id: data.user.id };
  }
  async function snapshot(client) { const result = await client.rpc("load_finances"); if (result.error) throw result.error; return result.data; }
  async function exec(client, name, type, payload) {
    fixture.commands[name] ||= { key: crypto.randomUUID(), type, payload };
    await save();
    const result = await client.rpc("execute_command", { command: fixture.commands[name] });
    if (result.error) throw result.error;
    return fixture.commands[name].key;
  }
  const openAmount = (state, o) => o.replaced_by ? 0 : Math.max(0, o.amount - o.confirmed - state.payments.filter(p => p.obligation_id === o.id && !p.reversed_on).reduce((sum, p) => sum + p.amount, 0));
  try {
    const a = await authenticated(username, password);
    const initial = await snapshot(a.client);
    assert.equal(initial.profiles.find(p => p.id === a.id).role, "admin");
    step = "três membros convidados reais";
    for (let i = 0; i < 3; i++) {
      if (!fixture.members[i]) { fixture.members[i] = { username: `test_${crypto.randomUUID().slice(0, 8)}`, password: `TestAa9_${crypto.randomUUID()}` }; await save(); }
      const member = fixture.members[i];
      if (!member.joined) {
        const invitation = await authCall("create_invite", {}, a.session);assert.equal(invitation.status, 200);
        const joined = await authCall("invite", { ...member, token: invitation.data.token });assert.equal(joined.status, 200);
        member.joined = true;await save();
        const replay = await authCall("invite", { username: `unused_${crypto.randomUUID().slice(0, 8)}`, password: member.password, token: invitation.data.token });assert.equal(replay.status, 400);
      }
    }
    const b = await authenticated(fixture.members[0].username, fixture.members[0].password);
    const c = await authenticated(fixture.members[1].username, fixture.members[1].password);
    const d = await authenticated(fixture.members[2].username, fixture.members[2].password);
    evidence.four_authenticated_users = true;evidence.invite_only_and_reuse_denied = true;
    const openSignup = await publicClient().auth.signUp({ email: `blocked-${crypto.randomUUID()}@${new URL(origin).hostname}`, password: `TestBb8_${crypto.randomUUID()}` });assert.ok(openSignup.error && !openSignup.data.user);
    step = "contas privadas e GRANTs";
    const accountA = id("bank-a"), accountB = id("bank-b"), walletB = id("va-b");
    const when = fixture.date, month = when.slice(0,7);
    await exec(a.client,"account-a","account",{id:accountA,name:"Conta exclusivamente fictícia A",kind:"bank",opening:1000000,cutoff:when});
    await exec(b.client,"account-b","account",{id:accountB,name:"Conta exclusivamente fictícia B",kind:"bank",opening:1000000,cutoff:when});
    await exec(b.client,"wallet-b","account",{id:walletB,name:"VA exclusivamente fictício B",kind:"VA",opening:50000,cutoff:when});
    for (const who of [a,c,d]) { const hidden=await who.client.from("accounts").select("*").eq("id",accountB);assert.ok(!hidden.error && hidden.data.length===0); }
    const writeDenied=await a.client.from("accounts").update({opening:0}).eq("id",accountB);assert.ok(writeDenied.error);
    evidence.private_accounts_and_direct_write_denial = true;
    step = "cartão compartilhado, Pix e pagamento independente";
    const card=id("card");
    await exec(a.client,"card","card",{id:card,name:"Itaú exclusivamente fictício",closing:5,due:15,authorized:[]});
    await exec(a.client,"card-permission","permission",{id:card,member_id:b.id,allowed:true});
    const common={kind:"expense",occurred_on:when,category:"Outros",house:false,card_id:card,splits:[],installments:1};
    await exec(b.client,"purchase-b","entry",{...common,id:id("purchase-b"),description:"Compra fictícia B",amount:65000,consumer_id:b.id});
    await exec(a.client,"purchase-a","entry",{...common,id:id("purchase-a"),description:"Compra fictícia A",amount:35000,consumer_id:a.id});
    let sb=await snapshot(b.client),sa=await snapshot(a.client);
    assert.equal(sb.entries.filter(e=>e.card_id===card).length,1);assert.equal(sa.entries.filter(e=>e.card_id===card).reduce((n,e)=>n+e.amount,0),100000);
    await exec(b.client,"send-b","send",{id:id("purchase-b"),amount:40000,sent_on:when,account_id:accountB});
    sa=await snapshot(a.client);let settlement=sa.settlements.find(s=>s.id===id("purchase-b"));
    if (!fixture.commands["confirm-b"]) assert.equal(settlement.confirmed,0);
    await exec(a.client,"confirm-b","confirm",{id:settlement.id,version:settlement.version,date:when,account_id:accountA});
    sa=await snapshot(a.client);settlement=sa.settlements.find(s=>s.id===id("purchase-b"));assert.equal(settlement.confirmed,40000);
    const ob=sa.obligations.find(o=>o.id===id("purchase-b")+":1");
    if (!fixture.commands["invoice-pay"]) assert.equal(openAmount(sa,ob),65000);
    await exec(a.client,"invoice-pay","pay",{obligation_id:ob.id,version:ob.version,amount:20000,account_id:accountA,paid_on:when});
    sa=await snapshot(a.client);assert.equal(openAmount(sa,sa.obligations.find(o=>o.id===ob.id)),45000);
    const replayBody=fixture.commands["invoice-pay"];
    await Promise.all([a.client.rpc("execute_command",{command:replayBody}),a.client.rpc("execute_command",{command:replayBody})]).then(results=>results.forEach(x=>assert.ok(!x.error)));
    assert.equal((await a.client.from("payments").select("id").eq("key",replayBody.key)).data.length,1);
    evidence.shared_card_pix_invoice_partial_idempotence = true;
    step="VA e débito, pessoal e Casa";
    await exec(b.client,"house-split","entry",{id:id("house-split"),description:"Mercado exclusivamente fictício",kind:"expense",amount:40000,occurred_on:when,category:"Alimentação",house:true,consumer_id:b.id,card_id:null,splits:[{account_id:walletB,amount:25000},{account_id:accountB,amount:15000}]});
    await exec(b.client,"house-goal","goal",{month,amount:60000});
    sa=await snapshot(a.client);sb=await snapshot(b.client);
    assert.equal(sa.entries.find(e=>e.id===id("house-split")).amount,40000);
    assert.ok(!sa.accounts.some(x=>x.id===walletB));assert.equal(sb.entries.filter(e=>e.id===id("house-split")).length,1);
    evidence.benefit_split_and_house_privacy = true;
    step="empréstimo antigo, nona paga e oitava aberta";
    const plan=id("loan");
    await exec(b.client,"loan","plan",{id:plan,description:"Empréstimo exclusivamente fictício",first_due:"2026-03-20",count:10,amount:20000,last_paid:0,last_paid_known:true,last_paid_on:null,history_confirmed:false,kind:"loan"});
    sb=await snapshot(b.client);const ninth=sb.obligations.find(o=>o.id===plan+":9");
    await exec(b.client,"loan-nine","pay",{obligation_id:ninth.id,version:ninth.version,amount:20000,account_id:accountB,paid_on:when});
    sb=await snapshot(b.client);assert.equal(openAmount(sb,sb.obligations.find(o=>o.id===plan+":9")),0);assert.equal(openAmount(sb,sb.obligations.find(o=>o.id===plan+":8")),20000);
    const partial=id("partial-loan");
    await exec(b.client,"partial-loan","plan",{id:partial,description:"Calendário fictício incompleto",first_due:null,next_due:when,next_number:9,count:10,amount:10000,last_paid:0,last_paid_known:false,last_paid_on:null,history_confirmed:false,kind:"loan"});
    sb=await snapshot(b.client);assert.ok(sb.obligations.filter(o=>o.plan_id===partial && o.number<9).every(o=>o.due_on===null && o.confirmed===0 && o.unknown));
    assert.equal((await a.client.from("plans").select("*").eq("id",plan)).data.length,0);
    evidence.loan_unknown_calendar_and_out_of_order_payment = true;
    step="orçamento e meta pessoal sem fabricar caixa";
    await exec(b.client,"budget","budget",{month,category:"Outros",amount:10000,warning:80,version:0});
    const before=await snapshot(b.client);
    await exec(b.client,"savings-goal","savings_goal",{id:id("savings"),name:"Reserva exclusivamente fictícia",kind:"emergency",target:100000,initial:5000,account_id:accountB,due_on:null,created_on:when,active:true,version:0});
    await exec(b.client,"savings-deposit","savings_move",{id:id("savings-deposit"),goal_id:id("savings"),amount:5000,direction:"deposit",date:when,reason:"Separação fictícia verificada",version:1});
    await exec(b.client,"savings-withdraw","savings_move",{id:id("savings-withdraw"),goal_id:id("savings"),amount:2000,direction:"withdrawal",date:when,reason:"Retirada fictícia verificada",version:2});
    sb=await snapshot(b.client);assert.equal(sb.entries.length,before.entries.length);assert.equal(sb.account_movements.length,before.account_movements.length);
    assert.equal(sb.savings_goals.find(g=>g.id===id("savings")).initial+sb.savings_movements.filter(m=>m.goal_id===id("savings")).reduce((n,m)=>n+m.amount,0),8000);
    sa=await snapshot(a.client);assert.ok(!sa.personal_budgets.some(x=>x.owner_id===b.id));assert.ok(!sa.savings_goals.some(x=>x.owner_id===b.id));assert.ok(!sa.savings_movements.some(x=>x.owner_id===b.id));
    assert.ok(sb.entries.filter(e=>e.category==="Outros" && !e.house && e.consumer_id===b.id).reduce((n,e)=>n+e.amount,0)>sb.personal_budgets.find(x=>x.month===month && x.category==="Outros").amount);
    evidence.private_budget_overrun_and_savings_no_fake_cash = true;
    step="previsão salarial privada e recebimento conciliado";
    await exec(b.client,"salary","salary",{base:250000,payday:20});
    await exec(b.client,"salary-month","income_month",{month,expected:280000,version:0,future:false,scenario:"history",expected_on:when});
    await exec(b.client,"salary-future","future_receipt",{id:id("future-salary"),description:"Salário exclusivamente fictício",amount:280000,expected_on:when,month,kind:"salary",certainty:"committed",account_id:accountB,version:0});
    await exec(b.client,"salary-confirm","confirm_future_receipt",{id:id("future-salary"),date:when,amount:280000,account_id:accountB,version:1});
    sb=await snapshot(b.client);const receipt=sb.future_receipts.find(r=>r.id===id("future-salary"));assert.equal(receipt.status,"received");assert.equal(sb.entries.filter(e=>e.id===receipt.entry_id).length,1);
    sa=await snapshot(a.client);assert.ok(!sa.future_receipts.some(r=>r.owner_id===b.id));assert.ok(!sa.income_months.some(r=>r.owner_id===b.id));
    evidence.future_salary_confirmation_once_and_private = true;
    step="importação repetida não duplica";
    const row={id:id("import-row"),date:when,description:"Extrato exclusivamente fictício",amount:-1234,externalId:id("import-external"),occurrence:1,classification:"expense",category:"Outros"};
    await exec(b.client,"import-once","import_statement",{account_id:accountB,rows:[row]});
    await exec(b.client,"import-twice","import_statement",{account_id:accountB,rows:[{...row,id:id("import-second-row")}]});
    sb=await snapshot(b.client);assert.equal(sb.import_records.filter(r=>r.source_key==="id:"+row.externalId).length,1);assert.equal(sb.entries.filter(e=>e.description===row.description).length,1);
    assert.equal((await a.client.from("import_records").select("*").eq("owner_id",b.id)).data.length,0);
    evidence.real_import_dedup_and_privacy = true;
    step="revogar convite e desativar membro";
    const invitation=await authCall("create_invite",{},a.session);assert.equal(invitation.status,200);
    const listed=await authCall("manage_identity",{request:{action:"list"}},a.session);assert.equal(listed.status,200);assert.ok(!JSON.stringify(listed.data).includes("token_hash"));
    const newest=listed.data.invites.filter(i=>!i.reset_user && !i.used_at && !i.revoked).sort((x,y)=>y.expires_at.localeCompare(x.expires_at))[0];
    assert.ok(newest);
    const revoked=await authCall("manage_identity",{request:{action:"revoke",id:newest.id,key:crypto.randomUUID()}},a.session);assert.equal(revoked.status,200);
    const denied=await authCall("manage_identity",{request:{action:"member_active",id:a.id,active:false,expected_active:true,key:crypto.randomUUID()}},b.session);assert.equal(denied.status,400);
    const disabled=await authCall("manage_identity",{request:{action:"member_active",id:c.id,active:false,expected_active:true,key:crypto.randomUUID()}},a.session);assert.equal(disabled.status,200);
    assert.equal((await snapshot(c.client)).profiles.length,0);
    const reenabled=await authCall("manage_identity",{request:{action:"member_active",id:c.id,active:true,expected_active:false,key:crypto.randomUUID()}},a.session);assert.equal(reenabled.status,200);
    evidence.invite_revocation_and_member_disable_rls = true;
    step="recuperação real sem afetar outros usuários";
    const recovery=await authCall("create_invite",{reset_id:b.id},a.session);assert.equal(recovery.status,200);
    const oldPassword=fixture.members[0].password;
    const newPassword=`RecoveredAa9_${crypto.randomUUID()}`;
    const recovered=await authCall("reset",{username:fixture.members[0].username,password:newPassword,token:recovery.data.token});assert.equal(recovered.status,200);
    fixture.members[0].password=newPassword;await save();
    assert.equal((await authCall("login",{username:fixture.members[0].username,password:oldPassword})).status,400);
    assert.equal((await authCall("reset",{username:fixture.members[0].username,password:newPassword,token:recovery.data.token})).status,400);
    assert.equal((await authCall("login",{username,password})).status,200);
    evidence.real_password_recovery_reuse_denial_and_old_password_denied = true;
    fixture.evidence=evidence;fixture.completed_at=new Date().toISOString();await save();
    return { ...evidence, backend_mocked:false, project:"ovoqhnoaigjzihhpdukn", tested_at:fixture.completed_at };
  } catch(error) {
    await writeFile(`${fixturePath}.failure`,JSON.stringify({step,message:error?.message,code:error?.code}),{mode:0o600});
    throw Error(`Homologação API real interrompida na etapa: ${step}. Detalhes técnicos mantidos no arquivo privado de diagnóstico.`, { cause: error });
  } finally { await Promise.allSettled(clients.map(c=>c.auth.signOut())); }
}
