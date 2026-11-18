-- Etapa 4: privacidade das finanças individuais.
-- Começa tudo privado. Cada pessoa escolhe o que mostra para a família:
--   nada      -> ninguém vê nada
--   situacao  -> a família vê só os totais do mês (entrou, saiu, sobra, VR/VA)
--   tudo      -> a família vê os totais e cada lançamento (só leitura)

create table public.privacidade (
  dono uuid primary key default auth.uid() references public.perfis (id) on delete cascade,
  nivel text not null default 'nada' check (nivel in ('nada', 'situacao', 'tudo')),
  atualizado_em timestamptz not null default now()
);

alter table public.privacidade enable row level security;
revoke all on public.privacidade from anon, authenticated;
grant select, insert, update on public.privacidade to authenticated;

create policy "familia ve o que cada um compartilha" on public.privacidade for select to authenticated using (public.eh_membro());
create policy "cada um escolhe o seu" on public.privacidade for insert to authenticated
  with check (dono = (select auth.uid()) and public.eh_membro());
create policy "cada um muda o seu" on public.privacidade for update to authenticated
  using (dono = (select auth.uid())) with check (dono = (select auth.uid()));

create function public.nivel_de(pessoa uuid)
returns text language sql stable security definer set search_path = ''
as $$ select coalesce((select nivel from public.privacidade where dono = pessoa), 'nada'); $$;
revoke all on function public.nivel_de(uuid) from public, anon;
grant execute on function public.nivel_de(uuid) to authenticated;

-- Com "tudo", a família pode ler os lançamentos (alterar e apagar continua só do dono).
create policy "familia ve lancamentos compartilhados" on public.lancamentos for select to authenticated
  using (public.eh_membro() and public.nivel_de(dono) = 'tudo');

-- Com "situacao" ou "tudo", a família pode ver os totais do mês, sem os lançamentos.
create function public.resumo_do_mes(pessoa uuid, mes date)
returns table (entrou bigint, saiu bigint, beneficio_recebido bigint, beneficio_gasto bigint)
language sql stable security definer set search_path = ''
as $$
  select
    coalesce(sum(valor_centavos) filter (where meio = 'dinheiro' and tipo = 'entrada'), 0)::bigint,
    coalesce(sum(valor_centavos) filter (where meio = 'dinheiro' and tipo = 'saida'), 0)::bigint,
    coalesce(sum(valor_centavos) filter (where meio = 'beneficio' and tipo = 'entrada'), 0)::bigint,
    coalesce(sum(valor_centavos) filter (where meio = 'beneficio' and tipo = 'saida'), 0)::bigint
  from public.lancamentos
  where dono = pessoa
    and data >= date_trunc('month', mes)::date
    and data < (date_trunc('month', mes) + interval '1 month')::date
    and public.eh_membro()
    and (pessoa = (select auth.uid()) or public.nivel_de(pessoa) in ('situacao', 'tudo'));
$$;
revoke all on function public.resumo_do_mes(uuid, date) from public, anon;
grant execute on function public.resumo_do_mes(uuid, date) to authenticated;
