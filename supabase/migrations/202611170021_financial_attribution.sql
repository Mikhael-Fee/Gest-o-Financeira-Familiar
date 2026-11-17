-- Compatible attribution ledger. Original cash, consumption and obligations remain intact.
-- Only unambiguous purchase IDs are reconstructed; every reconstructed link is audited.
alter table public.obligations add column funding_parts jsonb not null default '[]' check(jsonb_typeof(funding_parts)='array'), add column replaced_on date, add column funding_review boolean not null default false;
alter table public.payments add column funding_parts jsonb not null default '[]' check(jsonb_typeof(funding_parts)='array');
alter table public.settlements add column entry_id uuid references public.entries, add column bank_credit bigint not null default 0 check(bank_credit>=0), add column funding_review boolean not null default false;
with linked as (
 update public.obligations o set funding_parts=jsonb_build_array(jsonb_build_object('entry_id',e.id,'amount',o.amount)) from public.entries e where e.card_id is not null and o.id like e.id::text||':%' returning o.*
) insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) select owner_id,gen_random_uuid(),'attribution_link_compatibility',id,jsonb_build_object('migration','021','funding_parts',funding_parts) from linked;
with linked as (
 update public.payments p set funding_parts=jsonb_build_array(jsonb_build_object('entry_id',o.funding_parts->0->>'entry_id','amount',p.amount)) from public.obligations o where p.obligation_id=o.id and jsonb_array_length(o.funding_parts)=1 returning p.*
) insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) select payer_id,gen_random_uuid(),'attribution_payment_compatibility',id::text,jsonb_build_object('migration','021','funding_parts',funding_parts) from linked;
with linked as (
 update public.settlements s set entry_id=e.id from public.entries e where e.id=s.id and e.card_id is not null returning s.*
) insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) select creditor_id,gen_random_uuid(),'attribution_settlement_compatibility',id::text,jsonb_build_object('migration','021','entry_id',entry_id) from linked;
-- Existing ambiguous refinances are flagged, never guessed or financially rewritten.
update public.obligations n set funding_review=true where exists(select 1 from public.obligations old where old.replaced_by is not null and split_part(old.replaced_by,':',1)=split_part(n.id,':',1));

create function private.take_funding(parts jsonb,value bigint) returns jsonb language plpgsql immutable set search_path='' as $$
declare part jsonb;v bigint;result jsonb:='[]';begin
 for part in select * from jsonb_array_elements(parts) loop
  v:=least(value,(part->>'amount')::bigint);if v>0 then result:=result||jsonb_build_array(jsonb_build_object('entry_id',part->>'entry_id','amount',v));end if;value:=value-v;if value=0 then exit;end if;
 end loop;return result;
end$$;
create function private.open_funding(obligation text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.obligations;part jsonb;funded bigint;result jsonb:='[]';left_total bigint;begin
 select * into strict o from public.obligations where id=obligation;
 for part in select * from jsonb_array_elements(o.funding_parts) loop
  select coalesce(sum((f->>'amount')::bigint),0) into funded from public.payments p cross join lateral jsonb_array_elements(p.funding_parts) f where p.obligation_id=o.id and p.reversed_on is null and f->>'entry_id'=part->>'entry_id';
  if (part->>'amount')::bigint>funded then result:=result||jsonb_build_array(jsonb_build_object('entry_id',part->>'entry_id','amount',(part->>'amount')::bigint-funded));end if;
 end loop;
 select greatest(0,o.amount-o.confirmed-coalesce(sum(amount),0)) into left_total from public.payments where obligation_id=o.id and reversed_on is null;
 return private.take_funding(result,left_total);
end$$;
create function private.attach_financial_funding() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.entries;responsible uuid;begin
 if tg_table_name='entries' then
  if new.card_id is not null then
   responsible:=coalesce(new.responsible_id,new.consumer_id);
   if auth.uid() is not null and responsible<>auth.uid() and responsible<>private.card_owner(new.card_id) then raise exception 'Responsible member must authorize their own debt';end if;
  end if;
 elsif tg_table_name='obligations' then
  select * into e from public.entries where card_id is not null and new.id like id::text||':%';
  if found then new.funding_parts:=jsonb_build_array(jsonb_build_object('entry_id',e.id,'amount',new.amount));end if;
 elsif tg_table_name='payments' then
  new.funding_parts:=private.take_funding(private.open_funding(new.obligation_id),new.amount);
 elsif tg_table_name='settlements' then
  select * into e from public.entries where id=new.id and card_id is not null;if found then new.entry_id:=e.id;end if;
 end if;return new;
end$$;
create trigger entry_financing_guard before insert on public.entries for each row execute function private.attach_financial_funding();
create trigger obligation_financing before insert on public.obligations for each row execute function private.attach_financial_funding();
create trigger payment_financing before insert on public.payments for each row execute function private.attach_financial_funding();
create trigger settlement_financing before insert on public.settlements for each row execute function private.attach_financial_funding();

create function private.settlement_bank_credit(entry uuid,creditor uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum((f->>'amount')::bigint),0)::bigint from public.payments p cross join lateral jsonb_array_elements(p.funding_parts) f where p.reversed_on is null and p.payer_id<>creditor and f->>'entry_id'=entry::text
$$;
-- Compatibility anomalies stay explicit. Future commands cannot increase them.
update public.settlements s set bank_credit=least(private.settlement_bank_credit(s.entry_id,s.creditor_id),s.amount-s.confirmed-s.sent),funding_review=(private.settlement_bank_credit(s.entry_id,s.creditor_id)>s.amount-s.confirmed-s.sent);
alter table public.settlements add constraint settlement_financed_limit check(confirmed+sent+bank_credit<=amount);

alter function public.execute_command(jsonb) rename to execute_before_financial_attribution;
revoke all on function public.execute_before_financial_attribution(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();req uuid:=(command->>'key')::uuid;action text:=command->>'type';p jsonb:=command->'payload';sig jsonb;old public.obligations;line public.obligations;first_source public.obligations;pool jsonb:='[]';consumed bigint;part jsonb;remaining_pool jsonb;allocated jsonb;credit bigint;settlement public.settlements;fee bigint;original bigint:=0;
begin
 if actor is null or fam is null or req is null then raise exception 'Unauthorized';end if;
 -- Same-family shared claims serialize across actors; unrelated families do not block each other.
 perform pg_advisory_xact_lock(hashtextextended('financial-family:'||fam::text,1));
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action='replace' then
  for old in select * from public.obligations where id in(select jsonb_array_elements_text(p->'sources')) order by id for update loop
   if old.owner_id<>actor or old.replaced_by is not null or old.cancelled_on is not null then raise exception 'Unauthorized or already replaced';end if;
   if first_source.id is null then first_source:=old;elsif old.house<>first_source.house or old.card_id is distinct from first_source.card_id then raise exception 'Refinance cards and personal/house expenses separately';end if;
   pool:=pool||private.open_funding(old.id);
   original:=original+old.amount-old.confirmed-coalesce((select sum(amount) from public.payments where obligation_id=old.id and reversed_on is null),0);
  end loop;
  fee:=(p->>'fee')::bigint;
  if p->>'quote' is not null and (p->>'quote')::bigint<>original+fee and exists(select 1 from jsonb_array_elements(pool) f join public.settlements s on s.entry_id=(f->>'entry_id')::uuid) then raise exception 'Shared reimbursement discount requires participant reconciliation';end if;
  if fee>0 and first_source.card_id is not null then pool:=pool||jsonb_build_array(jsonb_build_object('entry_id',p->>'id','amount',fee));end if;
 elsif action='adjust_due' then
  select * into old from public.obligations where id=p->>'id';if old.card_id is not null and (p->>'amount')::bigint<>old.amount then raise exception 'Reconcile purchase and settlement before changing card amount';end if;
 end if;
 perform public.execute_before_financial_attribution(command);
 if action='replace' then
  update public.entries set house=first_source.house,card_id=first_source.card_id where id=(p->>'id')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id',entry,'amount',amount) order by pos),'[]'::jsonb) into pool from (select f->>'entry_id' as entry,sum((f->>'amount')::bigint) as amount,min(pos) as pos from jsonb_array_elements(pool) with ordinality t(f,pos) group by f->>'entry_id') merged;
  for line in select * from public.obligations where id like (p->>'id')||':%' order by number loop
   allocated:=private.take_funding(pool,line.amount);consumed:=line.amount;remaining_pool:='[]';
   for part in select * from jsonb_array_elements(pool) loop
    credit:=least(consumed,(part->>'amount')::bigint);consumed:=consumed-credit;
    if (part->>'amount')::bigint>credit then remaining_pool:=remaining_pool||jsonb_build_array(jsonb_build_object('entry_id',part->>'entry_id','amount',(part->>'amount')::bigint-credit));end if;
   end loop;pool:=remaining_pool;
   update public.obligations set house=first_source.house,card_id=first_source.card_id,funding_parts=allocated where id=line.id;
  end loop;
  update public.obligations set replaced_on=coalesce((p->>'occurred_on')::date,private.business_today()) where id in(select jsonb_array_elements_text(p->'sources'));
 end if;
 for settlement in select s.* from public.settlements s join public.profiles pr on pr.id=s.creditor_id where pr.family_id=fam order by s.id for update of s loop
  credit:=private.settlement_bank_credit(settlement.entry_id,settlement.creditor_id);
  if credit+settlement.confirmed+settlement.sent>settlement.amount then raise exception 'Amount already funded or sent; reconcile before paying for another member';end if;
  if credit<>settlement.bank_credit then
   update public.settlements set bank_credit=credit,version=version+1 where id=settlement.id;
   insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'bank_settlement_credit',settlement.id::text,jsonb_build_object('bank_credit',settlement.bank_credit),jsonb_build_object('bank_credit',credit));
  end if;
 end loop;
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;

-- A narrow shared read model: no bank account IDs, balances, private claims or transfer IDs.
create function public.house_financing() returns jsonb language sql stable security definer set search_path='' as $$
with shared as(select * from public.entries where family_id=private.family() and auth.uid() is not null and house and not voided and kind='expense'),
payment_events as(
 select e.id as entry_id,p.payer_id as member_id,s.creditor_id,(f->>'amount')::bigint as amount,p.paid_on as occurred_on,case when p.payer_id=s.creditor_id then 'advance' else 'payment' end as kind,p.reversed_on
 from public.payments p cross join lateral jsonb_array_elements(p.funding_parts) f join shared e on e.id=(f->>'entry_id')::uuid left join public.settlements s on s.entry_id=e.id
 union all
 select null,p.payer_id,null,p.amount,p.paid_on,'payment',p.reversed_on from public.payments p join public.obligations o on o.id=p.obligation_id where o.family_id=private.family() and auth.uid() is not null and o.house and o.card_id is null and p.funding_parts='[]'::jsonb
),reimbursements as(
 select e.id as entry_id,s.debtor_id as member_id,s.creditor_id,t.amount,t.confirmed_on as occurred_on,'reimbursement'::text as kind,t.reversed_on from public.settlement_transfers t join public.settlements s on s.id=t.settlement_id join shared e on e.id=s.entry_id where t.confirmed_on is not null
 union all
 select e.id,s.debtor_id,s.creditor_id,a.amount,a.allocated_on,'reimbursement',a.reversed_on from public.advance_allocations a join public.settlements s on s.id=a.settlement_id join shared e on e.id=s.entry_id
),events as(
 select e.id as entry_id,e.owner_id as member_id,null::uuid as creditor_id,(select coalesce(sum((f->>'amount')::bigint),0)::bigint from jsonb_array_elements(e.splits) f) as amount,e.occurred_on,'direct'::text as kind from shared e where e.card_id is null
 union all select entry_id,member_id,creditor_id,amount,occurred_on,kind from payment_events
 union all select entry_id,member_id,creditor_id,-amount,reversed_on,kind from payment_events where reversed_on is not null
 union all select entry_id,member_id,creditor_id,amount,occurred_on,kind from reimbursements
 union all select entry_id,member_id,creditor_id,-amount,reversed_on,kind from reimbursements where reversed_on is not null
)select coalesce(jsonb_agg(to_jsonb(e.*)) filter(where e.amount<>0),'[]'::jsonb) from events e
$$;
revoke all on function public.house_financing() from public,anon;
grant execute on function public.house_financing() to authenticated;
alter function public.load_finances() rename to load_before_financial_attribution;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$select public.load_before_financial_attribution()||jsonb_build_object('house_funding',public.house_financing())$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
revoke all on function private.take_funding(jsonb,bigint),private.open_funding(text),private.attach_financial_funding(),private.settlement_bank_credit(uuid,uuid) from public,anon,authenticated;
