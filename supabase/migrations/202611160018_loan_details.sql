-- Optional contract facts never invent principal, interest or past bank movements.
alter table public.plans add column version integer not null default 1;
alter table public.plans add column institution text check(length(institution)<=160);
alter table public.plans add column modality text not null default 'other' check(modality in ('personal','payroll','financing','store','statement','other'));
alter table public.plans add column interest_kind text not null default 'unknown' check(interest_kind in ('with','without','unknown'));
alter table public.plans add column original_amount bigint check(original_amount between 0 and 100000000000);
alter table public.plans add column cet_basis_points integer check(cet_basis_points between 0 and 100000);
alter table public.plans add column signed_on date;
alter table public.plans add column contract_notes text check(length(contract_notes)<=2000);
alter table public.plans add column cadence_unit text not null default 'months' check(cadence_unit in ('days','months'));
alter table public.plans add column cadence_count integer not null default 1 check(cadence_count between 1 and 120);
alter table public.plans add column calendar_anchor_number integer;
alter table public.plans add column calendar_anchor_due date;
alter table public.plans add constraint loan_calendar_change_pair check((calendar_anchor_number is null and calendar_anchor_due is null) or (calendar_anchor_number between 1 and count and calendar_anchor_due is not null));

alter function public.execute_command(jsonb) rename to execute_before_loan_details;
revoke all on function public.execute_before_loan_details(jsonb) from public,anon,authenticated;
create function public.execute_command(command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();p jsonb:=command->'payload';req uuid:=(command->>'key')::uuid;sig jsonb;contract public.plans;anchor_item public.obligations;before_value jsonb;after_value jsonb;before_items jsonb;anchor_num integer;anchor_due date;unit_value text;step_value integer;
begin
 if actor is null or private.family() is null or req is null then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select body into sig from private.commands where actor_id=actor and key=req;
 if found then if sig<>command then raise exception 'Idempotency conflict';end if;return;end if;
 if command->>'type'<>'loan_details' then perform public.execute_before_loan_details(command);return;end if;
 select * into contract from public.plans where id=(p->>'id')::uuid and owner_id=actor and kind<>'purchase' for update;
 if not found then raise exception 'Unauthorized contract';end if;
 if contract.version is distinct from (p->>'version')::integer then raise exception 'Version conflict';end if;
 if length(trim(coalesce(p->>'reason',''))) not between 5 and 500 then raise exception 'Reason required';end if;
 if nullif(p->>'signed_on','')::date>private.business_today() then raise exception 'Future contract date';end if;
 unit_value:=coalesce(p->>'cadence_unit','months');step_value:=coalesce((p->>'cadence_count')::integer,1);
 if unit_value not in ('days','months') or step_value not between 1 and 120 then raise exception 'Invalid cadence';end if;
 before_value:=to_jsonb(contract);
 if coalesce((p->>'apply_calendar')::boolean,false) then
   anchor_num:=(p->>'anchor_number')::integer;anchor_due:=(p->>'anchor_due')::date;
   if anchor_num is null or anchor_num not between 1 and contract.count or anchor_due is null or anchor_due<private.business_today() or anchor_due<coalesce(contract.first_due,contract.next_due) then raise exception 'Invalid anchor';end if;
   select * into anchor_item from public.obligations where plan_id=contract.id and number=anchor_num for update;
   if not found or anchor_item.due_on<private.business_today() or anchor_item.confirmed>0 or anchor_item.replaced_by is not null or anchor_item.cancelled_on is not null or exists(select 1 from public.payments where obligation_id=anchor_item.id and reversed_on is null) then raise exception 'Anchor must be future unpaid obligation';end if;
   perform 1 from public.obligations where plan_id=contract.id order by number for update;
   select jsonb_agg(to_jsonb(o.*)) into before_items from public.obligations o where o.plan_id=contract.id;
   update public.obligations o set due_on=case when unit_value='months' then private.month_date(anchor_due,(o.number-anchor_num)*step_value) else anchor_due+(o.number-anchor_num)*step_value end,version=o.version+1
   where o.plan_id=contract.id and o.number>=anchor_num and o.replaced_by is null and o.cancelled_on is null and o.confirmed=0 and (o.due_on is null or o.due_on>=private.business_today()) and not exists(select 1 from public.payments pay where pay.obligation_id=o.id and pay.reversed_on is null);
 end if;
 update public.plans set institution=trim(coalesce(p->>'institution','')),modality=coalesce(p->>'modality','other'),interest_kind=coalesce(p->>'interest_kind','unknown'),original_amount=nullif(p->>'original_amount','')::bigint,cet_basis_points=nullif(p->>'cet_basis_points','')::integer,signed_on=nullif(p->>'signed_on','')::date,contract_notes=trim(coalesce(p->>'contract_notes','')),cadence_unit=unit_value,cadence_count=step_value,calendar_anchor_number=coalesce(anchor_num,calendar_anchor_number),calendar_anchor_due=coalesce(anchor_due,calendar_anchor_due),version=version+1 where id=contract.id returning to_jsonb(plans.*) into after_value;
 insert into private.commands values(actor,req,command);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'loan_details',contract.id::text,jsonb_build_object('contract',before_value,'schedule',before_items),jsonb_build_object('contract',after_value,'reason',p->>'reason','schedule',(select jsonb_agg(to_jsonb(o.*)) from public.obligations o where o.plan_id=contract.id)));
end$$;
revoke all on function public.execute_command(jsonb) from public,anon;
grant execute on function public.execute_command(jsonb) to authenticated;
