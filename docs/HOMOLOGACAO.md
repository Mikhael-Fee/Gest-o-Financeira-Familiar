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
