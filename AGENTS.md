# Instruções de desenvolvimento para o Codex

## Objetivo e fontes

Você implementará uma aplicação financeira familiar real, e não apenas telas estáticas. Antes de alterar código, **leia integralmente**:
1. `docs/ESPECIFICACAO_CODEX.md` — contrato principal de produto, regras financeiras e testes.
2. `docs/COMECE_AQUI.md` — sequência de trabalho e critérios de entrega.
3. `docs/SEGURANCA.md` — restrições para repositório público e dados pessoais.
4. `docs/DECISOES.md` — decisões de produto já estabelecidas.

Este repositório foi preparado só com documentos; **você é responsável por criar toda a implementação e os testes**. Quando documentos divergirem, prefira a especificação integral e registre divergências antes de alterar o comportamento.

## Regras inegociáveis

- Interface toda em português do Brasil, modo escuro por padrão, foco em mobile/PWA e simplicidade para os pais.
- Separar consumo/despesa, obrigação e fluxo de caixa. Não contar a compra no crédito e o pagamento da fatura duas vezes.
- Preservar vencimentos históricos; dívida vencida não migra de mês por recriação da compra. Ao rolar saldo de fatura, manter vínculos contábeis sem duplicação.
- Empréstimos existentes exigem quantidade, data da primeira parcela, valor, última parcela paga e data do pagamento; NUNCA inferir que parcelas antigas estão todas quitadas.
- Contribuição flexível à Casa não gera obrigação nem saldo devedor.
- Uma pessoa pode ser titular do cartão, outra consumidora, outra responsável financeira e outra pagadora.
- Não presumir pagamento: distinguir pago, parcialmente pago, vencido e sem confirmação.
- Todas as operações financeiras precisam ser auditáveis, idempotentes e consistentes em concorrência. Usar quantias com precisão decimal/centavos inteiros, sem float para contabilidade.
- RLS e GRANTs adequados para cada tabela exposta do Supabase; testes de acesso negado. Administrador da Casa não obtém acesso automático aos detalhes privados.
- Nunca publicar credenciais, dados familiares verdadeiros, chaves secretas ou arquivos .env no Git. Não enviar `service_role` ou secret keys ao navegador.
- Não criar Supabase/Netlify em produção nem executar migrations remotas, fazer deploy público ou inserir dados reais sem autorização expressa.

## Processo de execução

- Planeje as fases resumidamente, mas prossiga implementando, executando testes e corrigindo; não pare no planejamento.
- Instale dependências apenas no contexto do projeto; prefira versões estáveis, compatíveis e atualizadas conforme documentação oficial.
- Crie README atualizado, migrations, exemplos de ambiente, seeds fictícios, testes unitários, integrados, E2E e políticas RLS testáveis.
- Sempre que houver comandos `lint`, `typecheck`, `test` e `build`, execute-os antes da entrega; documente falhas ou indisponibilidades e não declare resultados não verificados.
- Faça commits legíveis e preserve o histórico. Antes de mesclar na main, valide o resultado. Se possível, desenvolva em branch de recurso.
- Não exponha dados financeiros em logs, relatórios de CI ou screenshots públicas.
- Quando precisar de decisões não especificadas, escolha defaults prudentes e documente; só solicite usuário quando necessário.
- Entregue relatório final em português: implementado, testes executados, pendências, riscos, como iniciar localmente e quais configurações de Supabase/hospedagem ainda faltam.

## Estrutura implementada e validação local

A aplicação agora usa React/TypeScript/Vite e Supabase. Leia também `docs/PRODUCT_SPEC.md`, `docs/FINANCIAL_RULES.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/DEPLOY.md` e `docs/TEST_PLAN.md` antes de mudar regras de domínio. Documentos originais continuam sendo o contrato principal.

Execute `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` e `npm run test:e2e` antes de entregar mudanças. E2E PWA requer build prévio. Em cloud, Chromium pode ser selecionado com `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. PostgreSQL/PGlite testa as migrations e RLS sem serviço externo; `npm run test:rls` acrescenta pgTAP no Supabase local.

Use o checkout existente: cada tarefa cloud já é isolada; não crie worktree sem solicitação explícita. Demonstração é memória descartável, nunca persistência de produção. Operações reais passam por RPC autorizada e transacional. Não exponha schema private nem conceda escrita direta às tabelas para contornar falhas.
