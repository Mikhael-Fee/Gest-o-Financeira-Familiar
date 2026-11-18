-- Etapa 1: perfis da família.
-- Cada pessoa tem uma conta no Supabase Auth e uma linha aqui com nome e papel.
-- Contas e perfis são criados pelo painel do Supabase (não há cadastro aberto).

create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 40),
  papel text not null check (papel in ('responsavel', 'filho')),
  criado_em timestamptz not null default now()
);

comment on table public.perfis is 'Membros da família. papel: responsavel (cuida da Casa) ou filho (ajuda a Casa).';

alter table public.perfis enable row level security;

-- Ninguém de fora acessa. Membros logados veem os nomes da família (necessário para a Casa).
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;

-- Função auxiliar: a pessoa logada tem perfil? (security definer evita recursão no RLS)
create function public.eh_membro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()));
$$;

revoke all on function public.eh_membro() from public, anon;
grant execute on function public.eh_membro() to authenticated;

create policy "membros veem a familia"
  on public.perfis for select
  to authenticated
  using (public.eh_membro());
