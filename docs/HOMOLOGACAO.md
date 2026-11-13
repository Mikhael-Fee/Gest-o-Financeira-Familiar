# Relatório de homologação — 12/11/2026

## Endereços e escopo

- Aplicativo publicado: https://entre-nos-homologacao.netlify.app
- Painel Netlify: https://app.netlify.com/projects/entre-nos-homologacao
- Supabase autorizado: https://supabase.com/dashboard/project/ovoqhnoaigjzihhpdukn
- PR em rascunho: https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/pull/1
- CI validado: https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/43320253320

O proprietário selecionou o projeto existente na organização **Finanças casa** para esta homologação. A verificação inicial encontrou zero tabelas da aplicação, zero usuários e zero funções. Foi mantida sua região `us-east-1` e o plano Free. A organização **Sistema Grupo de Louvor não foi alterada**. Não houve contratação, mudança de plano, uso de dados financeiros reais ou merge na `main`.

## Implementação e configuração concluídas

O aplicativo inclui contas, salários/receitas, VA/VR, despesas com múltiplos meios e divisão pessoal/Casa, cartões compartilhados, faturas, Pix informado/confirmado, parcelas, empréstimos antigos, pagamentos parciais, renegociação, contribuições flexíveis, projeções, categorias e exportação autorizada. Os limites de produto estão em [PRODUCT_SPEC.md](PRODUCT_SPEC.md).

Foram acrescentados salário previsto por mês, referência com vigência futura, competência salarial separada da data de caixa e correção versionada/auditada do recebimento. Em empréstimos com primeira data desconhecida, somente as datas a partir da próxima parcela informada são calculadas; o histórico anterior permanece desconhecido e visível, sem pagamentos presumidos.

No Supabase, as 11 migrations foram aplicadas em transações com registro das versões originais. Todas as tabelas públicas têm RLS e não permitem escrita direta pelo navegador. Cadastro público/anônimo está bloqueado, senha mínima tem 12 caracteres e o JWT dura 15 minutos. A função `identity` está ativa; login e convites validam suas próprias regras. Origem e redirects ficam restritos ao endereço da homologação.

O frontend recebeu somente URL Supabase e chave publishable. Chaves administrativas permanecem fora do frontend e do Git. `APP_ORIGIN` e o domínio de identidades técnicas usam `entre-nos-homologacao.netlify.app`, controlado pelo site desta homologação. O domínio técnico não é uma caixa de correio nem serviço de recuperação por e-mail.

## Publicação Netlify e GitHub

O deploy `6af63f8a68af7be68e5e9fb4` terminou com estado `ready` e foi confirmado como o deploy publicado no endereço principal do site. O código publicado veio de `git archive` do commit `452e8286f76ad27087814f7bdb4b1e9c7da060b5`, da branch `feat/aplicativo-financas-familiares`, e foi compilado pelo Netlify.

O vínculo de repositório/branch está cadastrado, mas o clone automático falhou na preparação SSH. A integração GitHub disponível negou a criação de uma deploy key com `403 Resource not accessible by integration`. Foi utilizado o upload do código versionado para concluir a publicação. A chave Netlify criada para essa tentativa foi removida, pois não chegou a ser usada.

Builds automáticos foram pausados para evitar novas tentativas dessa conexão incompleta; o aplicativo publicado continua disponível. Para ativar deploy por push, concluir a autorização do aplicativo GitHub no painel Netlify, selecionar somente este repositório/branch e validar um build. Não configurar a `main` como produção nesta etapa.

## Validação executada

- Lint, tipos e build passaram.
- **75 testes** de domínio/PostgreSQL passaram, incluindo privacidade, dinheiro inteiro, idempotência, concorrência, calendário parcial e salário mensal.
- **21 testes Playwright** passaram localmente, em desktop/mobile/PWA, incluindo verificações automatizadas de acessibilidade e cache offline.
- **15 testes pgTAP de RLS** passaram no Supabase local após aplicar as 11 migrations em uma base descartável.
- Integração HTTP local com Supabase Auth, PostgREST e Edge reais passou: convites, cadastro aberto negado, privacidade, cartão/Pix, pagamento concorrente, salário/correção, calendário parcial e recuperação.
- Backup local e restauração em banco descartável passaram: contagens financeiras, novas tabelas salariais, identidades Auth e 15 verificações RLS após restauração.
- **15 verificações pgTAP de RLS passaram no Supabase remoto**, em transação com rollback. A conferência posterior confirmou zero usuários, famílias e lançamentos residuais.
- CI remoto do commit publicado passou. Nenhum trace, credencial ou exportação financeira foi enviado a artifacts públicos.

## Pendências para encerrar a homologação

O ambiente de execução ainda está na revisão de rede anterior, que permite somente as APIs de gerenciamento. Os hosts `ovoqhnoaigjzihhpdukn.supabase.co` e `entre-nos-homologacao.netlify.app` foram acrescentados ao rascunho; o proprietário precisa usar **Salvar rascunho** nas configurações do ambiente para aplicá-los.

Depois dessa liberação, falta criar o primeiro administrador fictício via Auth administrativo e bootstrap, emitir convites e testar login, recuperação, persistência, concorrência e privacidade diretamente na URL pública. **Esses testes autenticados públicos ainda não foram executados.** Os testes locais e o estado `ready` não os substituem. Ainda não há credencial de primeiro acesso a entregar.

Também permanecem validação em aparelhos físicos, ensaio de restauração entre projetos/provedores, retenção externa criptografada e os recursos de produto explicitamente pendentes em `PRODUCT_SPEC.md`. Antes de produção, revisar essas pendências e obter autorização para dados reais e publicação definitiva. Tokens enviados por chat devem ser substituídos no campo seguro do ambiente; nenhum valor foi incluído no repositório.

## Etapa seguinte: relatórios visuais

Foram implementados seis gráficos interativos, com filtros, comparação mensal, fontes de pagamento, projeção e contribuições; consulte `PRODUCT_SPEC.md` e `GUIA_FAMILIA.md`. A visão Casa preserva dados particulares. O cenário histórico de renda agora usa a mediana na simulação sem ser sobrescrito pelas referências futuras; o cenário de referência continua respeitando ajustes por mês. As receitas confirmadas continuam substituindo a previsão.

O login passou a selecionar o perfil pelo ID retornado pelo Auth, evitando erro de resultado singular em famílias com vários membros. Os testes de frontend desse fluxo usam respostas sintéticas interceptadas e não configuram o primeiro administrador remoto.

A execução corrente passou em lint, tipos, build e 86 testes de domínio/banco. A suíte de navegador passou nos 35 casos, incluindo gráficos e Auth sintético. A rede pública foi consultada novamente nesta etapa: o proxy respondeu `Tunnel connection failed: 403 Forbidden` para os dois hosts. Assim, bootstrap e testes autenticados na URL pública continuam pendentes da aplicação do rascunho de rede. Nenhum projeto ou dado do Grupo de Louvor foi acessado nesta etapa e nenhuma migration nova foi necessária.

### Publicação desta etapa

A versão com gráficos, commit `2e56b74599249dbf3e079bdcfe1f8348e4b0b089`, foi publicada em 12/11/2026 às 21:44 (Brasília), no deploy `6af65d30026a1d5ece5764a3`. A API Netlify confirmou `ready`, o deploy no endereço principal e 19 arquivos públicos, sem arquivos de ambiente/cache/servidor. Os builds automáticos foram novamente pausados após essa publicação manual autorizada. O endereço continua https://entre-nos-homologacao.netlify.app .

O seletor de mês também preserva o último período válido quando o campo é limpo, evitando erro de renderização dos relatórios. Essa regressão e a revisão visual/acessível foram verificadas novamente em desktop e celular. O CI completo do commit de gráficos passou: https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/43339278411 .

## Revisão de Meu espaço e Casa — 13/11/2026

A revisão corrigiu a mistura de indicadores pessoais sob o rótulo Casa, o contexto das rotas, a exposição visual de contratos privados na visão compartilhada e o recorte mensal do histórico de pagamentos. Meu espaço mantém seu painel privado; Casa preserva suas funcionalidades. Os gráficos continuam disponíveis, com consumo, obrigações e caixa separados. Consulte [a comparação completa e as pendências individuais](REVISAO_MEU_ESPACO_CASA.md).

Lint, tipos, build, **89 testes de domínio/banco** e **45 casos Playwright** passaram. Foram repetidos os **15 testes RLS locais**, a integração local real de Auth/PostgREST/Edge e as **15 verificações RLS remotas com rollback**. Após a transação remota, continuaram zero usuários, perfis e lançamentos. Não foi repetido o ensaio de restauração nesta revisão, que não altera migrations. O CI completo de `c493a2330f236295ffe01b7d94b53554d3949fbf` passou: https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/43413113205 .

As correções foram publicadas **somente no site de homologação**, usando o código versionado de `c493a2330f236295ffe01b7d94b53554d3949fbf`. Deploy `6af6eebc4013bee8334579c0`, publicado em 13/11/2026 às 08:04 (Brasília): a API confirmou `ready`, o deploy no endereço principal e 19 arquivos públicos sem ambiente/cache/servidor. Os builds automáticos foram novamente pausados. Não houve merge na `main`, alteração de plano ou dados reais.

**A homologação autenticada pública continua bloqueada.** O runtime observado permanece na revisão 4, permitindo as três APIs de gerenciamento, enquanto os dois hosts públicos constam apenas no rascunho. As ferramentas disponíveis salvam propostas; a aplicação dessa configuração precisa ocorrer no painel do ambiente. A configuração já autorizada não está aplicada e novas conexões foram negadas pelo proxy com `403 Forbidden`. Portanto, não foi criado o administrador remoto e os testes públicos de login/convites/privacidade não foram executados.

Orçamentos pessoais por categoria, metas de economia/reserva, disponível estimado e nova previsão histórica que reconheça aumentos permanecem pendentes, respeitando a ordem solicitada: concluir primeiro o bootstrap e a homologação autenticada na URL pública.
