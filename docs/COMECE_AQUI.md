# Orientação de execução para o Codex

## Sua tarefa

Implemente integralmente o produto descrito em `docs/ESPECIFICACAO_CODEX.md`. As orientações no `AGENTS.md` são permanentes. Este repositório foi preparado para você, **sem código de aplicação**: construa a solução do zero.

Não peça que o usuário copie arquivos nem repita o escopo: já está todo aqui. Faça primeiro uma leitura global, identifique as invariantes financeiras e os requisitos de segurança, e progrida por marcos verificáveis. Tempo de execução não deve ser priorizado em detrimento da correção.

## Ordem recomendada

1. Escolha arquitetura e dependências estáveis; crie projeto React/TypeScript/PWA, lint, testes e pipeline de CI; documente decisões.
2. Modele PostgreSQL e migrations, RLS por operação e testes de privacidade; prepare autenticação por convite/username sem segredos no frontend.
3. Construa núcleo financeiro (contas, categorias, salários, fluxo de caixa, recorrência, despesas por pessoa/Casa, pagamentos parciais, datas de competência e vencimento).
4. Cartões e faturas com fechamentos, parcelamentos e acertos; caso compartilhado da Pessoa A/Pessoa B com confirmação de Pix e quitação distinta.
5. Empréstimos antigos/atuais, histórico desconhecido, última parcela paga, atrasos e renegociação sem duplicidade.
6. Carteiras VA/VR, contribuições flexíveis, divisões de compras, painéis e previsões.
7. Onboarding simples, relatórios, acessibilidade, instalação PWA, CI, backups e testes E2E/RLS.
8. Antes de produção, documente execução local, configuração segura do Supabase, limites de planos e procedimentos de backup/restauração.

## Critério de qualidade

- Cada etapa precisa de comportamento verificável e testes, não só protótipos.
- Exibir estado de pagamento desconhecido quando não houver confirmação.
- Nunca converter saldo de transferência familiar em renda extra.
- Não criar dupla contagem de consumo ao pagar cartão ou dívida.
- Não vincular dados reais sem autorização; forneça ambiente de demonstração somente com dados fictícios.
- Mostre evidências dos testes e diferenças entre escopo concluído e pendente.

## Prompt curto sugerido

> Leia o AGENTS.md e os quatro documentos em docs/. Implemente o sistema completo do início ao fim seguindo a especificação integral, em etapas testáveis. Não pare no planejamento. Não publique em produção, não exponha segredos e não use dados reais. Documente os testes e pendências.
