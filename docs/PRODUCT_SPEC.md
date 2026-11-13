# Produto e arquitetura implementada

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

## Limites a avaliar antes de produção

O escopo original também prevê recursos que ainda precisam de ampliação: múltiplas cadências além da mensal, regras de recorrência “esta e seguintes”, adiantamentos familiares acima do saldo devido, edição de tags já utilizadas, anexos e onboarding guiado multipágina. Categorias/subcategorias têm criação, edição e desativação; tags e beneficiário podem ser informados no lançamento. Ajustes salariais mensais e referências futuras são persistidos; a mediana conservadora permanece uma simulação sem persistir versões de cenários alternativos. As limitações são explícitas; não se deve interpretar esta entrega como homologação integral de todos os itens do contrato.

A autenticação deve ser homologada com o domínio técnico controlado e o provedor escolhido. Instalação nativa em Android/Samsung Internet/iOS e restauração em outro projeto/provedor precisam de validação específica. A restauração local incluindo Auth foi ensaiada em banco descartável com verificações RLS. Consulte `TEST_PLAN.md` e `DEPLOY.md` para o que foi efetivamente executado.
