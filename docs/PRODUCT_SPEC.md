# Produto e arquitetura implementada

> Atualização de 16/11/2026: implementação e homologação autenticada pública concluídas para testes com dados fictícios. Consulte [MATRIZ_DE_CONCLUSAO.md](MATRIZ_DE_CONCLUSAO.md) e [CONCLUSAO_HOMOLOGACAO.md](CONCLUSAO_HOMOLOGACAO.md) para recursos, evidências e limites operacionais.

A fonte de requisitos continua sendo `ESPECIFICACAO_CODEX.md`. Esta documentação descreve decisões verificáveis no código, sem substituir o contrato original.

O aplicativo **Entre Nós** usa React, TypeScript estrito, Vite, React Router, Zod e Supabase. A interface é em português, escura, responsiva, com navegação inferior no celular, formulários progressivos e mensagens de confirmação. Ícones Lucide e fontes locais evitam dependências externas de renderização.

## Fluxos disponíveis

- Demonstração em memória, explicitamente fictícia e descartável, separada da conexão Supabase. Não usa localStorage como banco de produção.
- Login por username/senha, cadastro por convite, recuperação por código e criação de convites pelo administrador em Configurações.
- Contas bancárias, dinheiro, VA e VR, saldo inicial/data de corte, transferências próprias e conciliação justificada.
- Receitas recebidas, classificação salário/extra, previsão salarial por mês, referência futura com data de vigência e entrada de empréstimo separada da renda operacional. Correção auditada do recebimento preserva sua competência e não cria outra entrada.
- Despesa direta ou no crédito, divisão entre dois meios; compra com parte pessoal e parte Casa, inclusive categorias diferentes. O agregado original permanece privado e a Casa recebe somente a parte compartilhada.
- Cartões com fechamento/vencimento, autorização/revogação pelo titular, parcelas futuras, visão das faturas por vencimento e acertos separados do pagamento bancário.
- Empréstimos em andamento com calendário completo ou parcial: quando a primeira data é desconhecida, número/data da próxima parcela ancoram somente os vencimentos conhecidos; as datas anteriores permanecem desconhecidas. Última parcela paga também pode ser desconhecida, sem presumir quitação. Inclui confirmação explícita de histórico, pagamentos fora de ordem, parciais e correções auditadas.
- Recorrências mensais fixas/variáveis, com 12 ocorrências idempotentes. Estimativas variáveis precisam de confirmação antes da baixa.
- Transporte de saldo e renegociação, encargos confirmados, cotação de quitação informada pelo credor, preservação da origem sem duplicar exigível.
- Estorno de pagamento preservando original e gerando crédito de correção auditado.
- Casa com metas flexíveis, contribuição por gasto efetivo e pagamento de obrigação compartilhada. Recargas de benefício não são contribuições.
- Relatórios com seis gráficos interativos: evolução de consumo pessoal/Casa, categorias, meios de pagamento, entradas/saídas de dinheiro, contribuições e planejamento de 12 meses. Comparação de 6/12 meses, filtros por categoria, conta/cartão autorizado e consumidor na Casa, seleção por toque/teclado e tabelas alternativas recolhidas. Pendências antigas e sem data permanecem separadas; exportação JSON é restrita por RLS.

## Decisões de implementação

Centavos inteiros são a unidade de domínio e persistência. Datas contratuais são `date`, sem conversão de fuso; “hoje” é calculado em America/Sao_Paulo. Fim de mês é ajustado a partir da data âncora, preservando o dia 31 nos meses seguintes.

Compras parceladas reconhecem o consumo total contratado na data da compra, e distribuem o passivo por vencimento. A soma das parcelas é o total contratado, não uma estimativa de principal ou CET. Encargos de renegociação só entram quando informados explicitamente. Não existe calculadora jurídica de contratos.

As funções SQL são a fronteira de escrita. A aplicação envia comandos com chave idempotente e versões, o banco valida permissões, trava registros e grava auditoria na mesma transação. O carregamento usa um único snapshot SQL com RLS, evitando mistura de tabelas de instantes diferentes e truncamento silencioso de listas.

Sessões ficam em memória e renovam enquanto a aplicação está aberta. Recarregar exige entrar novamente; essa escolha conservadora evita manter tokens no armazenamento do celular compartilhado. Não há promessa de lançamento offline.

Gráficos usam SVG nativo, responsivo e sem serviços externos ou novas dependências. Os seletores de relatório somam centavos inteiros; proporções e coordenadas são apenas apresentação. No filtro de fonte, uma compra dividida mostra somente o valor pago por aquela fonte. O gráfico de dinheiro usa data efetiva/corte da conta, inclui acertos e empréstimos como movimento, sem classificá-los como salário, e exclui aberturas, conciliações e transferências próprias.

Na visão Casa, gráficos e projeções usam somente despesas/obrigações compartilhadas e contribuições. Não aparecem salários, caixa ou metas particulares de outros membros. Uma fonte de pagamento cujo tipo não está autorizado no snapshot é identificada como privada, sem inferir banco ou benefício. Classificar todas essas fontes familiares por VA/VR/dinheiro exigirá um resumo servidor específico que preserve a privacidade.

O contexto acompanha a navegação: Casa é compartilhado; Contas/cartões e Configurações são pessoais. O Início compartilhado não apresenta saldo bancário, renda ou VA/VR pessoais. Contratos privados ficam no planejamento pessoal. Histórico de pagamentos respeita o mês e a visão; apenas o próprio pagador recebe a ação de estorno. Na Casa, Adicionar oferece despesa/recorrência inicialmente compartilhadas. Entrar novamente inicia em Meu espaço. A revisão e a comparação dos recursos estão em [REVISAO_MEU_ESPACO_CASA.md](REVISAO_MEU_ESPACO_CASA.md).

## Limites a avaliar antes de produção

A ampliação de 16/11 inclui orçamento mensal pessoal por categoria (avisos, cópia e próximos meses), metas privadas de economia/reserva com aportes/retiradas/estornos e conta opcional, disponível estimado até o salário e em 30/60/90 dias e histórico salarial robusto que reconhece aumentos recorrentes. Reservas de metas e de obrigações são validadas em conjunto contra o saldo, sem gerar caixa nem descontar compromissos duas vezes. A meta flexível da Casa permanece independente.

Recorrências aceitam cadências por dias/meses e edição individual, futura ou da regra, preservando histórico. Compra detalhada admite valores distintos por parcela e calendário automático com exceções ou calendário histórico explícito. Adiantamentos familiares separados permitem crédito excedente e compensação sem inflar renda. Etiquetas utilizadas podem ser renomeadas com auditoria. Importação CSV/OFX oferece prévia, correções, classificação explícita e deduplicação. O tutorial de nove etapas permite pular e reabrir. Notificações são internas; anexos, push e sincronização financeira offline não estão disponíveis. A retenção externa de backups e testes físicos dependem de configuração/validação operacional.

A autenticação deve ser homologada com o domínio técnico controlado e o provedor escolhido. Instalação nativa em Android/Samsung Internet/iOS e restauração em outro projeto/provedor precisam de validação específica. A restauração local incluindo Auth foi ensaiada em banco descartável com verificações RLS. Consulte `TEST_PLAN.md` e `DEPLOY.md` para o que foi efetivamente executado.
