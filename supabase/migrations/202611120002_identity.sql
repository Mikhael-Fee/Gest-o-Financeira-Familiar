create table private.username_identities(username text primary key check(username ~ '^[a-z0-9_]{3,32}$'),user_id uuid not null unique references public.profiles,technical_email text not null unique);
create table private.invites(token_hash text primary key,family_id uuid not null references public.families,created_by uuid not null references public.profiles,expires_at timestamptz not null,used_at timestamptz,claimed_at timestamptz,reset_user uuid references public.profiles,revoked boolean not null default false);
create table private.rate_limits(bucket text primary key,window_start timestamptz not null default now(),attempts integer not null default 1);
create function public.identity_rate_limit(bucket_key text,max_attempts integer) returns boolean language plpgsql security definer set search_path='' as $$
declare attempts_count integer;
begin
 insert into private.rate_limits(bucket) values(bucket_key) on conflict(bucket) do update set attempts=case when rate_limits.window_start<now()-interval '15 minutes' then 1 else rate_limits.attempts+1 end,window_start=case when rate_limits.window_start<now()-interval '15 minutes' then now() else rate_limits.window_start end returning attempts into attempts_count;
 return attempts_count<=max_attempts;
end$$;
create function public.identity_lookup(login_name text) returns text language sql security definer set search_path='' as $$select i.technical_email from private.username_identities i join public.profiles p on p.id=i.user_id where i.username=login_name and p.active$$;
create function public.create_invite(actor uuid,token_digest text,reset_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare family uuid;
begin
 select family_id into family from public.profiles where id=actor and role='admin' and active;
 if family is null then raise exception 'Unauthorized';end if;
 if reset_id is not null and not exists(select 1 from public.profiles where id=reset_id and family_id=family and active) then raise exception 'Unauthorized';end if;
 insert into private.invites(token_hash,family_id,created_by,expires_at,reset_user) values(token_digest,family,actor,now()+case when reset_id is null then interval '48 hours' else interval '20 minutes' end,reset_id);
end$$;
create function public.claim_invite(token_digest text,reset_mode boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation private.invites;
begin
 select * into invitation from private.invites where token_hash=token_digest for update;
 if not found or invitation.revoked or invitation.used_at is not null or invitation.claimed_at is not null or invitation.expires_at<=now() or (invitation.reset_user is not null)<>reset_mode then raise exception 'Invalid invitation';end if;
 update private.invites set claimed_at=now() where token_hash=token_digest;
 return jsonb_build_object('family_id',invitation.family_id,'reset_user',invitation.reset_user);
end$$;
create function public.finish_identity(token_digest text,auth_id uuid,login_name text,tech_email text,reset_mode boolean) returns void language plpgsql security definer set search_path='' as $$
declare invitation private.invites;
begin
 select * into invitation from private.invites where token_hash=token_digest for update;
 if not found or invitation.claimed_at is null or invitation.used_at is not null or invitation.expires_at<=now() or invitation.revoked then raise exception 'Invalid invitation';end if;
 if reset_mode then
   if auth_id<>invitation.reset_user then raise exception 'Unauthorized';end if;
   delete from auth.sessions where user_id=auth_id;
 else
   insert into public.profiles(id,family_id,name) values(auth_id,invitation.family_id,login_name);
   insert into private.username_identities values(login_name,auth_id,tech_email);
 end if;
 update private.invites set used_at=now() where token_hash=token_digest;
 insert into public.audit_logs(actor_id,request_key,action,record_id) values(auth_id,gen_random_uuid(),case when reset_mode then 'access_reset' else 'invite_redeemed' end,auth_id::text);
end$$;
create function public.bootstrap_identity(auth_id uuid,login_name text,tech_email text,family_name text) returns void language plpgsql security definer set search_path='' as $$
declare family uuid;
begin
 perform pg_advisory_xact_lock(734921);
 if exists(select 1 from public.profiles) then raise exception 'Bootstrap already completed';end if;
 insert into public.families(name) values(family_name) returning id into family;
 insert into public.profiles values(auth_id,family,login_name,'admin',true);
 insert into private.username_identities values(login_name,auth_id,tech_email);
end$$;
revoke all on function public.identity_rate_limit(text,integer),public.identity_lookup(text),public.create_invite(uuid,text,uuid),public.claim_invite(text,boolean),public.finish_identity(text,uuid,text,text,boolean),public.bootstrap_identity(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.identity_rate_limit(text,integer),public.identity_lookup(text),public.create_invite(uuid,text,uuid),public.claim_invite(text,boolean),public.finish_identity(text,uuid,text,text,boolean),public.bootstrap_identity(uuid,text,text,text) to service_role;
-- A member can never grant themselves access to someone else's card.
create function public.set_card_permission(card_id uuid,member_id uuid,allowed boolean) returns void language plpgsql security definer set search_path='' as $$
declare old_value jsonb;new_value jsonb;
begin
 select to_jsonb(c.*) into old_value from public.cards c where c.id=card_id and c.owner_id=auth.uid() for update;
 if old_value is null or not exists(select 1 from public.profiles where id=member_id and family_id=private.family() and active) then raise exception 'Unauthorized';end if;
 update public.cards set authorized=case when allowed then array(select distinct unnest(authorized||member_id)) else array_remove(authorized,member_id) end where id=card_id returning to_jsonb(cards.*) into new_value;
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(auth.uid(),gen_random_uuid(),'card_permission',card_id::text,old_value,new_value);
end$$;
revoke all on function public.set_card_permission(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_card_permission(uuid,uuid,boolean) to authenticated;
