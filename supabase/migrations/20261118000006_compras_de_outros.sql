-- Etapa 5 (ajuste): compras feitas no cartão de uma pessoa por outra da família.
-- Ex.: a Mãe usa um cartão que está no nome do filho e depois paga a ele.

alter table public.cartoes
  add column usado_por uuid references public.perfis (id) on delete set null;

alter table public.lancamentos
  add column de_quem uuid references public.perfis (id) on delete set null,
  add column reembolso_id uuid references public.lancamentos (id) on delete set null,
  add constraint lancamentos_de_quem_saida check (de_quem is null or tipo = 'saida');

create index lancamentos_de_quem on public.lancamentos (de_quem) where de_quem is not null;

-- Quem fez a compra no cartão de outra pessoa vê só essas compras (para saber quanto deve).
create policy "ver compras minhas no cartao de outros" on public.lancamentos for select to authenticated
  using (de_quem = (select auth.uid()) and public.eh_membro());

-- Registrar que recebeu o pagamento: cria uma entrada com a soma e liga as compras a ela.
create function public.registrar_reembolso(p_ids uuid[], p_data date, p_descricao text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_total bigint;
  v_qtd int;
  v_id uuid;
begin
  select coalesce(sum(valor_centavos), 0), count(*) into v_total, v_qtd
  from public.lancamentos
  where id = any(p_ids) and dono = (select auth.uid()) and de_quem is not null and reembolso_id is null;
  if v_qtd = 0 or v_qtd <> cardinality(p_ids) then
    raise exception 'Compras inválidas para reembolso';
  end if;
  insert into public.lancamentos (data, descricao, categoria, valor_centavos, tipo, meio)
  values (p_data, p_descricao, 'Reembolso', v_total, 'entrada', 'dinheiro')
  returning id into v_id;
  update public.lancamentos set reembolso_id = v_id where id = any(p_ids);
  return v_id;
end;
$$;
revoke all on function public.registrar_reembolso(uuid[], date, text) from public, anon;
grant execute on function public.registrar_reembolso(uuid[], date, text) to authenticated;

-- Quem usa o cartão de outra pessoa (ex.: a Mãe) vê esse cartão e lança as próprias compras nele.
-- A compra fica na conta do dono do cartão, marcada com de_quem = quem comprou, sempre no crédito.
create policy "ver cartoes que uso" on public.cartoes for select to authenticated
  using (usado_por = (select auth.uid()) and ativo and public.eh_membro());

create function public.cartao_usado_por_mim(c uuid, d uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.cartoes where id = c and dono = d and ativo and usado_por = (select auth.uid())); $$;
revoke all on function public.cartao_usado_por_mim(uuid, uuid) from public, anon;
grant execute on function public.cartao_usado_por_mim(uuid, uuid) to authenticated;

create policy "lancar compra no cartao que uso" on public.lancamentos for insert to authenticated
  with check (
    de_quem = (select auth.uid()) and dono <> (select auth.uid()) and public.eh_membro()
    and tipo = 'saida' and meio = 'dinheiro' and pagamento = 'credito' and reembolso_id is null
    and public.cartao_usado_por_mim(cartao_id, dono)
  );

-- Enquanto o dono não marcar "Recebi", quem comprou pode corrigir ou apagar.
create policy "alterar compra no cartao que uso" on public.lancamentos for update to authenticated
  using (de_quem = (select auth.uid()) and reembolso_id is null and public.cartao_usado_por_mim(cartao_id, dono))
  with check (
    de_quem = (select auth.uid()) and dono <> (select auth.uid())
    and tipo = 'saida' and meio = 'dinheiro' and pagamento = 'credito' and reembolso_id is null
    and public.cartao_usado_por_mim(cartao_id, dono)
  );

create policy "apagar compra no cartao que uso" on public.lancamentos for delete to authenticated
  using (de_quem = (select auth.uid()) and reembolso_id is null and public.cartao_usado_por_mim(cartao_id, dono));
