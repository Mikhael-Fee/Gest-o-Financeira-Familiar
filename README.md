# Finanças Familiares — projeto PWA

Aplicativo de finanças individuais e da Casa, planejado para uma família de quatro pessoas, com cartões compartilhados, empréstimos, parcelas, benefícios VA/VR, previsões e contribuições flexíveis.

## Estado do repositório

**Ambiente preparado para o Codex; a aplicação ainda não foi implementada.** Este repositório está público. Nenhuma conta real, dado bancário, senha ou chave deve ser armazenado aqui.

## Começar no Codex

1. Abra este repositório em uma tarefa do Codex.
2. O Codex lê as orientações do [AGENTS.md](./AGENTS.md), segundo a documentação oficial.
3. A especificação integral está em [docs/ESPECIFICACAO_CODEX.md](./docs/ESPECIFICACAO_CODEX.md).
4. Confira [docs/COMECE_AQUI.md](./docs/COMECE_AQUI.md) e [docs/SEGURANCA.md](./docs/SEGURANCA.md).
5. Peça: **"Implemente a aplicação descrita no repositório, respeitando o AGENTS.md e a especificação integral. Desenvolva, teste, documente; não publique em produção sem aprovação."**

## Escopo essencial

- Finanças pessoais privadas e orçamento Casa compartilhado.
- Salários previstos, reais e entradas extras; contas recorrentes variáveis.
- Cartões por banco, fechamento/vencimento e faturas, titular e usuário autorizado distintos.
- Transferência/reembolso entre familiares e confirmação separada do pagamento da fatura.
- Empréstimos existentes: número total, valor das parcelas, primeira data, última parcela paga, data efetiva, status desconhecido e atrasos.
- Compras parceladas com ou sem juros; dívida vencida não desaparece ao trocar de mês.
- VA e VR com saldos, recargas e compras que contam ou não como contribuição flexível à Casa.
- PWA dark-first, acessível, simples para celular e familiares pouco habituados a sistemas.
- Supabase com RLS, autenticação por nome de usuário mediada por serviço seguro, backups, testes automatizados.

A stack (React/TypeScript, Supabase/PostgreSQL e PWA) é uma preferência definida na especificação e pode ser refinada pelo Codex com justificativa.
