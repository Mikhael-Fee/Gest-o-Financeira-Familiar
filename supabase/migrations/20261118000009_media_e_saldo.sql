-- Ajuste da Etapa 7: fixo com valor pela média e saldo inicial para o saldo acumulado.
-- Só cria coisas novas, sem DROP. Depende da 0008.

-- Sugerir a média dos últimos 3 meses (ex.: salário com hora extra).
alter table public.recorrentes
  add column usar_media boolean not null default false;

-- Saldo inicial: quanto a pessoa tinha em conta no mês em que começou a usar o app.
-- O saldo acumulado = saldo inicial + sobras (entradas - saídas em dinheiro) desde esse mês.
create table public.saldos_iniciais (
  dono uuid primary key default auth.uid() references public.perfis (id) on delete cascade,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  valor_centavos bigint not null
);

alter table public.saldos_iniciais enable row level security;
revoke all on public.saldos_iniciais from anon, authenticated;
grant select, insert, update, delete on public.saldos_iniciais to authenticated;

create policy "ver o proprio saldo inicial" on public.saldos_iniciais for select to authenticated
  using (dono = (select auth.uid()));
create policy "criar o proprio saldo inicial" on public.saldos_iniciais for insert to authenticated
  with check (dono = (select auth.uid()) and public.eh_membro());
create policy "alterar o proprio saldo inicial" on public.saldos_iniciais for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "apagar o proprio saldo inicial" on public.saldos_iniciais for delete to authenticated
  using (dono = (select auth.uid()));
