-- Validate combined earmarks and use one statement calendar for every new purchase.
create function private.card_due_at(card_id uuid,purchase date,offset_index integer) returns date language plpgsql stable security definer set search_path='' as $$
declare c public.cards;cycle date:=date_trunc('month',purchase)::date;closed date;result date;
begin
 if offset_index not between 0 and 599 then raise exception 'Invalid installment index';end if;
 select * into strict c from public.cards where id=card_id;
 select closing_on into closed from public.card_cycles cc where cc.card_id=c.id and cc.month=to_char(cycle,'YYYY-MM');
 closed:=coalesce(closed,cycle+least(c.closing-1,extract(day from cycle+interval '1 month - 1 day')::integer-1));
 if purchase>closed then cycle:=private.month_date(cycle,1);end if;
 cycle:=private.month_date(cycle,offset_index);
 select due_on into result from public.card_cycles cc where cc.card_id=c.id and cc.month=to_char(cycle,'YYYY-MM');
 if result is not null then return result;end if;
 if c.due<=c.closing then cycle:=private.month_date(cycle,1);end if;
 return cycle+least(c.due-1,extract(day from cycle+interval '1 month - 1 day')::integer-1);
end$$;
revoke all on function private.card_due_at(uuid,date,integer) from public,anon,authenticated;
alter function public.execute_command(jsonb) rename to execute_before_planning_integrity;
revoke all on function public.execute_before_planning_integrity(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();req uuid:=(command->>'key')::uuid;p jsonb:=command->'payload';action text:=command->>'type';sig jsonb;delegated jsonb:=command;acct public.accounts;savings bigint;reserved bigint;line public.obligations;new_due date;
begin
 if actor is null or private.family() is null or req is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action='purchase_v2' and coalesce((p->>'use_card_calendar')::boolean,false) then
   delegated:=jsonb_set(command,'{payload,first_due}',to_jsonb(private.card_due_at((p->>'card_id')::uuid,(p->>'occurred_on')::date,0)));
 end if;
 perform public.execute_before_planning_integrity(delegated);
 if delegated<>command then update private.commands set body=command where actor_id=actor and key=req;end if;
 if action in ('savings_goal','savings_move','savings_reverse','reserve_obligation') then
   for acct in select * from public.accounts where owner_id=actor and kind in ('bank','cash') order by id for update loop
     select coalesce(sum(g.initial+coalesce((select sum(m.amount) from public.savings_movements m where m.goal_id=g.id and m.occurred_on<=private.business_today()),0)),0) into savings from public.savings_goals g where g.owner_id=actor and g.account_id=acct.id and g.active;
     select coalesce(sum(least(r.amount,greatest(0,o.amount-o.confirmed-coalesce((select sum(pay.amount) from public.payments pay where pay.obligation_id=o.id and pay.reversed_on is null),0)))),0) into reserved from public.obligation_reservations r join public.obligations o on o.id=r.obligation_id where r.owner_id=actor and r.account_id=acct.id and o.replaced_by is null and o.cancelled_on is null;
     if savings+reserved>greatest(0,private.account_balance(acct.id)) then raise exception 'Combined reservations exceed recorded account balance';end if;
   end loop;
 end if;
 if (action='entry' and nullif(p->>'card_id','') is not null) or (action='purchase_v2' and coalesce((p->>'use_card_calendar')::boolean,false)) then
   for line in select * from public.obligations where id like (p->>'id')||':%' order by number loop
     new_due:=private.card_due_at((p->>'card_id')::uuid,(p->>'occurred_on')::date,line.number-1);
     if new_due is distinct from line.due_on then
       update public.obligations set due_on=new_due where id=line.id;
       insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'purchase_calendar',line.id,to_jsonb(line),jsonb_build_object('due_on',new_due));
     end if;
   end loop;
 end if;
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
