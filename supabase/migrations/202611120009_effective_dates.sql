create or replace function private.business_today() returns date language sql stable set search_path='' as $$select timezone('America/Sao_Paulo',now())::date$$;
revoke all on function private.business_today() from public,anon,authenticated;
alter function public.execute_command(jsonb) rename to execute_verified;
revoke all on function public.execute_verified(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p jsonb:=command->'payload';action text:=command->>'type';effective date;
begin
 if auth.uid() is null or private.family() is null then raise exception 'Unauthorized';end if;
 if action='entry' then effective:=(p->>'occurred_on')::date;
 elsif action='account' then effective:=(p->>'cutoff')::date;
 elsif action='plan' then effective:=nullif(p->>'last_paid_on','')::date;
 elsif action='pay' then effective:=(p->>'paid_on')::date;
 elsif action='send' then effective:=(p->>'sent_on')::date;
 elsif action in ('transfer','reconcile','confirm','history','reverse_payment','reverse_settlement','reject') then effective:=(p->>'date')::date;
 elsif action='replace' then effective:=coalesce((p->>'occurred_on')::date,private.business_today());end if;
 if effective>private.business_today() then raise exception 'Effective date is in the future; use planning';end if;
 perform public.execute_verified(command);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
