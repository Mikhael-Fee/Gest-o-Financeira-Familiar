-- Card metadata and explicit statement exceptions never rewrite paid history.
alter table public.cards add column credit_limit bigint check(credit_limit between 0 and 100000000000);
alter table public.cards add column version integer not null default 1;
create table public.card_cycles(card_id uuid not null references public.cards,month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),closing_on date not null,due_on date not null,version integer not null default 1,primary key(card_id,month),check(to_char(closing_on,'YYYY-MM')=month),check(due_on>=closing_on));
alter table public.card_cycles enable row level security;
create policy card_cycles_read on public.card_cycles for select to authenticated using(private.card_allowed(card_id));
revoke all on public.card_cycles from public,anon,authenticated;
grant select on public.card_cycles to authenticated;
create function private.statement_due(card_id uuid,purchase date) returns date language plpgsql stable security definer set search_path='' as $$
declare c public.cards;cycle date:=date_trunc('month',purchase)::date;closed date;due_date date;
begin
 select * into c from public.cards where id=card_id;
 select closing_on into closed from public.card_cycles where card_cycles.card_id=c.id and month=to_char(cycle,'YYYY-MM');
 closed:=coalesce(closed,private.month_date(cycle+(least(c.closing,extract(day from cycle+interval '1 month - 1 day')::integer)-1),0));
 if purchase>closed then cycle:=private.month_date(cycle,1);end if;
 select due_on into due_date from public.card_cycles where card_cycles.card_id=c.id and month=to_char(cycle,'YYYY-MM');
 if due_date is not null then return due_date;end if;
 if c.due<=c.closing then cycle:=private.month_date(cycle,1);end if;
 return cycle+(least(c.due,extract(day from cycle+interval '1 month - 1 day')::integer)-1);
end$$;
revoke all on function private.statement_due(uuid,date) from public,anon,authenticated;
alter function public.execute_command(jsonb) rename to execute_before_card_calendar;
revoke all on function public.execute_before_card_calendar(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p jsonb:=command->'payload';action text:=command->>'type';req uuid:=(command->>'key')::uuid;sig jsonb;c public.cards;o public.obligations;old_cycle public.card_cycles;before_value jsonb;after_value jsonb;first_due date;
begin
 if actor is null or private.family() is null or req is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action not in ('card_settings','card_cycle','card_reassign') then
   perform public.execute_before_card_calendar(command);
   if action='entry' and nullif(p->>'card_id','') is not null then
     first_due:=private.statement_due((p->>'card_id')::uuid,(p->>'occurred_on')::date);
     update public.obligations set due_on=private.month_date(first_due,number-1) where id like (p->>'id')||':%';
   end if;
   return;
 end if;
 select * into c from public.cards where id=(p->>'card_id')::uuid and owner_id=actor for update;
 if not found or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Unauthorized or missing reason';end if;
 if action='card_settings' then
   if (p->>'version')::integer is distinct from c.version then raise exception 'Version conflict';end if;
   before_value:=to_jsonb(c);
   update public.cards set closing=(p->>'closing')::integer,due=(p->>'due')::integer,credit_limit=nullif(p->>'credit_limit','')::bigint,version=version+1 where id=c.id returning to_jsonb(cards.*) into after_value;
 elsif action='card_cycle' then
   select * into old_cycle from public.card_cycles where card_id=c.id and month=p->>'month' for update;
   if coalesce(old_cycle.version,0) is distinct from (p->>'version')::integer then raise exception 'Version conflict';end if;
   before_value:=to_jsonb(old_cycle);
   insert into public.card_cycles(card_id,month,closing_on,due_on) values(c.id,p->>'month',(p->>'closing_on')::date,(p->>'due_on')::date)
   on conflict(card_id,month) do update set closing_on=excluded.closing_on,due_on=excluded.due_on,version=card_cycles.version+1 returning to_jsonb(card_cycles.*) into after_value;
 else
   select * into o from public.obligations where id=p->>'id' and card_id=c.id for update;
   if not found or o.version is distinct from (p->>'version')::integer or o.replaced_by is not null then raise exception 'Version conflict';end if;
   before_value:=to_jsonb(o);
   update public.obligations set due_on=(p->>'due_on')::date,version=version+1 where id=o.id returning to_jsonb(obligations.*) into after_value;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,c.id::text,before_value,after_value||jsonb_build_object('reason',p->>'reason'));
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
alter function public.load_finances() rename to load_before_card_calendar;
revoke all on function public.load_before_card_calendar() from public,anon;
grant execute on function public.load_before_card_calendar() to authenticated;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$select public.load_before_card_calendar()||jsonb_build_object('card_cycles',coalesce((select jsonb_agg(to_jsonb(c.*)) from public.card_cycles c),'[]'::jsonb))$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
