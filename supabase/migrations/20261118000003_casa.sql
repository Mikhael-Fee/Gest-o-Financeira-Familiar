-- Etapa 3: Casa.
-- Todos da família veem tudo da Casa. Só os responsáveis lançam despesas,
-- marcam pagamentos e confirmam ajudas. Cada filho informa a própria ajuda.

create function public.eh_responsavel()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.perfis where id = (select auth.uid()) and papel = 'responsavel'); $$;
revoke all on function public.eh_responsavel() from public, anon;
grant execute on function public.eh_responsavel() to authenticated;

-- Combinado de cada filho: valor fixo em dinheiro (vazio = varia todo mês) + um benefício.
create table public.combinados (
  filho uuid primary key references public.perfis (id) on delete cascade,
  dinheiro_centavos bigint check (dinheiro_centavos is null or dinheiro_centavos >= 0),
  beneficio_nome text not null default 'VR' check (length(trim(beneficio_nome)) between 1 and 20),
  beneficio_centavos bigint not null default 0 check (beneficio_centavos >= 0),
  atualizado_em timestamptz not null default now()
);

create table public.casa_despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  descricao text not null check (length(trim(descricao)) between 1 and 80),
  valor_centavos bigint not null check (valor_centavos > 0),
  meio text not null check (meio in ('dinheiro', 'beneficio')),
  status text not null default 'a_pagar' check (status in ('a_pagar', 'paga')),
  -- Preenchido quando um filho pagou direto do próprio bolso (não sai do caixa da Casa).
  paga_por uuid references public.perfis (id) on delete set null,
  criado_por uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  check (paga_por is null or status = 'paga')
);

create table public.casa_ajudas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  quem uuid not null default auth.uid() references public.perfis (id) on delete cascade,
  descricao text not null default 'Ajuda' check (length(trim(descricao)) between 1 and 80),
  valor_centavos bigint not null check (valor_centavos > 0),
  meio text not null check (meio in ('dinheiro', 'beneficio')),
  -- enviado: entrou no caixa da Casa. pago_direto: a pessoa pagou uma despesa da Casa.
  forma text not null default 'enviado' check (forma in ('enviado', 'pago_direto')),
  status text not null default 'informado' check (status in ('informado', 'confirmado')),
  despesa_id uuid references public.casa_despesas (id) on delete cascade,
  criado_em timestamptz not null default now(),
  check ((forma = 'pago_direto') = (despesa_id is not null))
);

create index casa_despesas_data on public.casa_despesas (data);
create index casa_ajudas_data on public.casa_ajudas (data);

alter table public.combinados enable row level security;
alter table public.casa_despesas enable row level security;
alter table public.casa_ajudas enable row level security;

revoke all on public.combinados, public.casa_despesas, public.casa_ajudas from anon, authenticated;
grant select, insert, update, delete on public.combinados, public.casa_despesas, public.casa_ajudas to authenticated;

-- Combinados: todos veem; o próprio filho ou um responsável ajusta.
create policy "familia ve combinados" on public.combinados for select to authenticated using (public.eh_membro());
create policy "ajustar combinado" on public.combinados for insert to authenticated
  with check (public.eh_membro() and (filho = (select auth.uid()) or public.eh_responsavel()));
create policy "alterar combinado" on public.combinados for update to authenticated
  using (filho = (select auth.uid()) or public.eh_responsavel())
  with check (filho = (select auth.uid()) or public.eh_responsavel());
create policy "apagar combinado" on public.combinados for delete to authenticated using (public.eh_responsavel());

-- Despesas: todos veem. Responsáveis fazem tudo.
-- Um filho só cria a despesa que ele mesmo já pagou, e só apaga essa enquanto a ajuda não foi confirmada.
create policy "familia ve despesas" on public.casa_despesas for select to authenticated using (public.eh_membro());
create policy "criar despesa" on public.casa_despesas for insert to authenticated
  with check (
    public.eh_responsavel()
    or (public.eh_membro() and criado_por = (select auth.uid()) and paga_por = (select auth.uid()) and status = 'paga')
  );
create policy "alterar despesa" on public.casa_despesas for update to authenticated
  using (public.eh_responsavel()) with check (public.eh_responsavel());
create policy "apagar despesa" on public.casa_despesas for delete to authenticated
  using (
    public.eh_responsavel()
    or (paga_por = (select auth.uid()) and not exists (
      select 1 from public.casa_ajudas a where a.despesa_id = casa_despesas.id and a.status = 'confirmado'))
  );

-- Ajudas: todos veem. Cada um informa a própria (fica "informado"); responsáveis registram e confirmam.
create policy "familia ve ajudas" on public.casa_ajudas for select to authenticated using (public.eh_membro());
create policy "informar ajuda" on public.casa_ajudas for insert to authenticated
  with check (
    public.eh_responsavel()
    or (public.eh_membro() and quem = (select auth.uid()) and status = 'informado')
  );
create policy "confirmar ajuda" on public.casa_ajudas for update to authenticated
  using (public.eh_responsavel()) with check (public.eh_responsavel());
create policy "apagar ajuda" on public.casa_ajudas for delete to authenticated
  using (public.eh_responsavel() or (quem = (select auth.uid()) and status = 'informado'));

-- Informar ajuda numa única operação. Se foi "pago_direto", cria também a despesa da Casa já paga.
-- security invoker: valem as mesmas regras de acesso acima.
create function public.informar_ajuda(
  p_data date, p_descricao text, p_valor_centavos bigint, p_meio text, p_forma text
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_despesa uuid;
  v_ajuda uuid;
begin
  if p_forma = 'pago_direto' then
    insert into public.casa_despesas (data, descricao, valor_centavos, meio, status, paga_por)
    values (p_data, p_descricao, p_valor_centavos, p_meio, 'paga', (select auth.uid()))
    returning id into v_despesa;
  end if;
  insert into public.casa_ajudas (data, descricao, valor_centavos, meio, forma, despesa_id)
  values (p_data, p_descricao, p_valor_centavos, p_meio, p_forma, v_despesa)
  returning id into v_ajuda;
  return v_ajuda;
end;
$$;
revoke all on function public.informar_ajuda(date, text, bigint, text, text) from public, anon;
grant execute on function public.informar_ajuda(date, text, bigint, text, text) to authenticated;
