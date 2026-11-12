alter table public.settlement_transfers add column rejected_on date;
alter table public.settlement_transfers add column reversed_on date;
alter function public.execute_command(jsonb) rename to execute_catalog;
revoke all on function public.execute_catalog(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p jsonb:=command->'payload';req uuid:=(command->>'key')::uuid;action text:=command->>'type';sig jsonb;x public.settlements;t public.settlement_transfers;before_value jsonb;after_value jsonb;
begin
 if actor is null or private.family() is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action not in ('reject','reverse_settlement') then perform public.execute_catalog(command);return;end if;
 if length(trim(p->>'reason'))<5 then raise exception 'Reason required';end if;
 select * into x from public.settlements where id=(p->>'id')::uuid and creditor_id=actor for update;
 if not found or x.version<>(p->>'version')::integer then raise exception 'Conflict';end if;
 before_value:=to_jsonb(x);
 if action='reject' then
   if x.sent=0 then raise exception 'No pending declaration';end if;
   update public.settlement_transfers set rejected_on=(p->>'date')::date where settlement_id=x.id and confirmed_on is null and rejected_on is null;
   update public.settlements set sent=0,version=version+1 where id=x.id returning to_jsonb(settlements.*) into after_value;
 else
   select * into t from public.settlement_transfers where id=(p->>'transfer_id')::uuid and settlement_id=x.id for update;
   if not found or t.confirmed_on is null or t.reversed_on is not null or (p->>'date')::date<t.confirmed_on then raise exception 'Invalid settlement reversal';end if;
   perform 1 from public.accounts where id in(t.source_id,t.destination_id) order by id for update;
   if private.account_balance(t.destination_id)<t.amount then raise exception 'Receiving account needs reconciliation';end if;
   insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id,reason) values(t.sender_id,t.source_id,t.amount,(p->>'date')::date,'reversal',req::text,p->>'reason'),(actor,t.destination_id,-t.amount,(p->>'date')::date,'reversal',req::text,p->>'reason');
   update public.settlement_transfers set reversed_on=(p->>'date')::date where id=t.id;
   update public.settlements set confirmed=confirmed-t.amount,version=version+1 where id=x.id returning to_jsonb(settlements.*) into after_value;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,x.id::text,before_value,after_value);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
