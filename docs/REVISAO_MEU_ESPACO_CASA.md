# Revisão de Meu espaço e Casa — 13/11/2026

## Resultado e limite desta etapa

A revisão foi feita antes das alterações, sobre a branch `feat/aplicativo-financas-familiares`, recuperada do GitHub sem apagar o histórico. Foram lidos os documentos de produto/segurança, o roteamento e os formulários de `App.tsx`, o domínio financeiro, os seletores/gráficos, o fluxo de identidade, o bootstrap e os testes.

Foram corrigidas inconsistências dos fluxos existentes. **A homologação autenticada pública ainda não está concluída.** Orçamentos pessoais, metas de economia/reserva e a nova previsão histórica não foram iniciados, respeitando a prioridade de concluir primeiro o acesso autenticado real.

## O que a revisão encontrou

1. O Início mantinha `bankBalance` e o saldo VA/VR do usuário quando o seletor identificava a visão como Casa.
2. A rota `/casa` mostrava dados compartilhados mesmo com Meu espaço selecionado; contas/configurações faziam o inverso quando se chegava nelas a partir da Casa.
3. Planejamento renderizava contratos privados em ambas as visões. O histórico de pagamentos usava toda a lista autorizada, sem recorte de visão/mês.
4. Adicionar, dentro da Casa, oferecia operações pessoais e iniciava despesas/recorrências sem marcar Casa. Isso permitia criar um registro pessoal e depois não encontrá-lo na visão compartilhada.
5. A busca e a visão escolhida podiam continuar de uma sessão/visão anterior. O grande cartão de contribuição dominava também o painel pessoal.
6. Os relatórios pessoais já atribuíam o consumo ao consumidor e separavam a parte destinada à Casa. Pagamentos de fatura, transferências e recargas não eram somados novamente ao consumo. Essa regra foi preservada.
7. A previsão histórica usa `conservativeSalary`, cujo resultado é limitado pela referência-base. Logo, ainda não satisfaz o novo requisito de reconhecer aumentos recorrentes acima dessa referência.
8. A tabela `goals` é a meta flexível de contribuição à Casa. Ela não representa economia pessoal nem reserva de emergência. Não há orçamento mensal pessoal por categoria nesta versão.

Um novo teste de navegador reproduziu o primeiro problema: após escolher Casa, encontrou o indicador pessoal “Saldo em contas”, que deveria estar ausente. O teste passou após a correção.

## O que foi corrigido

- O Início de Meu espaço mostra saldo bancário registrado **hoje**, receitas confirmadas, consumo próprio, obrigações e benefícios privados; o cartão grande de meta Casa foi reservado ao contexto Casa.
- O Início da Casa mostra consumo compartilhado, obrigações da Casa e contribuições registradas. Não mostra saldos bancários, renda ou saldo VA/VR pessoais.
- A navegação mantém o contexto correspondente à rota. Casa identifica a visão compartilhada. Contas/cartões e Configurações identificam Meu espaço. Ao escolher Casa nessas telas pessoais, a navegação leva à Casa; ao escolher Meu espaço na rota Casa, leva ao Início pessoal.
- Entrar novamente começa em Meu espaço. Trocar visão ou navegar limpa a busca anterior. As duas visões e os gráficos existentes continuam disponíveis.
- Contratos de empréstimo privados aparecem somente no planejamento pessoal. O planejamento da Casa preserva suas obrigações compartilhadas.
- Pagamentos pessoais são recortados pelo pagador e mês. A Casa mostra pagamentos de suas obrigações compartilhadas no mês, inclusive de vários pagadores. Só o próprio pagador recebe a ação de estorno, em acordo com a autorização SQL existente.
- Adicionar na Casa oferece despesa e recorrência compartilhadas, com Casa inicialmente marcada. As operações pessoais continuam disponíveis em Meu espaço.
- O consumo pessoal informa que inclui a parte do usuário destinada à Casa, sem adicionar contribuição ou pagamento da fatura uma segunda vez. As regras e as migrations financeiras não foram alteradas.

## Comparação atual

| Recurso | Meu espaço | Casa |
|---|---|---|
| Foco do Início | Dinheiro, consumo, compromissos e benefícios do usuário | Consumo, obrigações e contribuições compartilhadas |
| Contas e VA/VR | Contas próprias, abertura/corte, saldos e conciliação | Sem saldo pessoal no painel compartilhado |
| Renda/salário | Recebimento, extras, competência, ajustes mensais e simulações | Salários particulares não são mostrados |
| Consumo | Atribuído ao consumidor; parte pessoal e destinada à Casa identificadas nos gráficos | Somente despesas classificadas como Casa |
| Cartões | Próprias compras e acertos; titular vê a fatura integral conforme permissão | Gastos familiares preservam classificação e autoria; não recebem acesso geral a contas privadas |
| Empréstimos | Contratos privados, calendário, baixas, atrasos e histórico | Contratos privados não aparecem sob o rótulo Casa |
| Pagamentos | Desembolsos do próprio pagador no mês | Baixas de obrigações compartilhadas e múltiplos pagadores |
| Contribuição flexível | Acessível como colaboração, sem dominar o Início pessoal | Meta própria/realizado, sem criar dívida |
| Relatórios | Consumo, fontes, caixa, salário e projeção; sem duplicar fatura/consumo | Consumo, fontes autorizadas, contribuições e obrigações; sem salários/saldos privados |
| Orçamento mensal por categoria | **Pendente** | Funcionalidades atuais preservadas; não foi criado novo orçamento compartilhado |
| Economia e reserva de emergência | **Pendente**, separadas da meta Casa | Meta flexível existente preservada |
| Disponível estimado | **Pendente**; saldo registrado e obrigações continuam separados | Sem presumir que todo compromisso familiar seja dívida de um membro |

## Próximas funcionalidades, após a homologação pública

1. **Orçamento pessoal:** planejado e realizado por proprietário, categoria e mês, com RLS privada, versões e idempotência. Distinguir consumo pessoal de participação na Casa, sem somar novamente pagamentos de fatura.
2. **Metas financeiras:** economia/reserva com modelo próprio, histórico de aportes/correções e privacidade; não reutilizar `goals` nem gerar renda/movimento bancário fictício ao definir uma meta.
3. **Disponível estimado:** mostrar saldo bancário conhecido e compromissos em colunas distintas; descontar compromissos ainda abertos, sem descontar outra vez despesas já debitadas. VA/VR, créditos esperados de terceiros e despesas compartilhadas sem responsável não viram dinheiro bancário livre nem dívida pessoal presumida. Datas desconhecidas precisam continuar visíveis.
4. **Previsão histórica:** preservar o cenário conservador e criar cenário que use recorrência recente para reconhecer aumento habitual. Separar extras/bônus classificados; testar um bônus isolado, aumento repetido, meses faltantes, competência e histórico curto. Nenhuma previsão será marcada como recebimento.

Esses itens são requisitos da continuação, não funcionalidades já entregues nem decisões de autorização de produção.

## Homologação: bloqueio confirmado

- O ambiente ativo está na revisão **4**, com política aplicada que permite somente `api.github.com`, `api.netlify.com` e `api.supabase.com`.
- O rascunho contém também `entre-nos-homologacao.netlify.app` e `ovoqhnoaigjzihhpdukn.supabase.co`, mas esses hosts não estão na política ativa.
- Novas conexões para ambos retornaram `Tunnel connection failed: 403 Forbidden`.
- As ferramentas disponíveis leem o estado e salvam o rascunho; não há uma ação de ferramenta para executar o botão de aplicação/publicação do painel.
- A credencial de gerenciamento autorizada anteriormente foi verificada em memória e respondeu 200. Cadastro aberto permanece bloqueado e JWT configurado em 900 segundos. Nenhum valor de credencial foi incluído neste relatório.
- Antes dos testes remotos, havia **zero usuários e zero perfis**. Os 15 testes RLS passaram em transação com rollback; depois continuaram **zero usuários, zero perfis e zero lançamentos**. Isso não equivale a criar o administrador nem testar login público.

Na retomada, o proprietário informou que **salvou e publicou** a configuração. Ainda assim, a sessão observada permanece na revisão 4 e novas conexões HTTP/Chromium continuam negadas. O rascunho correto está na revisão 10; a política ativa do proxy confirma o desencontro. O [diagnóstico detalhado](HOMOLOGACAO.md#retomada-após-publicação-informada-da-rede--13112026) registra as evidências e a necessidade de vincular a continuação à versão publicada, sem repetir a solicitação de salvar ou pedir novos tokens.

Após resolver essa vinculação: confirmar os hosts em `environment_status`, provisionar um administrador fictício pelo Auth administrativo/`bootstrap_identity`, emitir/consumir convites e testar login, recuperação e privacidade na URL pública. A criação deve usar credencial aleatória, sem senha padrão, sem credenciais no relatório e sem desligar RLS/cadastro por convite.

A aplicação da configuração no painel é um pré-requisito operacional já autorizado, não uma nova solicitação de autorização. Não foi contornada a política de rede. A organização Grupo de Louvor não foi alterada.

O contrato da skill [cloud-environment-onboarding:setup](skill://plugin_connector_1p_ed5feb9070a08191b08c81c47947bc16/setup/SKILL.md) esclarece: “Saving persists configuration; it does not execute scripts, apply runtime changes, or publish.” Salvar pela ferramenta não comprova aplicação no runtime. A limitação observada é de conectividade/capacidade de aplicação, não falta de autorização do proprietário.

## Verificação nesta revisão

| Verificação | Resultado |
|---|---|
| `npm ci` | passou, com lockfile preservado |
| Lint e TypeScript | passaram |
| Domínio/PostgreSQL/PGlite | **89 testes passaram**, incluindo permissões e três novos recortes de pagamentos |
| Playwright | **45 testes passaram**, desktop/mobile/PWA/Auth sintético; dez novos casos de contexto |
| Acessibilidade | Axe A/AA nas telas já cobertas e no Início da Casa; teclado e largura mobile verificados |
| RLS em Supabase local | **15 pgTAP passaram**, rollback |
| API local real | passou: bootstrap, login, convite, reuso negado, privacidade HTTP, Pix/cartão, pagamento idempotente, salário/calendário parcial e recuperação |
| RLS no projeto remoto autorizado | **15 verificações passaram**, rollback e contagens posteriores zeradas |
| Login/convites/browser na URL pública | **não executados**, rede bloqueada; administrador remoto não criado |

## GitHub e publicação de homologação

As correções estão no commit `c493a2330f236295ffe01b7d94b53554d3949fbf`, na mesma branch e no [PR #1 em rascunho](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/pull/1), sem reescrever histórico nem mesclar `main`. O [CI completo passou](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/43413113205).

O Netlify compilou o código versionado por upload de `git archive`. Deploy `6af6eebc4013bee8334579c0`, `ready`, confirmado como publicado em https://entre-nos-homologacao.netlify.app às 08:04 (Brasília) de 13/11. Foram conferidos 19 arquivos públicos sem arquivos de ambiente/cache/servidor. Os builds automáticos permanecem pausados, pois a integração de clone GitHub/Netlify ainda precisa ser concluída. O deploy foi confirmado pela API; a navegação pública autenticada continua bloqueada pela rede deste ambiente.

Os testes de Auth sintético e os testes locais reais não substituem a homologação autenticada pública. Não houve nova migration, merge na `main`, mudança de plano ou uso de finanças reais.
