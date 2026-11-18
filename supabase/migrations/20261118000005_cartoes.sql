-- Etapa 5: cartões, débito/crédito e parcelamentos.
-- Compras no crédito viram um lançamento por parcela, com a data do vencimento
-- da fatura em que cada parcela cai. Assim a "sobra do mês" mostra o que sai da conta.

create table public.cartoes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  banco text not null check (length(trim(banco)) between 1 and 30),
  apelido text check (apelido is null or length(trim(apelido)) between 1 and 30),
  tem_credito boolean not null default true,
  tem_debito boolean not null default false,
  dia_fechamento smallint check (dia_fechamento between 1 and 31),
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  check (tem_credito or tem_debito),
  check (not tem_credito or (dia_fechamento is not null and dia_vencimento is not null))
);

alter table public.cartoes enable row level security;
revoke all on public.cartoes from anon, authenticated;
grant select, insert, update, delete on public.cartoes to authenticated;

create policy "ver os proprios cartoes" on public.cartoes for select to authenticated using (dono = (select auth.uid()));
create policy "criar os proprios cartoes" on public.cartoes for insert to authenticated with check (dono = (select auth.uid()) and public.eh_membro());
create policy "alterar os proprios cartoes" on public.cartoes for update to authenticated using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "apagar os proprios cartoes" on public.cartoes for delete to authenticated using (dono = (select auth.uid()));

-- Lançamentos ganham forma de pagamento, cartão e parcela.
alter table public.lancamentos
  add column pagamento text check (pagamento in ('debito', 'credito')),
  add column cartao_id uuid references public.cartoes (id) on delete set null,
  add column compra_id uuid,
  add column parcela smallint check (parcela >= 1),
  add column parcelas smallint check (parcelas >= 1 and parcelas <= 48),
  add column data_compra date,
  add constraint lancamentos_parcela_valida check (
    (parcela is null and parcelas is null) or (parcela is not null and parcelas is not null and parcela <= parcelas)
  ),
  add constraint lancamentos_credito_e_saida check (pagamento is null or (tipo = 'saida' and meio = 'dinheiro'));

create index lancamentos_compra on public.lancamentos (compra_id) where compra_id is not null;

-- O cartão usado precisa ser da própria pessoa.
create function public.cartao_eh_meu(c uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select c is null or exists (select 1 from public.cartoes where id = c and dono = (select auth.uid())); $$;
revoke all on function public.cartao_eh_meu(uuid) from public, anon;
grant execute on function public.cartao_eh_meu(uuid) to authenticated;

drop policy "criar os proprios lancamentos" on public.lancamentos;
create policy "criar os proprios lancamentos" on public.lancamentos for insert to authenticated
  with check (dono = (select auth.uid()) and public.eh_membro() and public.cartao_eh_meu(cartao_id));

drop policy "alterar os proprios lancamentos" on public.lancamentos;
create policy "alterar os proprios lancamentos" on public.lancamentos for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid()) and public.cartao_eh_meu(cartao_id));
