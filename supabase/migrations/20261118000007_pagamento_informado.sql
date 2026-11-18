-- Etapa 5 (ajuste): quem comprou no cartão de outra pessoa avisa pelo app que já pagou.
-- O dono do cartão confirma com "Recebi" (registrar_reembolso), como já era.
-- Só cria coisas novas, sem DROP.

alter table public.lancamentos
  add column pagamento_informado_em date;

-- Security definer porque quem comprou pode já não usar o cartão (e aí não teria permissão de alterar a linha).
-- Mexe só nessa coluna, e só nas compras da própria pessoa que ainda não foram recebidas.
create function public.informar_pagamento(p_ids uuid[], p_data date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_qtd int;
begin
  if not public.eh_membro() or p_data is null then
    raise exception 'Não permitido';
  end if;
  update public.lancamentos
    set pagamento_informado_em = p_data
  where id = any(p_ids) and de_quem = (select auth.uid()) and dono <> (select auth.uid()) and reembolso_id is null;
  get diagnostics v_qtd = row_count;
  if v_qtd = 0 or v_qtd <> cardinality(p_ids) then
    raise exception 'Compras inválidas';
  end if;
  return v_qtd;
end;
$$;
revoke all on function public.informar_pagamento(uuid[], date) from public, anon;
grant execute on function public.informar_pagamento(uuid[], date) to authenticated;
