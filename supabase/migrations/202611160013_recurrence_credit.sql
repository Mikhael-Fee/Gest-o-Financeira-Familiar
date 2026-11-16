-- Additive recurrence schedules. Existing obligations and paid history remain intact.
alter table public.recurrences add column interval_unit text not null default 'months' check(interval_unit in ('days','months'));
alter table public.recurrences add column interval_count integer not null default 1 check(interval_count between 1 and 366);
alter table public.recurrences add column anchor_index integer not null default 0 check(anchor_index between 0 and 599);
alter table public.recurrences add column version integer not null default 1;
alter table public.recurrences add column category text not null default 'Contas da Casa' check(length(category) between 1 and 80);
alter table public.obligations add column occurrence_index integer;
alter table public.obligations add column recurrence_category text;
alter table public.obligations add column occurrence_override boolean not null default false;
alter table public.obligations add column cancelled_on date;
update public.obligations set occurrence_index=split_part(id,':',2)::integer,recurrence_category='Contas da Casa' where recurrence_id is not null and id ~ ':[0-9]+$';
create unique index recurrence_occurrence_index on public.obligations(recurrence_id,occurrence_index) where recurrence_id is not null;
drop index public.recurrence_month;
alter table public.obligations add constraint recurrence_due_date unique(recurrence_id,due_on) deferrable initially deferred;
alter table public.entries add column original_amount bigint check(original_amount between 0 and 100000000000);
alter table public.entries add column interest_kind text check(interest_kind in ('none','included','unknown'));
alter table public.entries add column installment_amounts jsonb check(jsonb_typeof(installment_amounts)='array');

create function private.recurrence_date(anchor date,ordinal integer,unit text,step integer) returns date language sql immutable set search_path='' as $$
select case when unit='months' then private.month_date(anchor,ordinal*step) else anchor+ordinal*step end
$$;
revoke all on function private.recurrence_date(date,integer,text,integer) from public,anon,authenticated;

create function private.generate_recurrence(rule_id uuid,through_count integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.recurrences; i integer; d date; estimate bigint;
begin
 select * into r from public.recurrences where id=rule_id for update;
 if not found or not r.active or through_count not between 1 and 600 then raise exception 'Invalid recurrence generation';end if;
 for i in 0..through_count-1 loop
   -- Earlier indices already exist and must never be rewritten after a rule edit.
   if i<r.anchor_index then continue;end if;
   d:=private.recurrence_date(r.first_due,i-r.anchor_index,r.interval_unit,r.interval_count);
   estimate:=r.amount;
   if r.variable then
     select coalesce((select percentile_disc(0.5) within group(order by h.amount) from (select o.amount from public.obligations o where o.recurrence_id=r.id and o.due_on<d and not o.unknown and o.cancelled_on is null order by o.due_on desc limit 6) h),r.amount) into estimate;
   end if;
   insert into public.obligations(id,owner_id,family_id,description,amount,due_on,house,unknown,recurrence_id,occurrence_index,recurrence_category)
   values(r.id::text||':'||i,r.owner_id,r.family_id,r.description,estimate,d,r.house,r.variable,r.id,i,r.category) on conflict(id) do nothing;
 end loop;
end$$;
revoke all on function private.generate_recurrence(uuid,integer) from public,anon,authenticated;

-- Confirmed family advances are financing, never salary or new consumption.
create table public.family_advances(
 id uuid primary key,sender_id uuid not null references public.profiles,recipient_id uuid not null references public.profiles,
 source_id uuid not null references public.accounts,destination_id uuid references public.accounts,
 amount bigint not null check(amount between 1 and 100000000000),sent_on date not null,confirmed_on date,rejected_on date,reversed_on date,
 description text not null check(length(description) between 1 and 120),version integer not null default 1,check(sender_id<>recipient_id));
create table public.advance_allocations(
 id uuid primary key,advance_id uuid not null references public.family_advances,settlement_id uuid not null references public.settlements,
 amount bigint not null check(amount between 1 and 100000000000),allocated_on date not null,reversed_on date,actor_id uuid not null references public.profiles);
alter table public.family_advances enable row level security;
alter table public.advance_allocations enable row level security;
create policy advance_read on public.family_advances for select to authenticated using((sender_id=auth.uid() or recipient_id=auth.uid()) and private.family() is not null);
create policy allocation_read on public.advance_allocations for select to authenticated using(exists(select 1 from public.family_advances a where a.id=advance_id and (a.sender_id=auth.uid() or a.recipient_id=auth.uid())));
revoke all on public.family_advances,public.advance_allocations from public,anon,authenticated;
grant select on public.family_advances,public.advance_allocations to authenticated;

create function private.advance_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();p jsonb:=command->'payload';action text:=command->>'type';req uuid:=(command->>'key')::uuid;a public.family_advances;allocation public.advance_allocations;s public.settlements;source public.accounts;dest public.accounts;before_value jsonb;after_value jsonb;amt bigint;used bigint;effective date:=(p->>'date')::date;
begin
 if actor is null or fam is null or effective is null or effective>private.business_today() then raise exception 'Invalid effective date or identity';end if;
 if action='send_advance' then
   if not exists(select 1 from public.profiles where id=(p->>'recipient_id')::uuid and family_id=fam and active and id<>actor) then raise exception 'Invalid recipient';end if;
   select * into source from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
   if not found or effective<source.cutoff or (p->>'amount')::bigint>private.account_balance(source.id) then raise exception 'Invalid advance source';end if;
   insert into public.family_advances(id,sender_id,recipient_id,source_id,amount,sent_on,description) values((p->>'id')::uuid,actor,(p->>'recipient_id')::uuid,source.id,(p->>'amount')::bigint,effective,p->>'description') returning * into a;
   after_value:=to_jsonb(a);
 elsif action='reverse_advance_allocation' then
   select * into allocation from public.advance_allocations where id=(p->>'id')::uuid and reversed_on is null for update;
   if not found then raise exception 'Unknown allocation';end if;
   select * into a from public.family_advances where id=allocation.advance_id and (sender_id=actor or recipient_id=actor) for update;
   if not found or a.version is distinct from (p->>'version')::integer or effective<allocation.allocated_on or length(trim(p->>'reason'))<5 then raise exception 'Allocation conflict';end if;
   select * into s from public.settlements where id=allocation.settlement_id for update;
   if s.confirmed<allocation.amount then raise exception 'Invalid allocation reversal';end if;
   before_value:=to_jsonb(allocation);
   update public.settlements set confirmed=confirmed-allocation.amount,version=version+1 where id=s.id;
   update public.advance_allocations set reversed_on=effective where id=allocation.id returning to_jsonb(advance_allocations.*) into after_value;
   update public.family_advances set version=version+1 where id=a.id;
 else
   select * into a from public.family_advances where id=(p->>'id')::uuid and (sender_id=actor or recipient_id=actor) for update;
   if not found or a.version is distinct from (p->>'version')::integer then raise exception 'Advance conflict';end if;
   before_value:=to_jsonb(a);
   if action='confirm_advance' then
     if a.recipient_id<>actor or a.confirmed_on is not null or a.rejected_on is not null or effective<a.sent_on then raise exception 'Invalid confirmation';end if;
     select * into source from public.accounts where id=a.source_id for update;
     select * into dest from public.accounts where id=(p->>'account_id')::uuid and owner_id=actor and kind in ('bank','cash') for update;
     if not found or effective<dest.cutoff or a.amount>private.account_balance(source.id) then raise exception 'Invalid confirmation account or balance';end if;
     insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id) values(a.sender_id,a.source_id,-a.amount,a.sent_on,'settlement',a.id::text),(actor,dest.id,a.amount,effective,'settlement',a.id::text);
     update public.family_advances set destination_id=dest.id,confirmed_on=effective,version=version+1 where id=a.id returning to_jsonb(family_advances.*) into after_value;
   elsif action='reject_advance' then
     if a.recipient_id<>actor or a.confirmed_on is not null or a.rejected_on is not null or effective<a.sent_on or length(trim(p->>'reason'))<5 then raise exception 'Invalid rejection';end if;
     update public.family_advances set rejected_on=effective,version=version+1 where id=a.id returning to_jsonb(family_advances.*) into after_value;
   elsif action='allocate_advance' then
     if a.sender_id<>actor or a.confirmed_on is null or a.reversed_on is not null or effective<a.confirmed_on then raise exception 'Unconfirmed advance';end if;
     select * into s from public.settlements where id=(p->>'settlement_id')::uuid and debtor_id=a.sender_id and creditor_id=a.recipient_id for update;
     if not found or s.version is distinct from (p->>'settlement_version')::integer then raise exception 'Settlement conflict';end if;
     amt:=(p->>'amount')::bigint;
     select coalesce(sum(amount),0) into used from public.advance_allocations where advance_id=a.id and reversed_on is null;
     if amt is null or amt<=0 or amt>a.amount-used or amt>s.amount-s.confirmed-s.sent then raise exception 'Amount exceeds available credit or unsettled balance';end if;
     insert into public.advance_allocations(id,advance_id,settlement_id,amount,allocated_on,actor_id) values(req,a.id,s.id,amt,effective,actor);
     update public.settlements set confirmed=confirmed+amt,version=version+1 where id=s.id;
     update public.family_advances set version=version+1 where id=a.id returning to_jsonb(family_advances.*) into after_value;
   elsif action='reverse_advance' then
     if a.recipient_id<>actor or a.confirmed_on is null or a.reversed_on is not null or effective<a.confirmed_on or length(trim(p->>'reason'))<5 then raise exception 'Invalid reversal';end if;
     if exists(select 1 from public.advance_allocations where advance_id=a.id and reversed_on is null) then raise exception 'Reverse credit allocations before reversing transfer';end if;
     select * into dest from public.accounts where id=a.destination_id for update;
     if private.account_balance(dest.id)<a.amount then raise exception 'Insufficient recipient recorded balance';end if;
     insert into public.account_movements(owner_id,account_id,amount,occurred_on,kind,reference_id,reason) values(a.sender_id,a.source_id,a.amount,effective,'reversal',req::text,p->>'reason'),(a.recipient_id,a.destination_id,-a.amount,effective,'reversal',req::text,p->>'reason');
     update public.family_advances set reversed_on=effective,version=version+1 where id=a.id returning to_jsonb(family_advances.*) into after_value;
   else raise exception 'Unknown advance action';end if;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,a.id::text,before_value,after_value);
end$$;
revoke all on function private.advance_command(jsonb) from public,anon,authenticated;

alter function public.load_finances() rename to load_before_advances;
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$
select public.load_before_advances()||jsonb_build_object('family_advances',coalesce((select jsonb_agg(to_jsonb(a.*)) from public.family_advances a),'[]'::jsonb),'advance_allocations',coalesce((select jsonb_agg(to_jsonb(a.*)) from public.advance_allocations a),'[]'::jsonb))$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;

alter function public.execute_command(jsonb) rename to execute_before_recurrence;
revoke all on function public.execute_before_recurrence(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();fam uuid:=private.family();p jsonb:=command->'payload';action text:=command->>'type';req uuid:=(command->>'key')::uuid;sig jsonb;r public.recurrences;o public.obligations;item public.entries;before_value jsonb;after_value jsonb;scope text;idx integer;anchor integer;i integer;through_count integer;d date;amt bigint;total bigint:=0;parts jsonb;part jsonb;cnt integer;first_date date;card public.cards;history jsonb;history_row jsonb;delegate jsonb;paid bigint;
begin
 if actor is null or fam is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if action in ('send_advance','confirm_advance','reject_advance','allocate_advance','reverse_advance','reverse_advance_allocation') then perform private.advance_command(command);return;end if;
 if action in ('pay','history','adjust_due') and exists(select 1 from public.obligations where id=coalesce(p->>'obligation_id',p->>'id') and cancelled_on is not null) then raise exception 'Cancelled obligation';end if;
 if action not in ('recurrence_v2','generate_v2','generate','recurrence_edit','purchase_v2') then
   perform public.execute_before_recurrence(command);
   if action='pay' then
     update public.entries e set category=o2.recurrence_category from public.obligations o2 where e.obligation_id=o2.id and o2.id=p->>'obligation_id' and o2.recurrence_category is not null;
   end if;
   return;
 end if;
 if action='recurrence_v2' then
   if p->>'description' is null or length(trim(p->>'description')) not between 1 and 120 then raise exception 'Invalid description';end if;
   insert into public.recurrences(id,owner_id,family_id,description,amount,first_due,house,variable,interval_unit,interval_count,category)
   values((p->>'id')::uuid,actor,fam,trim(p->>'description'),(p->>'amount')::bigint,(p->>'date')::date,coalesce((p->>'house')::boolean,false),coalesce((p->>'variable')::boolean,false),coalesce(p->>'interval_unit','months'),coalesce((p->>'interval_count')::integer,1),coalesce(nullif(trim(p->>'category'),''),'Outros')) returning * into r;
   perform private.generate_recurrence(r.id,coalesce((p->>'count')::integer,12));
   after_value:=to_jsonb(r);
 elsif action in ('generate_v2','generate') then
   select * into r from public.recurrences where id=(p->>'id')::uuid and owner_id=actor for update;
   if not found or (action='generate_v2' and r.version is distinct from (p->>'version')::integer) then raise exception 'Recurrence conflict';end if;
   perform private.generate_recurrence(r.id,coalesce((p->>'count')::integer,12));
   after_value:=to_jsonb(r);
 elsif action='recurrence_edit' then
   select * into r from public.recurrences where id=(p->>'id')::uuid and owner_id=actor for update;
   if not found or r.version is distinct from (p->>'version')::integer then raise exception 'Recurrence conflict';end if;
   if p->>'reason' is null or length(trim(p->>'reason'))<5 then raise exception 'Reason required';end if;
   before_value:=to_jsonb(r);scope:=p->>'scope';
   if scope='this' then
     select * into o from public.obligations where id=p->>'occurrence_id' and recurrence_id=r.id and owner_id=actor for update;
     if not found or o.version is distinct from (p->>'occurrence_version')::integer or o.replaced_by is not null or o.cancelled_on is not null then raise exception 'Occurrence conflict';end if;
     select o.confirmed+coalesce(sum(amount),0) into paid from public.payments where obligation_id=o.id and reversed_on is null;
     if coalesce((p->>'cancel')::boolean,false) then
       if paid>0 then raise exception 'Reverse or reconcile payments before cancellation';end if;
       update public.obligations set cancelled_on=private.business_today(),occurrence_override=true,version=version+1 where id=o.id;
     else
       if (p->>'amount')::bigint<paid then raise exception 'Amount below paid';end if;
       update public.obligations set amount=(p->>'amount')::bigint,due_on=(p->>'date')::date,description=coalesce(nullif(p->>'description',''),description),unknown=coalesce((p->>'variable')::boolean,false),occurrence_override=true,version=version+1 where id=o.id;
       update public.entries set amount=(p->>'amount')::bigint,version=version+1 where obligation_id=o.id;
     end if;
     update public.recurrences set version=version+1 where id=r.id;
     select to_jsonb(x.*) into after_value from public.obligations x where id=o.id;
     before_value:=to_jsonb(o);
   elsif scope in ('next','rule') then
     anchor:=coalesce((p->>'from_index')::integer,0);
     if anchor not between 0 and 599 or (p->>'date')::date<private.business_today() then raise exception 'Future rule date required';end if;
     if p->>'description' is null or length(trim(p->>'description')) not between 1 and 120 then raise exception 'Invalid description';end if;
     update public.recurrences set first_due=(p->>'date')::date,anchor_index=anchor,description=trim(p->>'description'),amount=(p->>'amount')::bigint,interval_unit=coalesce(p->>'interval_unit',interval_unit),interval_count=coalesce((p->>'interval_count')::integer,interval_count),variable=coalesce((p->>'variable')::boolean,false),category=coalesce(nullif(trim(p->>'category'),''),category),active=not coalesce((p->>'cancel')::boolean,false),version=version+1 where id=r.id returning * into r;
     for o in select * from public.obligations where recurrence_id=r.id and occurrence_index>=anchor and due_on>=private.business_today() and cancelled_on is null and replaced_by is null and confirmed=0 and (not occurrence_override or scope='next') and not exists(select 1 from public.payments pay where pay.obligation_id=obligations.id and pay.reversed_on is null) order by occurrence_index for update loop
       d:=private.recurrence_date(r.first_due,o.occurrence_index-anchor,r.interval_unit,r.interval_count);
       update public.obligations set description=r.description,amount=r.amount,due_on=d,unknown=r.variable,recurrence_category=r.category,cancelled_on=case when not r.active then private.business_today() end,version=version+1 where id=o.id;
       insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) select actor,req,'recurrence_occurrence_edit',o.id,to_jsonb(o),to_jsonb(x.*) from public.obligations x where id=o.id;
     end loop;
     after_value:=to_jsonb(r);
   else raise exception 'Invalid recurrence edit scope';end if;
 elsif action='purchase_v2' then
   parts:=p->'amounts';cnt:=jsonb_array_length(parts);
   if jsonb_typeof(parts)<>'array' or cnt not between 1 and 600 then raise exception 'Invalid purchase installments';end if;
   for part in select * from jsonb_array_elements(parts) loop
     if jsonb_typeof(part)<>'number' or (part#>>'{}') !~ '^[0-9]+$' or (part#>>'{}')::bigint not between 1 and 100000000000 then raise exception 'Invalid installment amount';end if;
     total:=total+(part#>>'{}')::bigint;
   end loop;
   if total>100000000000 or p->>'interest_kind' not in ('none','included','unknown') then raise exception 'Invalid purchase total';end if;
   first_date:=(p->>'first_due')::date;
   if first_date is null or first_date<(p->>'occurred_on')::date then raise exception 'Invalid first charge date';end if;
   select * into card from public.cards where id=(p->>'card_id')::uuid;
   if not found or not private.card_allowed(card.id) then raise exception 'Unauthorized card';end if;
   history:=coalesce(p->'history','[]'::jsonb);
   if jsonb_typeof(history)<>'array' or jsonb_array_length(history)>cnt or (select count(distinct h->>'number') from jsonb_array_elements(history) h)<>jsonb_array_length(history) then raise exception 'Invalid opening history';end if;
   delegate:=jsonb_build_object('key',req,'type','entry','payload',(p-'amounts'-'first_due'-'original_amount'-'interest_kind'-'history')||jsonb_build_object('amount',total,'installments',cnt,'kind','expense','splits','[]'::jsonb));
   perform public.execute_before_recurrence(delegate);
   update public.entries set original_amount=nullif(p->>'original_amount','')::bigint,interest_kind=p->>'interest_kind',installment_amounts=parts where id=(p->>'id')::uuid and owner_id=actor returning * into item;
   for i in 1..cnt loop
     update public.obligations set amount=(parts->>(i-1))::bigint,due_on=private.month_date(first_date,i-1),unknown=private.month_date(first_date,i-1)<private.business_today() where id=item.id::text||':'||i;
   end loop;
   for history_row in select * from jsonb_array_elements(history) loop
     idx:=(history_row->>'number')::integer;d:=(history_row->>'paid_on')::date;amt:=(history_row->>'amount')::bigint;
     if idx not between 1 and cnt or d is null or d>private.business_today() or amt not between 0 and (parts->>(idx-1))::bigint then raise exception 'Invalid opening history';end if;
     update public.obligations set confirmed=amt,historical_paid_on=d,unknown=false where id=item.id::text||':'||idx;
   end loop;
   -- Delegate wrote its own dedup record; retain the user's exact command for retries.
   update private.commands set body=command where actor_id=actor and key=req;
   insert into public.audit_logs(actor_id,request_key,action,record_id,after_data) values(actor,req,action,item.id::text,to_jsonb(item));
   return;
 end if;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,action,coalesce(r.id::text,p->>'id'),before_value,after_value);
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
