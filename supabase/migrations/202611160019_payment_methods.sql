alter table public.entries add column payment_method text check(payment_method in ('pix','debit','credit','cash','boleto','transfer','VA','VR','mixed','other'));
alter function public.execute_command(jsonb) rename to execute_before_payment_methods;
revoke all on function public.execute_before_payment_methods(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();req uuid:=(command->>'key')::uuid;p jsonb:=command->'payload';sig jsonb;method text;
begin
 if actor is null or private.family() is null or req is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if command->>'type'='entry' then
   method:=case when nullif(p->>'card_id','') is not null then 'credit' when jsonb_array_length(p->'splits')>1 then 'mixed' else coalesce(nullif(p->>'payment_method',''),'other') end;
   if method not in ('pix','debit','credit','cash','boleto','transfer','VA','VR','mixed','other') then raise exception 'Invalid payment method';end if;
 end if;
 perform public.execute_before_payment_methods(command);
 if method is not null then
   update public.entries set payment_method=method where id=(p->>'id')::uuid and owner_id=actor;
   insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,'payment_method',p->>'id',jsonb_build_object('payment_method',method));
 end if;
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
