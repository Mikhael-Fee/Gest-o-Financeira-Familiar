# Regras financeiras e correções

## Três eixos

1. **Consumo:** entries `expense`, sem os pagamentos de fatura ou dívida. Uma compra dividida tem partes cuja soma é o total original. Encargos bancários confirmados são custos separados.
2. **Obrigações:** valor contratado menos confirmação histórica e alocações ativas de pagamentos. Uma obrigação substituída por renegociação soma zero no exigível atual, sem perder vencimento/histórico original.
3. **Caixa:** abertura na data de corte + entradas/saídas diretas confirmadas + movimentos de transferência/conciliação/estorno − pagamentos bancários. Histórico anterior ao corte não fabrica movimentos.

Eventos de caixa, saldos de abertura e pagamentos confirmados não aceitam data efetiva futura; previsões usam Planejamento. O saldo atual também exclui movimentos posteriores a hoje. Recarga VA/VR só afeta a carteira. Empréstimo recebido só afeta caixa, nunca salário, e exige vínculo com contrato já cadastrado que representa o passivo. Transferência própria ou Pix de acerto não cria receita operacional nem novo consumo. Ajuste de conciliação não é renda.

## Datas e parcelas

Datas usam `YYYY-MM-DD`. A âncora 31/01 gera 28/02 (29 em ano bissexto), 31/03 etc. Datas já vencidas não são movidas ao trocar de mês. Um pagamento em novembro de parcela vencida em outubro continua ligado ao vencimento original.

Informar “última paga: 8” confirma somente a oitava. Confirmar todas as anteriores exige uma declaração explícita. Na ausência dela, 1–7 continuam “Histórico a conferir”. Baixa individual permite pagar 9 deixando 8 em aberto. O painel mostra maior número quitado e próxima obrigação aberta separadamente.

Se a primeira data for desconhecida, informar número e vencimento da próxima parcela cria datas somente a partir dessa âncora. Parcelas anteriores permanecem sem vencimento conhecido; não são atribuídas retroativamente a meses nem escondidas do passivo. Se a última paga também for desconhecida, nenhuma parcela recebe confirmação automática. Há lista separada de obrigações sem data para conferência.

Pagamentos são positivos, não excedem o saldo em aberto e exigem conta autorizada. Conta precisa de saldo registrado suficiente; se divergir do banco, faça conciliação justificada. Histórico anterior ao corte tem confirmação própria, sem débitos de conta. Pagamentos podem ser estornados na data efetiva da correção; o original permanece auditável. Não se estorna uma alocação já incorporada em renegociação.

## Crédito

Compra no dia de fechamento entra no ciclo atual (default explícito, sem simular feriados); depois entra no seguinte. Se vencimento é anterior/igual ao dia de fechamento, cai no próximo mês do ciclo. Ajustes específicos são registrados por obrigação com motivo.

O total financiado é dividido em N centavos inteiros; centavos remanescentes vão às primeiras parcelas. O titular deve ao banco; o consumo é atribuído ao consumidor. O responsável pelo acerto pode ser outro membro explicitamente indicado. O titular vê fatura integral; usuário autorizado vê somente suas linhas e acertos.

Transporte/renegociação liga origens às novas obrigações. Exemplo: 800 anteriores + 300 de compras + 50 de encargos = 1.150 exigíveis, não 1.950. Uma cotação de quitação pode reduzir a soma futura, se informada pelo credor; não é calculada pelo aplicativo.

## Acertos e Casa

Pix informado é pendente. Somente o credor confirma, com conta de destino e data de recebimento. Os movimentos nas duas contas são criados na confirmação, com datas de envio/recebimento preservadas. A fatura continua aberta até sua baixa independente. Envios pendentes podem ser rejeitados com motivo, sem movimentar caixa. Uma confirmação incorreta pode ser estornada pelo credor: os dois movimentos são corrigidos e o acerto reabre, com original preservado. A API recusa excedentes; ainda não existe carteira de adiantamentos familiares.

A Casa não atribui um responsável permanente ao cadastrar uma conta; cada baixa identifica pagador. Uma obrigação compartilhada aceita pagamentos por membros autorizados da mesma Casa. Os identificadores das contas não permitem consultar saldos ou nomes privados.

Meta flexível = referência, realizado, falta ou excedente; **não é dívida**. Contribuição vem de despesa direta da Casa efetivamente financiada pelo usuário ou pagamento de obrigação Casa, sem contar duas vezes o consumo. Recarga e uso pessoal de benefício não contam. Transferência para financiamento de caixa Casa não foi implementada: não deve ser cadastrada como nova despesa para aumentar contribuição.

Em compra pessoal/Casa, os meios de pagamento são repartidos proporcionalmente, com cálculo inteiro e resto explícito. A descrição compartilhada é separada para não revelar detalhes pessoais.

Acordo de renegociação guarda data efetiva separada do primeiro novo vencimento; encargos confirmados são reconhecidos na data do acordo. Corrigir valor de conta recorrente já parcialmente paga corrige também o consumo vinculado, em uma transação e com antes/depois na auditoria.

## Salário previsto e recebido

A previsão é privada e admite ajuste para um mês específico. Alterar também a referência futura cria uma vigência a partir do mês escolhido, preservando a referência anterior e os ajustes de outros meses. Isso não cria receita, saldo nem confirmação de recebimento.

Recebimentos têm competência salarial separada da data efetiva de caixa. O valor confirmado substitui a previsão daquela competência no planejamento; extras permanecem separados. Correção exige a versão atual, conta bancária/dinheiro própria e data efetiva não futura, atualiza o registro uma vez e preserva antes/depois na auditoria. Versão ausente, nula ou antiga é recusada. VA/VR não recebe salário nem crédito de empréstimo.
