alter table public.payments add column reversed_on date;
alter table public.obligations add column historical_paid_on date;
alter table public.account_movements drop constraint account_movements_kind_check;
alter table public.account_movements add constraint account_movements_kind_check check(kind in ('transfer','settlement','reconciliation','reversal'));
alter function public.execute_command(jsonb) rename to execute_workflows;
revoke all on function public.execute_workflows(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();p jsonb:=command->'payload';action text:=command->>'type';req uuid:=(command->>'key')::uuid;sig jsonb;pay public.payments;oblig public.obligations;acct public.accounts;before_value jsonb;after_value jsonb;paid bigint;
begin
 if actor is null or fam is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action not in ('reverse_payment','history') then perform public.execute_workflows(command);return;end if;
 if length(trim(p->>'reason'))<5 then raise exception 'Reason required';end if;
 if action='reverse_payment' then
   select * into pay from public.payments where id=(p->>'id')::uuid and payer_id=actor for update;
   if not found or pay.reversed_on is not null or (p->>'date')::date<pay.paid_on then raise exception 'Invalid reversal';end if;
   select * into oblig from public.obligations where id=pay.obligation_id for update;
   if oblig.replaced_by is not null then raise exception 'Cannot reverse refinanced payment';end if;
   before_value:=to_jsonb(pay);
   update public.payments set reversed_on=(p->>'date')::date where id=pay.id returning to_jsonb(payments.*) into after_value;
   update public.obligations set version=version+1 where id=oblig.id;
   insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id,reason) values(actor,pay.account_id,pay.amount,(p->>'date')::date,'reversal',req::text,p->>'reason');
 else
   select * into oblig from public.obligations where id=p->>'id' and owner_id=actor for update;
   if not found or oblig.replaced_by is not null or oblig.version<>(p->>'version')::integer then raise exception 'Conflict';end if;
   select * into acct from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor;
   if not found or (p->>'date')::date>=acct.cutoff then raise exception 'Historical confirmation must precede account cutoff';end if;
   select coalesce(sum(amount),0) into paid from public.payments where obligation_id=oblig.id and reversed_on is null;
   if (p->>'amount')::bigint<0 or (p->>'amount')::bigint+paid>oblig.amount then raise exception 'Invalid historical amount';end if;
   before_value:=to_jsonb(oblig);
   update public.obligations set confirmed=(p->>'amount')::bigint,historical_paid_on=(p->>'date')::date,unknown=false,version=version+1 where id=oblig.id returning to_jsonb(obligations.*) into after_value;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,p->>'id',before_value,after_value);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
