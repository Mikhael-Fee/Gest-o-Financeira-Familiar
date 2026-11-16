# Matriz de conclusão — 16/11/2026

Esta matriz confronta o contrato original (`ESPECIFICACAO_CODEX.md`) e a missão de conclusão enviada em 16/11. **O produto ainda não está integralmente homologado.** Implementação local, testes automatizados, publicação e testes públicos são evidências distintas.

## Mapeamento dos requisitos

| Requisito da missão / contrato original | Implementação verificável | Testes / evidência | Estado nesta etapa |
|---|---|---|---|
| 3 Meu espaço independente / original 1,3,19 | Contexto pessoal em App; contas/salários/contratos privados; Planejamento pessoal separado da Casa | scope.test, E2E scope | Existente preservado; novas telas requerem regressão final |
| 4 Salário e três cenários / original 7,18 | availability.ts, SalaryPanel, incomePlanning, migration014; histórico recente sem teto obrigatório na base, competência/data prevista/recebida e bônus separados | availability.test, income-planning-database, E2E availability | Implementado localmente; não publicado |
| 5 Orçamentos / original 18 | personal.ts, PersonalPlanning, migration012; categoria/mês, realizado, restante, percentual, aviso, cópia e vigências futuras | personal.test, personal-database, personal-ui, E2E personal | Implementado localmente; não publicado |
| 6 Economia e reserva pessoal / original 18 | Modelo próprio savings_goals/savings_movements; aportes/retiradas/estornos, conta vinculada opcional, previsão; não movimenta caixa | personal tests; autorização/RLS e versões | Implementado; integração de reservas precisa revisão adicional |
| 7 Disponível estimado / original 18 | AvailabilityPanel; horizontes próximo salário/30/60/90, obrigações/faturas/atrasos, reservas, confiabilidade, VA/VR separados | availability e income-planning-database | Implementado; reservas conjuntas têm pendência de validação agregada |
| 8 Contas, bancos e conciliação / original 5 | Contas próprias, bancos iniciais e Outro, múltiplas contas, data de corte, reconcile, account_check | finance/database/homologation-finance; novos income tests | Existente ampliado; saldo continua declarado pelo usuário |
| 9 Recorrências / original 8 | recurrence.ts, RecurrenceManager, migration013; dias/meses, presets semanal/quinzenal/bimestral/trimestral/semestral/anual, geração determinística, edição ocorrência/futuras/regra preservando passado | recurrence.test e recurrence-database | Implementado localmente; regressão de navegador específica ainda necessária |
| 10 Compras parceladas / original 11 | purchase_v2, cronograma com valores distintos, preço original opcional, juros informados e histórico de abertura sem caixa fictício | recurrence tests | Implementado localmente; não publicado |
| 11 Cartões/calendário/limite / original 9 | CardManager, cards.ts, migration017; limite estimado, exceção de ciclo, reatribuição auditada, configuração de novas compras | card-calendar.test; regressões antigas de ciclo | Implementado; confirmar integração purchase_v2 com exceções de ciclo |
| 12 Compartilhamento/Pix/adiantamento / original 10,16 | Acerto informado/confirmado/rejeitado/estornado; family_advances e allocations separados das faturas, crédito reutilizável rastreável | database/homologation-finance e recurrence-database | Existente ampliado; novos adiantamentos precisam E2E/integração HTTP |
| 13 Fatura atrasada/renegociada / original 9 | Vínculos replaced_by, encargos confirmados, pagamento parcial, 800+300+50 sem duplicação | finance e database | Existente; sem novo teste público |
| 14 Empréstimos independentes / original 12 | Plan, LoanDetails, migration018; instituição/modalidade/principal/CET opcionais, periodicidade e histórico desconhecido | loan-details e suites existentes | Implementado localmente; sem calculadora de taxas inventadas |
| 15 Pagamento fora de ordem / original 12,23 | Obrigações individuais; maior parcela paga separada da primeira aberta; calendário parcial e quitação informada | finance/database/homologation-finance | Existente preservado; resumo usa vencimento efetivo da última parcela |
| 16 Casa independente / original 14 | Despesas compartilhadas sem responsável obrigatório; pagador por baixa, vários pagadores, relatórios compartilhados | scope/reports/database e E2E scope | Existente; saldos/salários/metas privadas excluídos |
| 17 Meta flexível Casa / original 15 | goals separado de savings_goals; contribuição por consumo direto/pagamento sem criar dívida | finance/reports/database | Existente; não há tesouraria própria da Casa |
| 18 VA/VR / original 13 | Carteiras separadas, splits, recargas reais e novas previsões future_receipts kind benefit | finance/database e income planning | Existente ampliado; previsão não aumenta saldo |
| 19 Relatórios / original 18 | Seis gráficos preservados, filtros/tabelas 6/12 meses; novos painéis de orçamento/metas/disponível e avisos atípicos | reports tests; novos alerts; E2E existente | Indicadores ampliados; nem todo indicador novo tem gráfico dedicado |
| 20 Categorias/subcategorias/tags / original 6 | Categoria privada versionada/desativável; TagsPanel/tag com renomeação de tags utilizadas auditada, beneficiário separado | import-database/import; database categoria | Implementado; categoria padrão continua selecionável/dispensável |
| 21 Importação/exportação / original 23,24 | ImportPanel CSV/OFX, prévia/mapeamento/correção/classificação explícita/deduplicação por fonte; JSON autorizado | import.test, import-database, E2E import | Implementado localmente; conferir com diferentes formatos fictícios de bancos |
| 22 Interface e acessibilidade / original 19 | Português, dark, componentes existentes e módulos novos, mensagens de erro preservam formulários | E2E desktop/mobile e Axe; UI unit tests | Regressão consolidada necessária; não substituir avaliação humana |
| 23 Onboarding / original 19,23 | Onboarding nove etapas, pular/reabrir; usa os formulários reais, Casa opcional | onboarding.test e E2E import | Implementado localmente |
| 24 PWA/avisos / original 20 | Cache somente shell/assets; offline não salva finanças; novos avisos internos por vencimentos/orçamento/consumo atípico | E2E PWA existente, alerts.test | Push não implementado; aparelhos físicos não validados |
| 25 Identidade/RLS / original 3,4,22 | IdentityAdminPanel, identity manage, migration016; revogar convite, desativar/reativar membro, username próprio, ativação por fragmento e reset | identity-admin.test, activation-link; suites RLS | Implementado localmente; HTTP real e público pendentes |
| 26 Administrador do proprietário / original 4 | provision-admin e verify-admin-browser preparados, senha temporária aleatória/ativação única limitada, segredo fora do Git | Helpers preparados; **não executados remotamente** | **Conta não criada, sem acesso a entregar** |
| 27 Auditoria/integridade / original 17,21 | RPCs transacionais, locks, versão, comandos deduplicados; bigint/centavos e trilha antes/depois | PostgreSQL/PGlite em suites antigas e novas | Aplicado no desenho; revisar integração de todos os wrappers novos |
| 28 Backup / original 24 | backup/test-restore existentes; secure-backup AES-256-GCM e procedimento BACKUP_OPERACIONAL | secure-backup.test; ensaio anterior histórico separado | Criptografia testada; novo dump/restauração integral ainda não ensaiados |
| 29 GitHub/CI/Netlify / original 26 | Branch/PR existentes preservados; CI anterior; novos arquivos locais | SHA remoto inicial coincide com PR #1 | Novo CI/deploy ainda não executados; main intacta |
| 30–31 Testes e homologação / original 25 | Suites novas de domínio/SQL/UI/navegador, scripts HTTP reais e públicos preparados | Consultar RELATORIO_FINAL_2026-11-16.md para resultados desta execução | **Homologação pública não concluída** |
| 32–33 Pronto e relatório / original 28 | Esta matriz e relatório de encerramento refletem limites reais | Evidências por camada, sem credenciais | **Produto ainda não liberado para dados reais** |

## Bloqueios e limitações concretas

1. A rede está funcional: Supabase health sem chave responde 401 e site Netlify 200. Tokens de gerenciamento foram verificados somente nos serviços autorizados. O bloqueio anterior de túnel não ocorre nesta tarefa.
2. Antes de publicar, revisar validação conjunta de metas e reservas para obrigações: os dois módulos validam contra saldo separadamente e podem aceitar destinação agregada acima do saldo disponível. O indicador distingue reservas de movimentos, mas isso não elimina a necessidade dessa validação.
3. Integrar exceções de fechamento/vencimento também ao comando de compra detalhada purchase_v2 e testar o calendário completo com parcelas variáveis.
4. As migrations012–019 são novas e locais; não foram aplicadas remotamente. Elas não substituem/regravam as migrations anteriores.
5. As novas suites E2E precisam execução consolidada sem runners concorrentes. Resultados parciais/artefatos conflitantes não são aprovação.
6. Supabase local foi iniciado com Auth saudável, mas a nova rodada de pgTAP, Auth/Edge/API, backup e restauração não foi concluída no encerramento solicitado.
7. O administrador remoto e usuários fictícios adicionais ainda não existem. Login, convites, recuperação, sessões e finanças públicas continuam pendentes.
8. Os agentes foram interrompidos por limite de uso da plataforma; o usuário solicitou finalizar a etapa. Nenhuma limitação técnica foi disfarçada como aprovação.

Anexos permanecem opcionais e ausentes. Não há integração com bancos por senha, notificações push, sincronização financeira offline ou autorização de produção. Instalação em Android/Samsung Internet/iOS físicos e leitores de tela depende de validação específica posterior.
