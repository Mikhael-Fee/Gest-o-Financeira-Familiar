-- Service-only recognition before rate budgeting. No identity information is exposed to browsers.
create function public.identity_invite_valid(token_digest text,reset_mode boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.invites where token_hash=token_digest and not revoked and used_at is null and claimed_at is null and expires_at>now() and (reset_user is not null)=reset_mode)
$$;
revoke all on function public.identity_invite_valid(text,boolean) from public,anon,authenticated;
grant execute on function public.identity_invite_valid(text,boolean) to service_role;
