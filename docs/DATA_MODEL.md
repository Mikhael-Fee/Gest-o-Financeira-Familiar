# Modelo de dados

Migrations ordenadas em `supabase/migrations/`. Tabelas públicas têm RLS habilitada e leitura mínima por `authenticated`; escrita direta é negada por GRANT e ausência de políticas de escrita. Funções de comando fazem autorização explícita e transação ACID. `private` não está nos schemas expostos do PostgREST.

| Entidade | Propósito / acesso |
|---|---|
| families, profiles | Casa e membros; perfil aqui só contém nome de exibição, papel e situação, sem salário |
| accounts | abertura, tipo, corte; somente dono lê |
| cards | titular, calendário e usuários explicitamente autorizados |
| entries | consumo/receita, criador, consumidor, responsável, classificação, partes de pagamento, versão/anulação |
| purchase_groups | total original de compra dividida, privado; Casa só lê a parte familiar em entries |
| obligations | passivo, vencimento, origem/plano/recorrência, confirmação histórica e substituição |
| payments | alocações bancárias; original preservado quando estornado |
| plans | contratos/calendários privados, histórico explicitamente declarado |
| settlements, settlement_transfers | devedor/credor, envios e confirmações; participantes apenas |
| account_movements | transferências, acertos, conciliações e créditos de estorno; dono apenas |
| recurrences | regras mensais e ocorrências determinísticas, sem duplicação |
| income_settings | referência privada de salário e dia provável |
| income_months | previsão privada por proprietário/mês, com versão |
| income_references | referência privada com mês de vigência, preservando histórico |
| goals | meta flexível pessoal por mês |
| categories | categorias/subcategorias privadas, versão e desativação, sem apagar histórico |
| audit_logs | antes/depois e ator em eventos críticos; append-only para navegador |
| private.commands | deduplicação por ator + chave; payload idêntico obrigatório |
| private.username_identities | username normalizado → identidade técnica; acesso somente servidor |
| private.invites | hash de token, validade, uso, reivindicação e alvo de recuperação |
| private.rate_limits | orçamento persistente de tentativas, inclusive usuários inexistentes |

## Concorrência e consistência

Cada comando adquire advisory lock transacional por ator, depois row locks nos registros financeiros. Versão impede atualização perdida; idempotência impede repetição do mesmo pagamento. Comandos compostos compartilham transação: falha na segunda parte desfaz a primeira. Chaves de tentativa de formulário permanecem estáveis até sucesso ou encerramento do formulário.

`load_finances()` é SQL `SECURITY INVOKER`, lê um único snapshot e preserva políticas por tabela. Não usar views ou RPCs `SECURITY DEFINER` para exportação irrestrita. Helpers privilegiados têm `search_path` vazio e permissões de execução restritas.

O banco usa bigint em centavos com limite por valor de 100 bilhões de centavos, dentro da precisão exata JavaScript. Não há armazenamento de número completo de cartão, CVV, senha ou extrato bancário real.

## Auditoria e mudanças

Mudanças financeiras são comandos, não `UPDATE` pelo cliente. Estorno/anulação preservam originais. Alteração de vencimento/valor e renegociação exigem motivo/declaração explícita e geram antes/depois. Não executar hard delete para “corrigir” contas.

Não há objetos de Storage/anexos nesta versão. Portanto nenhuma política aberta de arquivos foi criada.

Tags e beneficiário são metadados do lançamento, separados de categoria, consumidor e responsável. Envios rejeitados/confirmados/estornados preservam datas distintas no histórico de acertos.

`entries.salary_month` separa competência salarial da data de recebimento. `plans.first_due` aceita ausência somente com âncora explícita `next_number`/`next_due`; `last_paid_known` distingue ausência de informação de nenhuma parcela paga. Obrigações de contrato podem ter `due_on` desconhecido, permanecendo visíveis sem serem atribuídas artificialmente a um mês.
