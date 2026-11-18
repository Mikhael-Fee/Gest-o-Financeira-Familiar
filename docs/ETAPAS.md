# Etapas

Cada etapa é uma branch e um pull request. A família testa no celular antes de seguir.

| Etapa | O que entrega | Situação |
|---|---|---|
| 1. Base | App instalável, login por usuário e senha, perfis da família (quem cuida da Casa e quem ajuda), telas vazias das três abas | PR #2 |
| 2. Minhas finanças | Lançar entradas e saídas, separar dinheiro de VR/VA, resumo do mês. Só a própria pessoa vê | PR #3 |
| 3. Casa | Despesas (só responsáveis lançam e marcam pago), ajuda de cada filho: valor fixo em dinheiro + benefício (VR/VA), filho marca "enviei" e responsável confirma, saldos separados de dinheiro e benefício. O filho pode "enviar para a Casa" ou "pagar uma despesa da Casa" direto; as duas formas contam como ajuda | PR #4 |
| 4. Privacidade | Cada pessoa escolhe mostrar nada, só a situação do mês, ou também os lançamentos (só leitura). Começa tudo privado | PR #5 |
| 5. Cartões | Cartões por banco com crédito e/ou débito (dia de fechamento e vencimento). Compra no crédito entra no mês em que a fatura vence; parcelada vira uma parcela por fatura; parcelamento em andamento (ex.: 7 de 10) cria só as parcelas que faltam. Cartão no nome de uma pessoa pode ser marcado como "usado por" outra: quem usa lança as próprias compras nele (só crédito), elas ficam na fatura do dono, em "A receber" para o dono e em "Você deve" para quem comprou, até o dono marcar "Recebi". Quem comprou pode tocar em "Paguei" e o dono só confirma | Em revisão |
| 6. Resumo | Aba Resumo só com os dados da própria pessoa: quanto gastou no mês e comparação com o anterior, gastos por categoria, maiores gastos, parcelas já marcadas nos próximos 6 meses, contas da Casa a pagar e sobra dos últimos 6 meses. Antes dela: tela mais limpa (Ajustes na engrenagem, quadro Pendências) | Em revisão |
| Depois | Empréstimos, previsões (ideias da especificação original), uma de cada vez | — |

## Regras combinadas com a família

- Finanças individuais são privadas por padrão.
- Na Casa, todos veem tudo; só os responsáveis lançam despesas e marcam pagamentos.
- Cada filho ajuda com um valor fixo em dinheiro mais o valor total de um benefício (ex.: o VR inteiro). O filho informa a ajuda e os responsáveis confirmam. Gastos próprios de VR/VA do filho ficam nas finanças dele.
- A ajuda pode ser "enviada" (entra no caixa da Casa) ou "paga direto" (o filho pagou uma despesa da Casa; a despesa aparece como paga por ele e não sai do caixa).
- Quando a renda varia (trabalho freelancer), o valor em dinheiro é informado a cada mês.
- Benefícios recebidos pelos responsáveis entram como receita da Casa.
- Dinheiro e benefício têm saldos separados (benefício só paga alimentação).
