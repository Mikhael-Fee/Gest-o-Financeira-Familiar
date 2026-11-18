-- Etapa 7: lançamentos fixos (repetem todo mês), limite de gasto por categoria e saldo inicial.
-- Só cria coisas novas, sem DROP. Tudo é privado: cada pessoa vê e mexe só no que é seu.

-- Lançamento fixo: o app mostra no mês os que ainda não foram lançados, e a pessoa confirma.
create table public.recorrentes (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  descricao text not null check (length(trim(descricao)) between 1 and 80),
  categoria text not null check (length(trim(categoria)) between 1 and 40),
  valor_centavos bigint not null check (valor_centavos > 0),
  tipo text not null check (tipo in ('entrada', 'saida')),
  meio text not null check (meio in ('dinheiro', 'beneficio')),
  pagamento text check (pagamento in ('debito', 'credito')),
  cartao_id uuid references public.cartoes (id) on delete set null,
  dia smallint not null check (dia between 1 and 31),
  desde text not null check (desde ~ '^[0-9]{4}-[0-9]{2}$'),
  ativo boolean not null default true,
  usar_media boolean not null default false, -- sugerir a média dos últimos 3 meses (ex.: salário com hora extra)
  criado_em timestamptz not null default now(),
  constraint recorrentes_cartao check (pagamento is null or (tipo = 'saida' and meio = 'dinheiro'))
);

alter table public.recorrentes enable row level security;
revoke all on public.recorrentes from anon, authenticated;
grant select, insert, update, delete on public.recorrentes to authenticated;

create policy "ver os proprios fixos" on public.recorrentes for select to authenticated
  using (dono = (select auth.uid()));
create policy "criar os proprios fixos" on public.recorrentes for insert to authenticated
  with check (dono = (select auth.uid()) and public.eh_membro() and public.cartao_eh_meu(cartao_id));
create policy "alterar os proprios fixos" on public.recorrentes for update to authenticated
  using (dono = (select auth.uid()))
  with check (dono = (select auth.uid()) and public.cartao_eh_meu(cartao_id));
create policy "apagar os proprios fixos" on public.recorrentes for delete to authenticated
  using (dono = (select auth.uid()));

-- O lançamento guarda de qual fixo e de qual mês veio, para nunca lançar o mesmo mês duas vezes.
alter table public.lancamentos
  add column recorrente_id uuid references public.recorrentes (id) on delete set null,
  add column recorrente_mes text check (recorrente_mes ~ '^[0-9]{4}-[0-9]{2}$'),
  add constraint lancamentos_recorrente_mes check (recorrente_id is null or recorrente_mes is not null);

create unique index lancamentos_recorrente_unico on public.lancamentos (recorrente_id, recorrente_mes)
  where recorrente_id is not null;

-- Limite de gasto por categoria (por mês).
create table public.limites (
  dono uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  categoria text not null check (length(trim(categoria)) between 1 and 40),
  valor_centavos bigint not null check (valor_centavos > 0),
  primary key (dono, categoria)
);

alter table public.limites enable row level security;
revoke all on public.limites from anon, authenticated;
grant select, insert, update, delete on public.limites to authenticated;

create policy "ver os proprios limites" on public.limites for select to authenticated
  using (dono = (select auth.uid()));
create policy "criar os proprios limites" on public.limites for insert to authenticated
  with check (dono = (select auth.uid()) and public.eh_membro());
create policy "alterar os proprios limites" on public.limites for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));
create policy "apagar os proprios limites" on public.limites for delete to authenticated
  using (dono = (select auth.uid()));

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
