-- One statement / one MVCC snapshot. SECURITY INVOKER preserves every RLS policy.
create function public.load_finances() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
'profiles',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.profiles t),'[]'::jsonb),
'accounts',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.accounts t),'[]'::jsonb),
'cards',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.cards t),'[]'::jsonb),
'entries',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.entries t),'[]'::jsonb),
'obligations',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.obligations t),'[]'::jsonb),
'payments',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.payments t),'[]'::jsonb),
'plans',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.plans t),'[]'::jsonb),
'settlements',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.settlements t),'[]'::jsonb),
'goals',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.goals t),'[]'::jsonb),
'account_movements',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.account_movements t),'[]'::jsonb),
'recurrences',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.recurrences t),'[]'::jsonb),
'settlement_transfers',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.settlement_transfers t),'[]'::jsonb),
'income_settings',coalesce((select jsonb_agg(to_jsonb(t.*)) from public.income_settings t),'[]'::jsonb)
)$$;
revoke all on function public.load_finances() from public,anon;
grant execute on function public.load_finances() to authenticated;
