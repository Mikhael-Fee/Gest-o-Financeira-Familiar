# Auditoria do núcleo financeiro — Entre Nós

Data: 17/11/2026 (Brasília). Escopo: atribuição econômica, disponível, cartões/empréstimos, coerência pessoal/Casa e segurança das operações financeiras. Somente dados fictícios nos testes. Os valores comparativos são verificados em etapas; os estornos deliberados posteriores reabrem os acertos sem apagar a etapa anterior. Branch `feat/aplicativo-financas-familiares`; [PR #1](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/pull/1). Sem merge, autorização de produção, novo projeto Supabase ou novo site.

## Resultado da investigação

As primeiras reproduções foram executadas antes das correções: **9 falhas em 13 casos de domínio**, e **2 falhas em 3 casos PostgreSQL/PGlite**. As falhas eram expectativas financeiras deliberadamente não satisfeitas pela implementação anterior, não resultados aprovados. Posteriormente as funções originais do commit `d6291bc` foram novamente empacotadas diretamente do Git para obter os valores comparativos abaixo, sem modificar a branch ou os dados remotos.

| Achado | Classificação e gravidade | Evidência e causa |
|---|---|---|
| Titular recebia contribuição pelo dinheiro reembolsado por outro familiar | Defeito confirmado, alta | R$500 de B, recebidos por A e pagos ao banco: contribuição A=500, B=0. `contribution()` somava o pagador da obrigação e ignorava o financiamento via acerto. |
| Adiantamento reembolsável virava contribuição definitiva | Defeito confirmado, alta | Com B=300 e banco=500, A recebia contribuição 500; não havia indicador dos 200 adiantados. |
| Pagamento direto deixava cobrança do mesmo valor no acerto | Defeito confirmado, alta | B pagava 500 ao banco: saldo 1.500, mas acerto permanecia 500 e livre caía indevidamente para 1.000. |
| Responsabilidade de terceiro podia ser atribuída unilateralmente | Defeito confirmado, alta | B criou compra em cartão autorizado de A com C responsável; domínio e comando SQL aceitaram sem participação de C. |
| Renegociação perdia os vínculos de cartão e Casa | Defeito confirmado, alta | O total consolidado de 1.150 já estava correto, mas a nova obrigação tinha `card_id=null`, `house=false`, e desaparecia do total da Casa. Isso também comprometia a futura atribuição do pagamento. |
| Limite global de identidade podia indisponibilizar familiares | Defeito reproduzido, média | 301 incrementos isolados esgotaram o orçamento global de 300/15min, embora uma identidade nova ainda tivesse orçamento individual. O servidor anterior verificava o global antes de qualquer identidade. Não se executou ataque na homologação pública. |
| Datas e saldo da demonstração divergiam das validações do servidor | Defeito confirmado, média | Cinco expectativas falharam: confirmação antes do envio, envio sem saldo, pagamento anterior ao corte, estorno antes da confirmação e devolução sem saldo. O servidor já tinha essas proteções. |
| Tabela financeira expandida sem acesso à rolagem por teclado | Defeito confirmado na homologação, média | Axe `scrollable-region-focusable` na tabela de contribuições aberta em celular; dois Playwright em 320px falharam antes da correção. A área recebeu foco, nome acessível e teste de navegação por teclado. |
| Disponível de R$700 e desconto apenas do restante pago | Comportamento correto, explicação ampliada | A fórmula obrigatória já resultava em 700; benefícios, reservas e receitas futuras já estavam separados. Faltava mostrar os acertos a receber separadamente. |
| Orçamento estrito e consumo pessoal com parte da Casa | Comportamento correto, explicação insuficiente | A base anterior já era orçamento=150, consumo atribuído=550 e contribuição=400. Os indicadores agora explicitam as diferentes perspectivas. |
| Empréstimos antigos, datas de vencimento e cotação | Sem novo defeito reproduzido nos casos exercitados | Mantidos os calendários e a distinção entre parcelas futuras e cotação. Não se presumiu histórico quitado. |

## Regras corrigidas e rastreabilidade

Cada parcela e pagamento de cartão tem `funding_parts`, com compra de origem e centavos atribuídos. O acerto tem `entry_id` explícito e `bank_credit`, separado do Pix confirmado. Alocações e transporte preservam cada centavo; várias parcelas da mesma compra são agregadas antes da redistribuição. O valor de uma compra, a dívida bancária e seus movimentos de caixa continuam entidades diferentes.

A contribuição segue dinheiro efetivamente fornecido:

- Compra direta da Casa em banco/VA/VR: contribuição do financiador na data da compra.
- Pix de reembolso: contribuição do devedor na **data da confirmação do recebimento**. A data de envio continua registrada no caixa; informar envio sozinho não confirma contribuição.
- Crédito antecipado: contribuição somente do valor alocado a uma compra da Casa, na **data da alocação**. O excedente não usado continua crédito; não é despesa nem salário.
- Pagamento bancário do titular com direito a reembolso: adiantamento, sem contribuição definitiva. A posição reembolsável é calculada por compra, abatendo reembolsos confirmados.
- Outro familiar que voluntariamente paga uma parcela da Casa com sua própria conta: contribuição desse familiar e crédito no acerto da compra. Não é criado um novo direito de reembolso contra terceiros. O comando recusa somar esse pagamento a um valor já enviado/confirmado para a mesma compra.
- Estorno: mantém o evento original e registra o valor negativo na data da devolução. Uma confirmação de novembro estornada em dezembro continua +500 em novembro e -500 em dezembro; o saldo atual do acerto reabre. Não há nova compra.

O relatório de contribuição respeita o mês desses eventos, não necessariamente o mês do consumo. A posição de adiantamento indica o valor ainda reembolsável **na posição atual**, sem fingir que é contribuição daquele mês. Compras pessoais em cartões compartilhados nunca entram na contribuição à Casa.

`house_financing()` fornece uma projeção familiar restrita, dentro do mesmo snapshot de `load_finances()`. Ela informa somente a compra compartilhada, membros, valores, datas e natureza do financiamento. Não fornece contas, saldos, identificadores de transferência ou acertos particulares. Assim, C consegue conferir a contribuição familiar de B sem ter acesso ao Pix privado entre A/B. A demonstração calcula o mesmo modelo a partir dos registros disponíveis; a verificação de saldo de uma contraparte privada permanece responsabilidade do servidor.

O disponível continua sendo saldo confirmado menos obrigações abertas, reservas adicionais e acertos a pagar. `bank_credit` reduz a pendência já paga diretamente; pagamentos efetivados não são novamente descontados como obrigação inteira. Acertos a receber aparecem separadamente e **não aumentam** o disponível nem as projeções de renda. Os filtros por data consideram pagamentos e seus estornos; isso não constitui uma reconstrução completa de versões antigas de todos os cadastros.

Os relatórios pessoais mostram consumo estritamente pessoal, consumo da Casa atribuído à pessoa, total de consumo atribuído antes de reembolsos e total financeiro assumido. Este último soma consumo estritamente pessoal e contribuição efetiva à Casa, como comparação analítica; não é saldo ou fluxo de caixa. Essa visão usa o mês inteiro, sem os filtros do gráfico de consumo, e a interface informa isso. O orçamento continua estritamente pessoal.

## Comparação financeira executada

Valores em reais. A/B/C são identidades exclusivamente fictícias.

| Cenário | Resultado esperado | Antes | Depois | Teste |
|---|---|---|---|---|
| Cartão compartilhado e reembolso total | Despesa 500; B contribui 500; A contribui 0 | A=500; B=0; consumo=500 | A=0; B=500; consumo=500 | `audit-financial-core`, `audit-financial-sql`, integração real local/pública |
| Reembolso parcial | B=300; pendente=200; A adianta 200; banco quitado | A=500; B=0; pendente=200; adiantamento não separado | A=0; B=300; pendente=200; adiantamento=200 | Domínio e integração real local/pública |
| Pagamento direto por familiar | Caixa cai 500; acerto zera, livre não perde mais 500 | Banco=1.500; pendente=500; livre=1.000 | Banco=1.500; pendente=0; livre=1.500 | Domínio, SQL, API real; também divisão B=200/C=300 |
| Fatura transportada | 800+300+50=1.150, uma dívida ativa com origem preservada | Consolidado=1.150; Casa=0, vínculo do cartão perdido | Consolidado=1.150; Casa/cartão preservados; encargos uma única vez | `database`, `audit-financial-core`, `audit-financial-sql`, API real |
| Empréstimo atrasado | Oitava mantém vencimento de outubro mesmo com nona paga | 8ª em 20/10; nenhum caixa inventado; histórico desconhecido permanece aberto | Mesmo comportamento, preservado | `finance`, `database`, `loan-details`; comparação com funções originais |
| Dinheiro disponível | 2.000−800−300−200=700; promessa de 500 fora do livre | 700, correto; valor a receber sem indicador próprio | 700; recebível 500 separado | `availability`, `audit-financial-core`, integração Auth/API local |
| Orçamento pessoal e Casa | Estrito=150; Casa=400; atribuído=550; contribuição=400 | Matemática correta, perspectivas pouco explícitas | Mesmos valores, bases identificadas | Domínio/API real; interface desktop/mobile verifica as bases e rótulos |
| Acesso a dados privados | Conta/contrato alheio e escrita direta negados | Proteções anteriores preservadas; atribuição de dívida indevida era aceita | Privacidade preservada e atribuição unilateral recusada | SQL/PGlite, 39 pgTAP, API real com duas famílias |

Outros casos exercitados: envio sem confirmação; confirmação antes do banco; banco antes do reembolso; pagamento parcial da fatura; reembolso parcial e restante; excesso convertido em crédito futuro; reversão de Pix, pagamento e alocação; compra pessoal; rateio de centavos, inclusive 500,03 em parcelas e encargo de 0,01.

As regressões de empréstimos exercitam: 9/10; oitava aberta com nona paga; histórico desconhecido; outubro pago em novembro; pagamentos parciais; renegociação; juros incorporados sem nova cobrança; principal/CET desconhecidos; quitação antecipada; cotação distinta da soma futura. A cotação não quita automaticamente o contrato. A previsão mantém os atrasados com suas datas e os informa separadamente, sem recriar despesas mensais.

As regressões de cartão exercitam os dois lados do fechamento, vencimento antes/depois do fechamento, ajuste aos meses de 28/29/30/31 dias, calendário excepcional informado pelo banco, parcelas variáveis, pagamento parcial, transporte e encargos. Não se assumiu calendário bancário real sem informação.

## Migrações e impacto histórico

- `202611170021_financial_attribution.sql`: adiciona vínculos de financiamento e crédito bancário; protege responsabilidade; preserva origem das renegociações; mantém serialização de requisições e projeção familiar restrita.
- `202611170022_identity_budget_isolation.sql`: permite ao servidor reconhecer convite válido antes de aplicar o orçamento para tentativas desconhecidas. A função não é executável pelo navegador.

A compatibilidade só reconstrói vínculos antigos quando o identificador da parcela/pagamento corresponde inequivocamente à compra. Registra `attribution_*_compatibility` em auditoria. Não altera valores de compra, pagamentos, contas, datas de caixa ou quitação histórica. Renegociações antigas ambíguas recebem `funding_review`, sem inventar compras de origem. Divergências de financiamento recebem aviso para conciliação. Uma mudança na contribuição histórica é uma correção analítica rastreável, não uma nova movimentação bancária.

Antes da aplicação remota foram encontrados seis lançamentos, dois pagamentos, um acerto, **duas parcelas com vínculo inequívoco**, nenhum transporte anterior e nenhum pagamento antigo de cartão por não titular. A cópia de 63 tabelas, incluindo funções e histórico de migrations, foi criptografada e reaberta para verificar o SHA-256. Chave e evidências privadas ficam fora do repositório e do build. As migrations foram aplicadas somente após os dois checks aprovados do commit `f9aed19`. O resumo dos dados financeiros originais permaneceu idêntico antes/depois. Depois dos testes públicos, foram novamente conferidos **118 registros originais em 20 tabelas públicas**, todos preservados. A comparação analítica de quatro pares membro/mês originais encontrou **zero alterações de contribuição na massa que já existia**; os novos cenários que reproduzem os defeitos foram inseridos em famílias fictícias separadas. As quatro reconstruções de vínculo (duas parcelas, um pagamento e um acerto) ficaram em auditoria, sem casos ambíguos na base existente.

## Segurança e autenticação

Todos os comandos mantêm `auth.uid()`, família ativa, autorização da conta/cartão, versões e idempotência. A camada adicionada serializa alterações compartilhadas por família antes dos bloqueios de ator/linha, evitando duas confirmações/pagamentos concorrentes. Famílias distintas não usam a mesma chave de bloqueio. Comandos antigos continuam sem execução pelos papéis de navegador; `search_path` das funções privilegiadas é vazio. Escrita direta em pagamentos/acertos permanece revogada.

Quem registra uma compra pode assumir a responsabilidade ou usar a responsabilidade já existente do titular do cartão. Para criar dívida pessoal de outro membro, esse membro precisa registrar a própria operação. Autorizar uso do cartão não autoriza transferir dívida a C. A validação PostgreSQL também cobre inserções internas de `purchase_v2` e compra dividida.

A autenticação mantém limite individual persistente de 10 tentativas/15min e 120 para gestão autenticada. Tentativas desconhecidas têm orçamento adicional de 300; logins cadastrados, convites válidos e administração autenticada não dependem desse orçamento. O esgotamento desconhecido produz erro genérico compatível com login inválido, evitando expor existência de username por diferença de status; o esgotamento individual mantém 429. Falha na persistência do limitador recusa a operação. Os limites nativos do Supabase não foram reduzidos. O teste local real também confirmou erro genérico 400 ao esgotar tentativas desconhecidas e sucesso 200 para login cadastrado, administração, convite válido e recuperação.

Teste Edge/Auth local real: esgotou-se o orçamento desconhecido no PostgreSQL local; login cadastrado, administração, resgate de convite e recuperação continuaram funcionando. Essa carga não foi enviada à URL pública. Ainda existe risco de bloqueio direcionado de uma identidade por seu próprio limite individual; não se alega proteção completa contra ataques distribuídos ou contra indisponibilidade de infraestrutura.

Orientações oficiais consultadas por HTTPS nesta execução (HTTP 200): [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções e SECURITY DEFINER](https://supabase.com/docs/guides/database/functions), [limites de Auth](https://supabase.com/docs/guides/auth/rate-limits).

## Arquivos principais e verificação

- `src/domain/funding.ts`, `finance.ts`, `availability.ts`, `reports.ts`, `advances.ts`: atribuição, posição reembolsável, datas/estornos e saldos.
- `src/data/fundingCommands.ts`, `store.ts`: vínculos dos comandos da demonstração, restrições de responsabilidade e validações de datas/saldo.
- `src/App.tsx`, componentes `Reports`, `AvailabilityPanel`, `FamilyAdvances`, `ReportCharts`: explicações e indicadores, sem novos gráficos ou navegação.
- `server/identity.ts`, `identityLimits.ts`: isolamento do orçamento de autenticação.
- Testes `audit-financial-core`, `audit-financial-sql`, `audit-identity-budget`, helper PostgreSQL e pgTAP `financial-attribution.test.sql`; E2E `financial-audit.spec.ts`.
- `scripts/verify-financial-core.mjs` e `verify-financial-browser.mjs`: verificações manuais autenticadas, limitadas ao backend/site existentes e usuários fictícios; fora da execução automática do CI.
- `eslint.config.js`: ignora artefatos transitórios de navegador/cache para evitar disputa entre lint e execução de testes.

Resultados finais: lint, typecheck e build aprovados localmente e no CI; **210 testes de domínio/SQL/UI**, **67 Playwright no CI final** e **39 pgTAP locais + 39 remotos**. Localmente passaram a suíte completa anterior de 65 Playwright e os quatro casos específicos finais (incluindo os dois novos casos da tabela); não se somam repetições como testes diferentes. Auth/API real usa cinco identidades fictícias e duas famílias na bateria final, com confirmações e pagamentos simultâneos produzindo exatamente um efeito. Casos mínimos também confrontam a mesma matemática entre TypeScript e dados carregados do PostgreSQL. Evidências operacionais com credenciais ficam em área privada, sem traces autenticados ou uploads ao CI. Lint, typecheck e build são revalidados no CI do commit entregue.

## Homologação pública e versão

**Concluída.** As publicações foram feitas somente depois dos respectivos checks de CI aprovados. O site e backend existentes respondem por HTTPS neste ambiente. `version.json` do site retornou 200; a rota de saúde Supabase sem chave retornou 401, confirmando conectividade sem confundir falta de autenticação com bloqueio de túnel. As chamadas de gerenciamento usam o proxy disponibilizado pelo ambiente, com TLS preservado. Para a integração local, apenas o serviço interno Docker `kong` recebeu a exceção de proxy necessária à comunicação entre containers.

A primeira publicação auditada foi o commit `f9aed196e00dc6eabbd0704bf1da4e5b84b5af9e`, deploy `6afc9ed7c7a5d4ec02681e23`, com [CI aprovado](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/44148723981). Publicação estática de 21 arquivos, verificada por `version.json`; Edge `identity` versão 5 ativa, compilada do mesmo código. Banco com 22 migrations.

Foram aprovados **39 pgTAP remotos**, capturando explicitamente cada uma das 15/12/12 asserções dentro de transações revertidas; não se confundiu apenas o retorno final da API SQL com a suíte inteira.

A integração Auth/Edge/PostgREST pública real repetiu todos os cenários financeiros do verificador com cinco usuários e duas famílias fictícias. Confirmou B=500/A=0, parcial B=300/adiantamento=200, divisão direta B=200/C=300 sem pendência duplicada, crédito 600/alocado 500/excedente 100, transporte 1.150 e disponível 700 com recebível 500 fora do livre. Confirmações e pagamentos simultâneos tiveram um único efeito. Foram negadas escrita direta, função antiga, dívida atribuída a C, acesso a conta/contrato privado e acesso entre famílias.

Uma bateria pública adicional com quatro identidades fictícias validou convite e uso único, cadastro aberto negado, revogação, desativação com RLS, recuperação real, senha anterior e link reutilizado recusados, além das regressões de cartão, VA, parcelas antigas, orçamento/metas, salário e importação repetida. A senha do proprietário não foi usada nem alterada.

No navegador público, os valores pessoais e o recebível/disponível foram conferidos. O membro sem participação no acerto viu a contribuição de B na tabela familiar sem ver contas, compras pessoais ou transferências A/B. A verificação da tabela aberta revelou a falha de foco descrita acima. O roteiro também foi ajustado para abrir a tela de configurações antes da saída, aguardar a página principal em celulares com menu recolhido e abrir a tabela alternativa antes de ler valores. A publicação final é o commit **`7127db1b022b616a49a053740cbcaaa4a046a5e3`**, deploy **`6afca30875864f2928681772`**, com os dois checks aprovados: [push](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/44152142709) e [PR](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/44152153016). Os logs registram 210 testes e 67 Playwright aprovados. `version.json` público confirmou o mesmo SHA e revisão de assets `86a64d72f0fa`; o artefato de 21 arquivos foi exportado do Git, compilado com chave publicável e verificado contra presença de credenciais privadas. Nenhuma alteração de backend ocorreu entre as duas publicações.

**Navegador público final aprovado sem interceptação ou mocks:** um usuário em desktop 1366×900 e dois usuários distintos em celular emulado 393×851. Foram conferidos os totais pessoais (650 estritos, 3.500 atribuídos à Casa, 4.150 de consumo total e 3.150 assumidos na massa com várias compras), acerto de pagamento direto zerado, contribuição de B visível a C sem exposição do Pix/contas privados, disponível 700 e recebível 500 separado. Em cada sessão: zero violações Axe AA, largura preservada, saída e recarga sem dados autenticados. A tabela aberta de contribuições foi incluída no Axe. A demonstração pública também carregou corretamente.

As cópias protegidas antes/depois abrangeram 63 tabelas e foram verificadas por decifragem e comparação de hash; não se declara um novo ensaio completo de restauração de infraestrutura nesta auditoria. O site continuou com builds automáticos pausados; somente as publicações manuais autorizadas de homologação foram realizadas. O commit posterior deste relatório não altera o código nem o artefato publicado. O PR #1 permanece aberto e em rascunho para revisão do proprietário.

## Limitações deliberadas

Renegociações novas misturando cartões diferentes ou despesas pessoais e da Casa são recusadas: cada grupo deve ser conciliado separadamente. Descontos que alterem a base de uma compra com reembolso vinculado e mudanças diretas de valor dessas parcelas são recusados, em vez de perdoar ou transferir dívida de terceiros silenciosamente. A correção automática de uma renegociação antiga sem origem comprovável não está autorizada; exige conciliação explícita dos registros.

O saldo é uma estimativa com os dados informados. Contas sem conferência recente, obrigações sem data ou histórico desconhecido continuam sinalizados; não há conexão automática com bancos, cálculo de CET não informado ou confirmação inventada. Testes automatizados não substituem validação em aparelhos reais, leitores de tela ou conciliação com extrato bancário. Recuperação invalida as sessões renováveis; JWTs já emitidos obedecem à expiração do provedor. A desativação do perfil bloqueia RLS imediatamente. Não houve uso da senha pessoal do proprietário, dados financeiros reais, acesso ao Grupo de Louvor, merge ou autorização de produção.
