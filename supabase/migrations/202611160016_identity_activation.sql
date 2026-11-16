-- Administrative identity metadata only: never expose invitation digests or Auth data.
alter table private.invites add column id uuid not null default gen_random_uuid() unique;
create table private.identity_commands(actor_id uuid not null references public.profiles,key uuid not null,body jsonb not null,result jsonb not null,primary key(actor_id,key));
revoke all on private.identity_commands from public,anon,authenticated;

create or replace function public.create_invite(actor uuid,token_digest text,reset_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare family uuid;
begin
 select family_id into family from public.profiles where id=actor and role='admin' and active for update;
 if family is null or token_digest is null or token_digest !~ '^[a-f0-9]{64}$' then raise exception 'Unauthorized';end if;
 if reset_id is not null and not exists(select 1 from public.profiles where id=reset_id and family_id=family and active) then raise exception 'Unauthorized';end if;
 insert into private.invites(token_hash,family_id,created_by,expires_at,reset_user) values(token_digest,family,actor,now()+case when reset_id is null then interval '48 hours' else interval '20 minutes' end,reset_id);
 insert into public.audit_logs(actor_id,request_key,action,record_id) values(actor,gen_random_uuid(),case when reset_id is null then 'invite_created' else 'recovery_created' end,coalesce(reset_id,actor)::text);
end$$;

-- Called only by the Edge Function, after verifying the actor's bearer token.
create function public.manage_identity(actor uuid,request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare family uuid;admin_actor boolean;action text:=request->>'action';target uuid;req uuid;before_value jsonb;after_value jsonb;existing private.identity_commands;result jsonb;invite private.invites;member public.profiles;new_name text;
begin
 select family_id,role='admin' into family,admin_actor from public.profiles where id=actor and active;
 if family is null then raise exception 'Unauthorized';end if;
 if action='self' then
   return jsonb_build_object('username',(select username from private.username_identities where user_id=actor));
 end if;
 if action='list' then
   if not admin_actor then raise exception 'Unauthorized';end if;
   return jsonb_build_object('invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'expires_at',i.expires_at,'used_at',i.used_at,'claimed',i.claimed_at is not null,'reset_user',i.reset_user,'revoked',i.revoked) order by i.expires_at desc) from private.invites i where i.family_id=family),'[]'::jsonb));
 end if;
 req:=(request->>'key')::uuid;
 if req is null then raise exception 'Missing request key';end if;
 -- All family administration shares one lock, including last-admin protection.
 perform pg_advisory_xact_lock(hashtextextended('identity:'||family::text,0));
 select * into existing from private.identity_commands where actor_id=actor and key=req;
 if found then if existing.body<>request then raise exception 'Idempotency conflict';end if;return existing.result;end if;
 if action='revoke' then
   if not admin_actor then raise exception 'Unauthorized';end if;
   select * into invite from private.invites where id=(request->>'id')::uuid and family_id=family for update;
   if not found or invite.used_at is not null then raise exception 'Invitation unavailable';end if;
   update private.invites set revoked=true where id=invite.id;
   target:=invite.id;before_value:=jsonb_build_object('revoked',invite.revoked);after_value:=jsonb_build_object('revoked',true);
 elsif action='member_active' then
   if not admin_actor or jsonb_typeof(request->'active')<>'boolean' or jsonb_typeof(request->'expected_active')<>'boolean' then raise exception 'Unauthorized';end if;
   select * into member from public.profiles where id=(request->>'id')::uuid and family_id=family for update;
   if not found or member.active is distinct from (request->>'expected_active')::boolean then raise exception 'Member conflict';end if;
   if member.id=actor or (member.role='admin' and not (request->>'active')::boolean and not exists(select 1 from public.profiles where family_id=family and role='admin' and active and id<>member.id)) then raise exception 'Cannot deactivate current or last administrator';end if;
   before_value:=jsonb_build_object('active',member.active);target:=member.id;
   update public.profiles set active=(request->>'active')::boolean where id=member.id;
   if not (request->>'active')::boolean then delete from auth.sessions where user_id=member.id;end if;
   after_value:=jsonb_build_object('active',(request->>'active')::boolean);
 elsif action='username' then
   new_name:=lower(btrim(request->>'username'));
   if new_name is null or new_name !~ '^[a-z0-9_]{3,32}$' then raise exception 'Invalid username';end if;
   select jsonb_build_object('username',username) into before_value from private.username_identities where user_id=actor for update;
   if before_value is null or before_value->>'username' is distinct from request->>'expected_username' then raise exception 'Username conflict';end if;
   update private.username_identities set username=new_name where user_id=actor;
   update public.profiles set name=new_name where id=actor;
   target:=actor;after_value:=jsonb_build_object('username',new_name);
 else raise exception 'Invalid identity action';end if;
 result:=jsonb_build_object('ok',true);
 insert into private.identity_commands values(actor,req,request,result);
 insert into public.audit_logs(actor_id,request_key,action,record_id,before_data,after_data) values(actor,req,'identity_'||action,target::text,before_value,after_value);
 return result;
end$$;
revoke all on function public.manage_identity(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_identity(uuid,jsonb) to service_role;

-- A claimed recovery token cannot be used to reset a different username, and a
-- disabled member cannot reactivate themselves using a previously issued token.
create or replace function public.claim_invite(token_digest text,reset_mode boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation private.invites;
begin
 select * into invitation from private.invites where token_hash=token_digest for update;
 if not found or invitation.revoked or invitation.used_at is not null or invitation.claimed_at is not null or invitation.expires_at<=now() or (invitation.reset_user is not null)<>reset_mode then raise exception 'Invalid invitation';end if;
 if not exists(select 1 from public.profiles where id=invitation.created_by and family_id=invitation.family_id and role='admin' and active) then raise exception 'Invalid invitation';end if;
 if reset_mode and not exists(select 1 from public.profiles where id=invitation.reset_user and family_id=invitation.family_id and active) then raise exception 'Invalid invitation';end if;
 update private.invites set claimed_at=now() where token_hash=token_digest;
 return jsonb_build_object('family_id',invitation.family_id,'reset_user',invitation.reset_user);
end$$;
