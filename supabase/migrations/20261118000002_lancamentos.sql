-- Etapa 2: lançamentos pessoais (Minhas finanças).
-- Cada pessoa só vê, cria, altera e apaga os próprios lançamentos.
-- Valores em centavos (inteiro) para não haver erro de arredondamento.

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  data date not null,
  descricao text not null check (length(trim(descricao)) between 1 and 80),
  categoria text not null check (length(trim(categoria)) between 1 and 40),
  valor_centavos bigint not null check (valor_centavos > 0),
  tipo text not null check (tipo in ('entrada', 'saida')),
  meio text not null check (meio in ('dinheiro', 'beneficio')),
  criado_em timestamptz not null default now()
);

comment on table public.lancamentos is 'Finanças individuais. meio: dinheiro ou beneficio (VR/VA), nunca somados juntos.';

create index lancamentos_dono_data on public.lancamentos (dono, data desc);

alter table public.lancamentos enable row level security;

revoke all on public.lancamentos from anon, authenticated;
grant select, insert, update, delete on public.lancamentos to authenticated;

create policy "ver os proprios lancamentos"
  on public.lancamentos for select to authenticated
  using (dono = (select auth.uid()));

create policy "criar os proprios lancamentos"
  on public.lancamentos for insert to authenticated
  with check (dono = (select auth.uid()) and public.eh_membro());

create policy "alterar os proprios lancamentos"
  on public.lancamentos for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid()));

create policy "apagar os proprios lancamentos"
  on public.lancamentos for delete to authenticated
  using (dono = (select auth.uid()));
