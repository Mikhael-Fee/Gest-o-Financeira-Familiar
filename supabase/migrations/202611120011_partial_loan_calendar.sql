alter table public.plans alter column first_due drop not null;
alter table public.plans add column next_due date;
alter table public.plans add column next_number integer;
alter table public.plans add column last_paid_known boolean not null default true;
alter table public.plans add constraint loan_calendar_anchor check((first_due is not null and next_due is null and next_number is null) or (first_due is null and next_due is not null and next_number is not null and next_number between 1 and count));
alter table public.plans add constraint loan_unknown_history check(last_paid_known or (last_paid=0 and last_paid_on is null and not history_confirmed));
alter table public.obligations alter column due_on drop not null;
alter table public.obligations add constraint undated_only_contract_item check(due_on is not null or plan_id is not null);
alter function public.execute_command(jsonb) rename to execute_before_partial_calendar;
revoke all on function public.execute_before_partial_calendar(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();p jsonb:=command->'payload';req uuid:=(command->>'key')::uuid;sig jsonb;contract public.plans;i integer;paid_value bigint;due_value date;after_value jsonb;
begin
 if actor is null or fam is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if command->>'type'<>'plan' then perform public.execute_before_partial_calendar(command);return;end if;
 if nullif(p->>'first_due','') is not null then
   perform public.execute_before_partial_calendar(command);
   update public.plans set last_paid_known=coalesce((p->>'last_paid_known')::boolean,true) where id=(p->>'id')::uuid and owner_id=actor returning to_jsonb(plans.*) into after_value;
   insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,'plan_calendar',p->>'id',after_value);
   return;
 end if;
 if p->>'kind'<>'loan' or length(trim(p->>'description')) not between 1 and 120 then raise exception 'Invalid loan';end if;
 if nullif(p->>'last_paid_on','')::date>private.business_today() then raise exception 'Future effective date';end if;
 insert into public.plans(id,owner_id,description,first_due,count,amount,last_paid,last_paid_on,history_confirmed,kind,next_due,next_number,last_paid_known) values((p->>'id')::uuid,actor,p->>'description',null,(p->>'count')::integer,(p->>'amount')::bigint,coalesce((p->>'last_paid')::integer,0),nullif(p->>'last_paid_on','')::date,coalesce((p->>'history_confirmed')::boolean,false),'loan',(p->>'next_due')::date,(p->>'next_number')::integer,coalesce((p->>'last_paid_known')::boolean,true)) returning * into contract;
 for i in 1..contract.count loop
   paid_value:=case when i=contract.last_paid or (contract.history_confirmed and i<=contract.last_paid) then contract.amount else 0 end;
   due_value:=case when i>=contract.next_number then private.month_date(contract.next_due,i-contract.next_number) else null end;
   insert into public.obligations(id,owner_id,family_id,description,amount,due_on,confirmed,unknown,plan_id,number,historical_paid_on) values(contract.id::text||':'||i,actor,fam,contract.description||' · '||i||'/'||contract.count,contract.amount,due_value,paid_value,paid_value<contract.amount and (due_value is null or (i<contract.last_paid and not contract.history_confirmed)),contract.id,i,case when i=contract.last_paid then contract.last_paid_on end);
 end loop;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,'plan_partial_calendar',contract.id::text,to_jsonb(contract));
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
