# ESPECIFICAÇÃO DE IMPLEMENTAÇÃO — Codex

> Documento de requisitos. Cenários e nomes de pessoas são exemplos ANONIMIZADOS para um repositório público. Não há dados financeiros reais aqui. Leia também `AGENTS.md`, `docs/COMECE_AQUI.md` e `docs/SEGURANCA.md`.

# PROMPT MESTRE PARA O CODEX — APLICATIVO DE FINANÇAS FAMILIARES (PWA)

> Entregue este arquivo ao Codex em um repositório GitHub inicialmente vazio. Ele é a especificação de produto, arquitetura, negócios, interface, segurança e aceitação. O trabalho pedido é IMPLEMENTAÇÃO REAL, não apenas um plano, um protótipo estático ou um conjunto de telas.

## 0. Seu papel e a forma de trabalhar

Você é o engenheiro principal/full-stack sênior, arquiteto de software, especialista em bancos PostgreSQL/Supabase, segurança de aplicações, testes, design de produto e UI/UX mobile. Assuma também o cuidado técnico de um analista financeiro: reconheça conceitos de competência, fluxo de caixa, saldo, endividamento, crédito e pagamentos, sem apresentar estimativas como dados bancários oficiais nem oferecer aconselhamento financeiro personalizado.

O repositório contém apenas a preparação documental; implemente o aplicativo do zero. Construa a solução desde a arquitetura até as telas e testes. **Priorize correção, segurança, confiabilidade financeira, acessibilidade e facilidade de uso por familiares pouco familiarizados com tecnologia. Não corra para entregar interfaces decorativas.** O objetivo é um produto que a família possa usar de verdade.

Regras de execução:
1. Inspecione o ambiente e escolha versões estáveis e compatíveis das dependências. Consulte documentação oficial atual quando necessário.
2. Escreva `README.md`, `AGENTS.md`, `docs/PRODUCT_SPEC.md`, `docs/FINANCIAL_RULES.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/DEPLOY.md` e `docs/TEST_PLAN.md`. Mantenha esses documentos coerentes com o código.
3. Organize trabalho em etapas executáveis, implemente, teste e corrija. **O planejamento não substitui a implementação.** Priorize o núcleo funcional e conclua-o antes de adornos.
4. Tome decisões técnicas razoáveis quando houver lacunas e documente-as. Só faça perguntas se existir bloqueio realmente irremovível; nunca invente credenciais, pagamentos, saldos, usuários reais ou resultados de teste.
5. Não configure contas reais, não acesse bancos reais, não publique em produção e não execute migrações destrutivas remotas sem autorização explícita. Use variáveis de ambiente e configurações documentadas; trabalhe localmente com dados fictícios quando não houver credenciais.
6. Faça commits lógicos, se o ambiente permitir; não afirme que publicou, executou testes ou criou infraestrutura sem fazê-lo. Mostre os comandos executados e resultados ao final.
7. Crie um aplicativo completo, navegável, responsivo, em português do Brasil, com modo escuro padrão e suporte a instalação como PWA.
8. Garanta que importações, alterações, cálculos e relações sejam idempotentes, rastreáveis e resistentes a cliques duplicados/requisições concorrentes.

## 1. Visão do produto

Aplicativo **privado de finanças familiares**, inicialmente para **quatro pessoas que trabalham**. Todos têm finanças pessoais independentes; existe a área compartilhada **Casa**; algumas pessoas utilizam cartões de outras; existem empréstimos antigos, compras parceladas, contas mensais variáveis, salário base e extras, VA e VR. O aplicativo tem de explicar, de forma simples, o que foi gasto, quem é responsável, quanto foi pago, quanto está em aberto e o que será necessário pagar nos próximos meses.

O produto deve permitir responder:
- Quanto recebi de salário e renda adicional, quanto gastei e o que sobrou?
- Quais despesas são pessoais e quais pertencem à Casa?
- Quanto da renda prevista já está comprometido com cartões, dívidas e contas?
- Qual fatura fecha e vence em qual dia; quais parcelas caem em cada fatura?
- Quem fez cada compra em um cartão compartilhado e quem deve reembolsar o titular?
- Quais transferências entre pessoas foram informadas, confirmadas e ainda faltam?
- Quais parcelas de empréstimo estão pagas, vencidas, futuras ou não conferidas?
- Quanto VA/VR existe, quanto foi usado pessoalmente e quanto foi destinado à Casa?
- Qual a previsão de fluxo de caixa para os próximos 30, 60, 90 dias e 12 meses?

Seja explícito nas três visões distintas: **fluxo de caixa** (movimento de dinheiro), **gastos/consumo** (natureza das despesas sem duplicidade) e **planejamento** (obrigações e projeções).

## 2. Stack e organização

Sugestão preferencial, ajustável se houver justificativa documentada:
- Frontend: React + TypeScript + Vite.
- UI: Tailwind CSS + componentes acessíveis de boa qualidade (ex.: shadcn/ui ou Radix), ícones Lucide, design tokens próprios.
- Estado/dados: TanStack Query; formulários com React Hook Form + Zod; rotas tipadas/organizadas.
- Datas com biblioteca bem testada (ex.: date-fns) e cuidados explícitos com `America/Sao_Paulo`.
- Gráficos leves com acessibilidade e alternativas tabulares (ex.: Recharts).
- Backend: Supabase PostgreSQL, Auth e funções servidoras/Edge Functions para operações privilegiadas.
- Hospedagem futura: Netlify ou equivalente, com rewrite correto para SPA e HTTPS.
- Testes: Vitest + Testing Library, Playwright, testes SQL de RLS com pgTAP/Supabase CLI e testes de domínio financeiro.
- Qualidade: ESLint, Prettier, TypeScript estrito, CI no GitHub Actions para lint/typecheck/tests/build; testes e2e quando viáveis.
- Estrutura de pastas organizada por módulos de domínio; valores monetários em `numeric(18,2)` no PostgreSQL ou centavos inteiros, nunca valores financeiros persistidos como ponto flutuante JS. Use biblioteca decimal/inteiros para cálculos e arredondamento explícito.

Inclua `.env.example`, `.gitignore`, migrations SQL versionadas, seeds FICTÍCIAS (nunca contas reais), script de bootstrap de administrador seguro e documentação passo a passo. Não dependa de conexão a um Supabase real para demonstrar o comportamento central e executar testes locais.

## 3. Modelo de acesso: privacidade e Casa

- Cada pessoa possui **perfil pessoal privado**: salário, contas bancárias, saldos, compras pessoais, dívidas e benefícios não são visíveis aos demais por padrão.
- **Casa** é uma área compartilhada, onde seus membros veem despesas classificadas como familiares, status, vencimentos e contribuições, sem que seja necessário mostrar saldos bancários ou todos os detalhes das compras particulares.
- Admin familiar gerencia convites, permissões, categorias gerais e configurações da Casa, **mas admin não é autorização automática para ler finanças pessoais privadas**.
- Cartões compartilhados autorizam especificamente titulares e usuários; cada pessoa vê suas compras e a situação pertinente. O titular vê a fatura integral do cartão de sua titularidade. A pessoa autorizada vê suas compras, seu valor a acertar e o status do acerto, sem detalhes das compras particulares do titular.
- Compra/conta compartilhada exige uma regra explícita de visibilidade. Inclua RLS em toda tabela sensível, com política por operação (SELECT/INSERT/UPDATE/DELETE), checagem de `auth.uid()` e permissões derivadas no banco, não só via frontend.
- Tenha `created_by`, `updated_by`, timestamps, versão/controle de concorrência e auditoria de alterações financeiras. Evite hard delete: anulação/correção auditada nas movimentações.
- Permitir alterar/remover compartilhamento sem perder histórico, aplicando restrições a novos acessos.

## 4. Login por nome de usuário e senha, somente via convite

O público final não deve precisar de e-mail pessoal; a família quer entrar com **nome de usuário + senha**. Supabase Auth tem senha vinculada nativamente a e-mail ou telefone, portanto NÃO invente que oferece login por username. Implemente uma camada de adaptação segura e documentada:
- Convites individuais de utilização única, validade definida, vínculo com a família e permissões atribuídas pelo admin.
- O convidado abre o link, cria um nome de usuário único e senha forte; só pessoas convidadas podem entrar.
- No servidor, associe o username a uma identidade Supabase Auth válida usando estratégia documentada, estável e segura (ex.: identificador de e-mail técnico gerenciado pelo projeto e mapeamento privado). Não dependa de e-mail fictício com domínio de terceiros, de SMS, nem de SMTP para realizar o cadastro; não assuma que domínios inválidos serão aceitos. Se o provedor exigir domínio controlado, documente o pré-requisito e implemente uma alternativa segura; jamais troque Supabase Auth por senhas caseiras sem uma razão e revisão muito fortes.
- Provisione contas com operação administrativa **exclusivamente no servidor** (`auth.admin.createUser` com confirmação quando apropriado). Nunca exponha `service_role`, secret keys ou senhas em frontend, links, logs, repositório ou arquivos exportados.
- Cadastro aberto deve permanecer desabilitado. O bootstrap do primeiro administrador deve ser seguro, documentado e sem credenciais padrão.
- Login com rate limiting, mensagens genéricas contra enumeração de usuários, sessão persistente segura, logout e expiração/renovação. Exigir senha forte e proteger endpoints contra abuso/CSRF quando aplicável.
- Recuperação de senha **sem e-mail**: admin pode iniciar reset de acesso por convite/fluxo de redefinição de uso único e curta duração. Evite o admin escolher/ver senha de outros. Invalidar sessões/tokens conforme possível. Registrar auditoria.
- Defina política para colisões de nome, mudança de username, perda de acesso, convite expirado e exclusão/desativação de membro.
- Se alguma etapa exigir ação manual ou serviço externo real, produza guia preciso, sem quebrar o uso local por falta desse serviço.

## 5. Bancos, contas e meios de pagamento

Pré-cadastrar opções editáveis de instituição: **Inter, Nubank, Itaú, Bradesco, Mercado Pago, Caixa** e 'Outro'. Um familiar pode ter diversas contas ou cartões do mesmo banco.
- Contas: corrente, poupança, conta de pagamento, dinheiro físico, benefício VA, benefício VR e outras carteiras.
- Contas privadas pertencem a pessoas específicas. Saldo inicial com **data de corte**; entradas/saídas confirmadas após a data de corte atualizam o saldo registrado; saldo previsto inclui o que ainda está pendente.
- Não inventar saldo bancário atualizado nem integração bancária automática. Mostrar a última conferência e estado 'confirmado/estimado/a conferir'. Permitir ajuste de saldo com registro de conciliação e justificativa.
- Meio de pagamento: Pix, débito, crédito, boleto, dinheiro, transferência, VA, VR, outros.
- Cada movimentação tem data da operação, data de competência/opcional, vencimento se existir, descrição, estabelecimento/local, categoria/subcategoria, valor, conta/cartão, responsável, pagador, beneficiário, natureza pessoal/Casa, observações e anexos opcionais (se implementar armazenamento seguro).
- Permitir **divisão de uma compra entre múltiplos meios de pagamento** (p. ex. VA R$ 250 + débito R$ 150 numa compra de R$ 400), divisão de categoria e divisão pessoal/Casa. Validar que a soma dos splits é igual ao total, sem duplicar o consumo.
- Transferências entre contas da mesma pessoa não são receita nem despesa; transferências entre membros devem ser classificadas como acerto ou apoio/doação conforme contexto, sem duplicar renda familiar consolidada.

## 6. Categorias e tags

Categorias padrão, editáveis e com subcategorias:
- Moradia: aluguel, condomínio, manutenção.
- Contas da Casa: água, energia, internet, gás, telefone.
- Alimentação: mercado, feira, restaurante, delivery, padaria.
- Transporte: ônibus, combustível, aplicativos, manutenção de veículo.
- Saúde, Educação, Compras pessoais (roupas, eletrônicos), Lazer (jogos, passeios), Assinaturas, Família/Ajuda, Financeiro (juros, multas, tarifas), Outros.
- Receitas: salário, horas extras, bônus, trabalho extra, vendas, rendimentos, reembolsos (separadamente de renda), benefício recebido (VA/VR, separadamente do caixa bancário).
- Permitir criar, editar, desativar, organizar e filtrar categorias e tags próprias. Suportar tags como 'Filho Pessoa A', mas **não confundir categoria de consumo com beneficiário ou responsável**.
- Não usar 'cartão de crédito' como categoria: é meio de pagamento.

## 7. Salários e demais receitas

Por pessoa:
1. Salário líquido-base habitual configurável com dia provável do recebimento.
2. Salário **estimado** por média/mediana ajustada do histórico (3 a 6 meses, se houver dados), com tratamento de valores excepcionais/bônus, demonstrando a origem da previsão.
3. Salário **real recebido**, que substitui a previsão para aquele mês, e não soma previsão+real.
4. Ajuste manual para um mês específico; opção de mudar só o mês ou a referência futura, mantendo histórico.
5. Receitas extras pontuais/recorrentes com status previsto/confirmado e origem.
6. Três cenários opcionais de previsão: conservador (base), histórico e manual.

Jamais usar renda incerta como confirmada. Relatórios devem diferenciar benefício, salário, empréstimo recebido, transferência e reembolso.

## 8. Despesas recorrentes e ocasionais

- Despesa eventual única.
- Recorrente fixa: valor constante e vencimento periódico.
- Recorrente variável: água/luz/internet etc. com previsão baseada em histórico, valor real editável por ocorrência e indicação de estimativa.
- Recorrência mensal, quinzenal, anual e outros intervalos quando viável; regras de final de mês (29/30/31) previsíveis e testadas.
- Criar ocorrências sem gerar duplicidade em novas execuções; suportar editar apenas esta ocorrência ou esta e as seguintes.
- Status: prevista, pendente, pagamento parcial, paga, vencida sem confirmação, cancelada/renegociada.
- Vencido permanece em aberto atravessando meses, sem alterar a data original do vencimento; a saída efetiva aparece na data real do pagamento.
- Uma despesa da Casa pode iniciar **sem responsável definido**. Pessoa que paga é identificada na confirmação; pode ser diferente nos meses seguintes. Aceitar múltiplos pagadores.

## 9. Cartões de crédito: dados e calendário

Cada cartão tem:
- ID, apelido, banco, titular, usuários autorizados, responsável padrão pela compra, limite opcional, dia padrão de FECHAMENTO, dia padrão de VENCIMENTO, fuso horário, status ativo/inativo.
- Exibir duas datas distintas e claramente rotuladas: fechamento (compras até o ciclo atual) e vencimento (data limite da fatura); não chamar vencimento de fechamento.
- Construir calendário mensal de faturas. Uma compra antes do fechamento entra na fatura correspondente; depois, entra na seguinte, salvo ajuste manual de ciclo por regras reais do banco.
- Poder ajustar fechamento e vencimento por uma fatura específica, mudanças futuras de configuração e reatribuição manual de compras com auditoria. Para dias inexistentes no mês, tratar conforme política documentada; não inventar política de feriados bancários.
- Status: aberta, fechada, a vencer, vencida/não confirmada, paga parcialmente, quitada, renegociada.
- Fatura guarda lançamentos originais, parcelas, taxas, pagamentos, saldo em aberto e referência a saldo de períodos anteriores se o banco efetivamente lançou a cobrança.
- Compras parceladas geram N parcelas futuras vinculadas a ciclos corretos. Suportar primeiro vencimento já passado, 'X de N', antecipação, cancelamento, estorno e correção.
- Limite estimado é informativo, sujeito a confirmação no banco.

### Faturas não pagas

Se a fatura vence e o usuário não a marca como paga: não desaparece; fica **vencida com pagamento não confirmado**. Não presuma atraso bancário comprovado. O usuário pode confirmar atraso, pagamento parcial ou renegociação.
- Se o banco carregar saldo anterior para o próximo ciclo, registrar **ligação contábil de saldo transportado**; não criar nova compra nem dobrar a dívida. Preservar a fatura anterior e sua rastreabilidade, mas o **saldo exigível agregado** deve contar cada obrigação apenas uma vez.
- Encargos e juros são lançados com valores informados pelo banco; nunca inventar juros ou taxa para simular dívida real. Campo opcional para taxa e simulação explicitamente hipotética, separada do valor confirmado.
- Suportar rotativo, parcelamento da fatura, renegociação, estorno, taxas, multas, pagamento mínimo, pagamentos parciais, quitação posterior.
- Se uma fatura for parcelada, criar contrato de financiamento relacionado e dar baixa/transferência contábil adequada na obrigação anterior, sem duplicidade.
- Para operações de crédito do saldo de fatura originadas a partir de 03/01/2024, levar em conta o limite legal de juros/encargos previsto no Brasil, separando essa modalidade de 'compra parcelada com juros'; não construir calculadora jurídica que prometa validar contratos sem os dados necessários. Documentar e sinalizar eventual divergência, sem substituir extrato do banco.

## 10. Cartões compartilhados — caso Itaú da família (obrigatório)

Regra concreta:
- O **Itaú pertence à Pessoa A**.
- **A Pessoa B utiliza e registra as próprias compras**, com acesso autorizado ao cartão.
- As despesas realizadas por ela compõem **a fatura do titular**, mas os relatórios pessoais atribuem o consumo à Pessoa B.
- A Pessoa B **transfere dinheiro ao Pessoa A** por Pix e registra que enviou.
- Pessoa A **confirma recebimento** no aplicativo.
- Pessoa A **confirma se e quando pagou a fatura** ao Itaú.
- Transferência recebida não é salário/renda extra; pagamento da fatura não é uma segunda despesa de consumo.
- Permitir transferências parciais, múltiplos Pix, confirmação/rejeição/ajuste com trilha de auditoria; só confirmar recebimento quando efetivamente recebido.
- Permitir fatura com compras da Pessoa B E do titular; cada um vê o que é seu e o titular vê total exigido pelo banco.
- Mostrar por fatura: valor total, parte da Pessoa B, parte do titular, reembolsos pendentes, valores enviados/confirmados, valores já pagos ao banco e saldo bancário da fatura ainda devido.
- Quando transferência foi feita mas fatura não foi paga, os estados precisam continuar distintos e visíveis.
- Criar módulo genérico **Acertos familiares** para outros cartões e situações, com devedor/credor, motivo, origem, status e pagamentos vinculados. Reembolsos não inflam renda/despesa consolidada. Evite depender de uma relação fixa 'Pessoa B/Pessoa A'; use permissões e entidades genéricas.

## 11. Compras parceladas (diferentes de empréstimos)

- Valor original da compra (quando conhecido), quantidade de parcelas, valor por parcela, juros: 'sem juros', 'com juros' ou 'desconhecido'.
- Com juros, permitir cadastrar **diretamente valor da parcela e N parcelas**; preço à vista/original opcional. Mostrar total contratado (soma das parcelas) e diferença para valor à vista somente se conhecido. Não deduzir taxa verdadeira sem informações suficientes.
- Parcelamento já em andamento: mês/data da primeira parcela, N total, número da próxima parcela contratual, últimas parcelas pagas/pendentes, data de corte, histórico opcional.
- Mostrar compras nos meses de cobrança corretos e nas faturas correspondentes.
- Um parcelamento de compra no cartão não deve ser contado simultaneamente como 'empréstimo' autônomo, exceto financiamento real de fatura.
- Reembolsos e divisão por responsável podem aplicar-se a cada parcela (incluindo casos em que responsabilidade muda); auditar alterações.

## 12. MÓDULO CRÍTICO — EMPRÉSTIMOS E FINANCIAMENTOS EXISTENTES

Tratar como domínio separado das compras parceladas de cartão. Diferenciar empréstimo pessoal, consignado, financiamento, carnê/crediário, parcelamento de fatura e outros contratos.

### Cadastro de empréstimo (campos obrigatórios no formulário e/ou explicitamente opcionais)

Campos de identificação:
- Nome/descrição, instituição/credor, pessoa responsável, natureza pessoal ou Casa, modalidade, observações.
- Total original contratado/valor efetivamente recebido: opcional para empréstimos antigos, se desconhecido; não inventar.
- Data da contratação: opcional, NÃO confundir com primeiro vencimento.

**Campos essenciais de calendário e pagamentos**:
1. **Quantidade TOTAL de parcelas** contratadas (`N`, inteiro positivo).
2. **Data exata do PRIMEIRO VENCIMENTO** (`YYYY-MM-DD`) — obrigatória no modo calendário conhecido; permitir modo excepcional com primeira data desconhecida e próxima data conhecida, destacando menor precisão.
3. **Periodicidade** (mensal por padrão; aceitar outra quando necessário).
4. **Valor da parcela**: fixo, ou cronograma variável por parcela.
5. **Número da ÚLTIMA PARCELA REALMENTE PAGA**, se conhecido: campo opcional de 0 a N, com data real de pagamento opcional. Ex.: 8 de 10.
6. **Última data de pagamento efetivo**, distinta da data contratual de vencimento.
7. **Existe algum pagamento anterior não confirmado ou alguma parcela pulada?** Permitir 'todas as parcelas anteriores à última paga estão confirmadas' OU 'não sei/preciso conferir'. Nunca inferir a quitação de 1..8 apenas por terem dito 'última paga: 8'.
8. Permitir editar diretamente **status e valor pago de cada parcela**: prevista, a vencer, paga, paga em atraso, parcial, vencida/não confirmada, renegociada, histórico a conferir. Cada pagamento possui data, conta de origem, valor e alocações às parcelas.
9. Próxima parcela do calendário e número da próxima parcela ainda não quitada são diferentes e precisam de nomes distintos na UI.
10. Quando a última paga é 8/10, mostrar 9 e 10 como contratualmente futuras/pendentes **de acordo com as datas**; se existir parcela anterior não paga, mantê-la aberta.
11. Calcular **última data de vencimento contratual** pelo primeiro vencimento + N-1 intervalos, usando política documentada de final de mês, incluindo dia 31 e ano bissexto. Permitir exceções contratuais e datas ajustadas individualmente.
12. Preservar primeira data, N e histórico ao editar; mudanças no contrato devem ter confirmação sobre efeitos e histórico auditável.

### Juros e valores financeiros

- Status 'com juros', 'sem juros' ou 'não sei'.
- Se o usuário só souber parcela e quantidade, cadastrar e projetar **soma das prestações futuras** sem inventar preço à vista, juros, principal, CET ou saldo para quitação antecipada.
- Valor financiado, taxa mensal/anual, CET, sistema de amortização, tarifas/seguros, saldo devedor informado pelo credor e tabela amortizável são opcionais; só calcular cronograma de principal/juros quando houver dados contratuais suficientes e método identificado.
- Não confundir **soma das parcelas futuras** com **saldo para quitação antecipada**.
- Atrasos podem gerar encargos reais. Adicionar apenas valor registrado ou verificado no banco; projeções hipotéticas claramente separadas.
- Permitir renegociação, amortização antecipada, liquidação, suspensão, carência e mudança de valor com vínculo ao contrato anterior e sem apagá-lo.
- 'Empréstimo recebido' aumenta caixa e passivo, NÃO salário. 'Prestação paga' reduz caixa; se houver composição conhecida, principal diminui passivo e juros/tarifas são custo financeiro; caso contrário registrar saída de caixa com composição não informada.

### Cadastro rápido de dívida em andamento

Ex.: empréstimo com `10 parcelas de R$ 200`, `primeira data de vencimento` informada, `última parcela paga 8`, data desse pagamento, e 'histórico anterior confirmado: sim/não'. Aplicativo mostra calendário 1/10 a 10/10, sem inserir saídas fictícias retroativas nos bancos. Para meses anteriores à data de início do controle, não fabricar fluxo de caixa histórico: guardar situação de abertura. Se a 9ª ainda não foi paga e venceu, ela aparece pendente e a 10ª continua programada na data própria.

**Caso especial obrigatório**: 9ª parcela paga fora de ordem enquanto a 8ª continua em aberto. Deve mostrar corretamente 'última paga 9', '8ª pendente' e próxima obrigação em aberto 8, sem assumir sequência; quaisquer atalhos de 'última paga' não podem ser a única fonte da verdade.

### Tela de empréstimos

Visão por contrato: valor da parcela, número total, primeira data de vencimento, última parcela efetivamente paga + data, última data contratual, número e vencimento da próxima parcela, atrasos conhecidos, não conferidos, total de prestações futuras, valor pago no período e saldo de quitação informado (se existir). Timeline/grid das parcelas e histórico pagador.

Visão agregada: 'Vencidas', 'Do mês', 'Futuras', 'A conferir', com opção de comparar cenários e filtros por pessoa/instituição/Casa. Incluir no planejamento de mês novo as pendências antigas, mas SEM reescrever seu vencimento original nem contar o mesmo valor como nova despesa.

## 13. Cartões de alimentação/refeição (VA/VR)

- VA e VR são **carteiras de benefício com saldo**, não faturas de crédito.
- Cadastro de operadora/apelido, titular, saldo inicial, data de referência, recargas periódicas estimadas e recargas reais, ajustes de saldo.
- Recarga VA/VR é benefício recebido, separado do salário em conta bancária e não é dinheiro livre para pagar cartão, empréstimo ou energia.
- Compra com VA ou VR reduz carteira e registra despesa de alimentação; categorizar pessoal/Casa.
- Permitir compra com pagamento dividido (VA+VR+Pix/débito se compatível com o estabelecimento); não permitir transferência VA→VR por dentro do app, a menos que apenas se registre redistribuição real realizada pela operadora e comprovada.
- Não presumir que saldo pode ser usado fora da finalidade alimentar; respeitar regras do PAT.
- Visualizar quanto da alimentação familiar foi coberta por benefício versus dinheiro.

## 14. Casa: orçamento compartilhado sem responsável obrigatório

A área Casa é **uma visão financeira compartilhada de despesas familiares**, independente de quem é titular da conta/cartão. Exemplos: água, luz, internet, gás, supermercado, refeições da família.
- Registro de conta pode iniciar com 'responsável ainda não definido'. Pagamento atribui pagador e conta real; não tornar automaticamente esse pagador responsável permanente.
- Suportar pagamento parcial ou divisão entre várias pessoas.
- Casa deve ter orçamento previsto, pago, restante, atrasos, próximos vencimentos, gastos por categoria, comparativo de meses e contribuição individual.
- Não criar uma dívida de reembolso por padrão ao registrar gasto da Casa. Só gerar Acerto entre familiares se explicitamente indicado que outra pessoa deve reembolsar.
- Evitar dupla contagem: compra da Casa paga por Pessoa A com VA é **uma única despesa familiar** e ao mesmo tempo uma **contribuição de Pessoa A**. Isso são recortes de análise, não transações independentes.

## 15. Metas flexíveis de contribuição à Casa

O usuário Pessoa A tem uma **META FLEXÍVEL mensal** de ajuda à Casa, normalmente referenciada ao valor que ele costuma destinar de VR, mas pode usar **VA, VR ou dinheiro** em proporções diferentes. Não exigir valor fixo nem transformar o saldo não atingido em dívida.
- Meta mensal configurável por pessoa; valor-base sugerido e override para cada mês; possibilidade de meta zero e de contribuir além.
- Contabilizar contribuição quando houver **gasto efetivo destinado à Casa** (p. ex. compra de mercado com VA, refeição familiar com VR) ou transferência explicitamente classificada como contribuição à Casa.
- Receber R$ 500 de recarga VA ou VR NÃO é contribuir R$ 500; uma refeição pessoal de trabalho NÃO contribui à Casa.
- Caso compra tenha itens pessoais e da Casa, dividir a apropriação.
- Gráfico e texto: objetivo, realizado, falta para meta, acima da meta; faltante **não é cobrança, inadimplência ou passivo**.
- Suportar metas por outras pessoas, bem como modo diferente de 'compromisso combinado' caso configurado explicitamente no futuro, sem confundir com meta flexível.
- Evitar duas contribuições pelo mesmo gasto: transferência para Casa usada depois em compra exige reconhecimento de financiamento versus consumo; quando necessário, escolher regra única explícita para contribuição e explicar UI.

## 16. Acertos e transferências familiares

Exemplo obrigatório: Pessoa B deve R$ 650 pelas compras no Itaú do Pessoa A; já enviou R$ 400 e faltam R$ 250.
- Pessoa B cria solicitação/declaração 'Enviei R$ 400 a Pessoa A' com conta de origem e data.
- Estado 'aguardando confirmação de recebimento'; Pessoa A confirma, rejeita ou sinaliza divergência.
- O saldo pendente do acerto diminui pelos **valores confirmados**, não por meras declarações (mostrar enviados pendentes separadamente).
- Transferência confirmada reflete no fluxo das contas envolvidas com rastreabilidade; lidar com data do envio e data da confirmação como conceitos diferentes; movimentações em análise não devem gerar saldos confirmados falsos.
- Pagamento da fatura pelo Pessoa A é outro evento, que não depende magicamente de confirmação do Pix. Se recebeu mas ainda não pagou, isso aparece.
- Suportar pagamento parcial do acerto, pagamento parcial da fatura, valor excedente/adiantamento, estorno/correção e conflitos de simultaneidade.
- Doações/ajudas não reembolsáveis devem ser distintas de acertos.

## 17. Status, datas e invariantes contábeis

Usar datas distintas quando apropriado: `occurred_at`/data da compra, `competence_date`, `due_date`/vencimento, `paid_at`/pagamento, `posted_at`/lançamento, `confirmed_at`, `statement_closing_date`. Datas locais de vencimento não devem mudar por conversões UTC.

Regras que NUNCA devem ser violadas:
1. Não somar compra no crédito e pagamento da fatura como duas despesas de consumo.
2. Não somar transferência/reembolso entre familiares como renda líquida familiar nova.
3. Não somar recarga de VA/VR ao caixa bancário como se fosse dinheiro livre.
4. Não contar empréstimo recebido como salário ou receita operacional.
5. Não misturar valor de compras parceladas e saldo de dívida da fatura se forem a mesma obrigação renegociada.
6. Não retirar uma dívida do histórico porque mudou o mês.
7. Não marcar obrigação paga apenas porque a pessoa disse qual foi a última parcela paga; manter confirmações individualizadas e lacunas.
8. Não somar uma contribuição à Casa novamente como despesa familiar se ela já representa a compra subjacente.
9. Não criar movimentos bancários retroativos fictícios para dívidas/parcelas anteriores à data inicial de controle.
10. Nunca mostrar estimativa como confirmação bancária.
11. Ao transportar saldo de fatura ou renegociar dívida, uma obrigação ativa deve existir **uma vez** em cada visão totalizada; referências históricas não criam cobrança duplicada.
12. Soma de partes de pagamento/splits deve ser consistente com o total. Impedir excesso não justificado ou tratar crédito excedente explicitamente.

Aplicar validações no backend/banco, não apenas no browser; suportar transações ACID, constraints, chaves estrangeiras, idempotency keys e RLS.

## 18. Relatórios, análises e previsões úteis

Dashboard inicial minimalista, escolhendo mês/período e alternando visão pessoal/Casa/compartilhada conforme permissões.
- Receitas previstas/confirmadas, despesas realizadas/previstas, saldo de caixa, saldo livre projetado, obrigações do mês, pendências antigas, próximos vencimentos.
- Evolução de gastos e entradas, gastos por categoria/subcategoria, gastos por responsável, despesas da Casa, contribuição por pessoa, uso VA/VR, comprometimento da renda e parcelas futuras.
- Gráficos acessíveis com tabelas alternativas e filtros de pessoa, período, banco, cartão, categoria, Casa e status.
- Projeção por mês para 12 meses, com modos conservador/histórico/manual para salário. Exibir 30/60/90 dias e alertas de aumentos atípicos de contas variáveis sem afirmar fraude.
- **Dinheiro necessário para fechar o mês**: desembolsos pendentes em contas bancárias, pendências vencidas e pagamentos futuros, distinguindo compras já cobertas por VA/VR. Diferenciar 'despesa da Casa' de 'dinheiro em conta necessário'.
- **Confiabilidade dos dados**: comprovado pelo usuário, estimado ou ainda a conferir; informar data da última conciliação.
- Limites/metas por categoria opcionais, mas nunca impor uma meta de percentual como regra universal.
- Não fazer recomendações fiscais ou aconselhamento jurídico/financeiro automático categórico.

## 19. Interface de uso real por pais e celular

Português do Brasil. **Modo escuro como padrão** com contraste AA onde aplicável; opção de claro futura/opcional. Estética sóbria: fundo grafite, azul para ações, verde para entradas/confirmados, vermelho para pendências relevantes, cores nunca como único indicador.

Princípios:
- Mobile-first, navegação inferior com 3–5 acessos prioritários e menu 'Mais' para demais; desktop responsivo.
- Telas principais: **Início, Movimentações, Casa, Contas e Cartões, Planejamento, Relatórios, Configurações**. Dívidas e empréstimos dentro de Planejamento com acesso evidente. Acertos familiares acessíveis tanto em Casa quanto no cartão.
- Ação principal grande: '+ Adicionar' → 'Despesa', 'Receita', 'Transferência', 'Cartão', 'Empréstimo/parcelamento', conforme contexto.
- Formulários progressivos: primeiro valor/descrição; somente mostrar parcelamento e campos extras se necessário. Auxílios em linguagem simples e confirmação clara após salvar.
- Evitar modais enormes, zoom exagerado, tabelas apertadas, campos pequenos ou múltiplas etapas desnecessárias. Largura confortável de toque e erros compreensíveis; fontes legíveis.
- Filtros e busca, estados vazios educativos, skeleton/loading, mensagens de erro, confirmação em ações destrutivas e prevenção de dois envios.
- Fluxo de cadastro guiado: criar conta por convite, configurar pessoa, saldo inicial/data de início, salário base, cartões, empréstimos existentes, benefícios, algumas contas da Casa. Permitir **pular** campos desconhecidos.
- Acessibilidade: navegação por teclado, labels, aria, foco, redução de movimento, leitores de tela, cores com contraste, elementos de toque confortáveis.
- Implementar telas reais e conectadas, não dashboards preenchidos com números fictícios após autenticação.

## 20. PWA e instalação em celulares

- Manifest correto com `name`, `short_name`, `icons` 192/512, cores, `start_url`, `display: standalone`, ícones de boa qualidade, HTTPS em produção; testar instalação Android/Chrome/Samsung Internet e orientar iOS.
- Cache de assets estáticos para abrir a interface sem rede, com estado offline informativo; **não persistir indiscriminadamente dados financeiros ou tokens em caches públicos**.
- Primeira versão pode ser **online para lançamentos**: não prometer sincronização offline de transações sem implementá-la. Caso implemente offline futuramente, requer fila criptograficamente prudente, idempotência, políticas de conflito e testes.
- Não registrar service worker que armazene respostas autenticadas em cache sem isolamento rigoroso.
- Preparar publicação na Netlify sem executar deploy automático sem configuração/autorização.

## 21. Banco e arquitetura de domínio

Modelar relacionamentos sem cair numa tabela única de 'gastos'. Entidades sugeridas (nomes podem ser adaptados):
- `families`, `family_members`, `profiles`, `invites`, `username_identities`, `access_grants`.
- `institutions`, `accounts`, `account_balance_adjustments`, `benefit_wallets` ou `accounts` tipadas, `benefit_recharges`.
- `cards`, `card_permissions`, `card_statement_cycles`, `card_statement_lines`.
- `categories`, `tags`, `merchants`, `transactions`, `transaction_splits`, `payment_sources`.
- `obligations`, `obligation_lines`, `payment_events`, `payment_allocations`, `settlements`.
- `installment_plans`, `installment_items`, `loan_contracts`, `loan_installments`, `loan_payment_allocations`, `loan_contract_events`.
- `recurrence_rules`, `recurrence_instances`, `income_baselines`, `income_forecasts`.
- `household_goals`, `household_contributions` (preferencialmente referências a eventos financeiros, sem nova despesa), `family_settlements`.
- `audit_logs`, `reconciliation_events`, `user_preferences`.

**Não é obrigatório criar todas exatamente assim**, mas explique as escolhas e garanta que identidade do titular, responsável financeiro, beneficiário, pagador, dono da conta e criador do registro sejam relações separadas. As projeções podem usar views/materialized views ou queries com regras documentadas; snapshots históricos devem ser reconstituíveis.

Inclua:
- constraints de domínio, índices, FKs, RLS, grants mínimos, migrations e seeds;
- transações/rotinas para movimentos de múltiplas contas, reconciliação, faturas transportadas e alocação de pagamentos;
- log append-only para eventos críticos ou trilha equivalente que preserve passado;
- separação de cálculos de consumo, dívida, saldo e fluxo de caixa;
- versões e idempotência contra condições de corrida.

## 22. Segurança e privacidade obrigatórias

- Supabase RLS e grants mínimos em tabelas expostas, testes positivos/negativos de leitura e escrita entre dois membros.
- Chaves privilegiadas só no servidor. Endpoint administrativo verifica papel e ação antes de usar service role; não confiar em `user_id` passado pelo browser.
- Tokens de convite criptograficamente aleatórios, armazenados por hash, uso único, expiração, revogação e rate limiting.
- Evitar vazamento de nomes de contas, saldos privados e detalhes pessoais em logs/erros/analytics.
- Validação Zod no cliente e no servidor, sanitização/escaping adequados, CSP/headers de segurança quando possível.
- Segurança de sessão/logout em dispositivo compartilhado; cuidado com localStorage e offline cache.
- Não salvar senha, token, comprovante ou dado de banco em GitHub. `.env.example` sem segredos.
- Privacidade por padrão: colaborador da Casa vê só registros compartilhados; usuário de cartão compartilhado não vê transações pessoais do titular.
- Testar autorização para consulta direta à API, não apenas tela escondida.

## 23. Início simplificado e dados históricos

- Data inicial de controle selecionável por pessoa/conta; saldo de abertura confirmado ou estimado.
- Cadastro de cartão já com fatura aberta, compras parceladas existentes, dívidas históricas, empréstimos 9/10, parcelas passadas a conferir.
- Não criar salários recebidos, pagamentos ou transações antigas fictícias ao cadastrar o empréstimo.
- Diferenciar histórico anterior ao início do aplicativo de eventos confirmados dentro do sistema.
- Importação CSV/OFX bancária como evolução, não pré-requisito do MVP. Se implementada, incluir prévia, mapeamento de colunas, detecção de duplicados e confirmação do usuário.

## 24. Backups, exportação e continuidade

Como Supabase Free não oferece backups diários automáticos gerenciados, preparar estratégia realista:
- Documentar `supabase db dump` e restauração em ambiente de teste; scripts seguros para backup lógico e procedimento de recuperação.
- Se adicionar automação, garantir armazenamento externo seguro, criptografia apropriada, retenção, não subir dados financeiros ao git nem a artifacts públicos e não exibir chaves em logs.
- Oferecer exportação autenticada de movimentações e contratos em CSV/JSON quando viável, obedecendo permissões. Não confundir exportação CSV com backup consistente integral.
- Documentar pausa por inatividade no Free e como recuperar serviço; não prometer disponibilidade 24/7.
- Testar restauração em ambiente isolado antes de confiar em backups.

## 25. Testes financeiros e critérios de aceitação (NÃO NEGOCIÁVEIS)

Crie testes automatizados determinísticos para, no mínimo:

### Empréstimos
1. N=10, primeira parcela em 20/03/2026, parcela fixa R$ 200. Última paga 8 com data confirmada, com todas 1..8 explicitamente marcadas pagas; 9 e 10 ainda abertas, cada uma com data correta.
2. Mesmo contrato, última paga 8, mas histórico 1..7 NÃO conferido: não marcar todas automaticamente como quitadas.
3. 9 paga e 8 pendente: a lista de atrasos inclui 8 e 'última paga' mostra 9 sem esconder 8.
4. Parcela 7 vence em outubro e é paga em novembro: despesa/obrigação original preserva vencimento; fluxo de caixa registra saída em novembro.
5. Pagamento parcial em duas datas, com valor faltante correto e sem saldo negativo.
6. Empréstimo passado cadastrado na data de corte não gera saídas fictícias nas contas.
7. Primeira parcela 31/01, 12 parcelas: testar 28/29 de fevereiro, fim de meses e ajuste pontual de vencimento.
8. Parcela variável, carência/renegociação, quitação antecipada e cálculo de soma futura diferente de saldo para quitação.

### Cartão e acertos
9. Cartão fecha dia 05 e vence dia 15: compra em 04/11 e compra em 06/11 entram em faturas diferentes conforme calendário.
10. 6x de R$ 200 gera exatamente seis linhas e faturas esperadas, sem duplicar gasto.
11. Fatura outubro R$ 800 não paga; novembro tem compras de R$ 300; transporte de saldo antigo com R$ 50 de encargos confirmados resulta em R$ 1.150 exigíveis, não R$ 1.950.
12. Pessoa B compra R$ 650 no Itaú do Pessoa A; Pessoa A compra R$ 350: fatura R$ 1.000; nos relatórios de consumo a Pessoa B tem R$ 650, ele R$ 350.
13. Pessoa B marca Pix enviado R$ 400: estado aguardando confirmação; Pessoa A confirma, resta R$ 250 no acerto; fatura continua não paga até registro separado de pagamento.
14. Pix confirmado entre familiares não cria novo salário nem duplica consumo; pagar a fatura não duplica despesa.
15. Pagamento parcial da fatura e parcelamento do saldo têm contabilização e histórico coerentes.

### Casa/benefícios
16. VA recarregado R$ 500 não aumenta saldo bancário nem conta como contribuição por si só.
17. Compra mercado R$ 400 paga VA R$ 250 + débito R$ 150; relatório de alimentação soma R$ 400, VA cai R$ 250, conta cai R$ 150, sem duplicidade.
18. VR usado em almoço pessoal não entra na meta Casa; VR usado em refeição familiar entra.
19. Meta Casa R$ 600, realização R$ 400: diferença R$ 200, **nenhuma dívida criada**; realização R$ 700 não gera erro nem dívida inversa.
20. Despesa Casa sem responsável não é apropriação pessoal antecipada; ao pagar, registra pagador, sem atribuir permanentemente próximos meses.

### Segurança e confiabilidade
21. Usuário A não consegue ler saldo/contrato privado de B por consulta direta ao Supabase, embora compartilhem Casa.
22. Usuário autorizado no cartão visualiza suas compras e seu acerto, sem ver compras pessoais do titular; titular vê fatura integral.
23. Convite expirado/usado é recusado; criação sem convite é negada; senha e service keys não vazam.
24. Duas requisições idênticas de pagamento não geram débito duplicado; concorrência de alterações não perde dados.
25. Mudança de mês, fuso horário e recálculo de previsões não duplicam recorrências nem mudam datas de vencimento.
26. Balanço de conta, soma de splits, soma das alocações e saldo de obrigações permanecem matematicamente coerentes.

Inclua testes de acessibilidade básica, principais fluxos E2E mobile e desktop, validação de formulários, login/convites com mocks seguros e testes de RLS (`supabase test db` quando ambiente disponível). Testes devem cobrir falhas e estados vazios, não só sucesso.

## 26. Entregáveis do repositório

No mínimo:
- Aplicativo real com rotas, páginas, formulários, estados, persistência integrada à arquitetura do Supabase, navegação e modo escuro.
- Setup de desenvolvimento local, scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e` (ou equivalentes documentados).
- Migrations SQL + RLS + dados de demonstração isolados de usuários reais.
- Fluxos seguros de autenticação/convites e papéis.
- Componentes e serviços financeiros com domínio separado e tests.
- Dashboard útil e responsivo; PWA manifest + assets + políticas de cache seguras.
- CI e documentação de implantação Netlify/Supabase com variáveis necessárias.
- Guias de primeiro acesso para pessoa administradora e para familiares leigos; instruções de cadastrar cartão, salário, VA/VR, dívida antiga e como marcar pagamentos.
- Documentos de decisões técnicas, limitações e checklist de validação manual.
- Idealmente screenshots de telas reais em desktop e mobile, obtidas por testes quando possível (sem apresentar mockups como screenshots reais).

## 27. Sequência de implementação recomendada

**Marco 1 — Fundação:** arquitetura, layout responsivo, Supabase local/migrations, modelo financeiro, RLS, convites, sessão e testes de permissões. Não simular persistência com localStorage como se fosse produção.

**Marco 2 — Controle financeiro básico:** contas/saldos, categorias, receitas/salários, despesas, splits, despesas recorrentes, Casa, lançamentos e filtros.

**Marco 3 — Obrigações complexas:** cartões/faturas/calendários, empréstimos/parcelamentos existentes, status individuais, pagamentos parciais, atrasos, transporte de saldo e renegociação.

**Marco 4 — Relações familiares:** Itaú titular Pessoa A/usuária Pessoa B, acertos com confirmação de Pix, contribuições flexíveis para Casa, VA/VR.

**Marco 5 — Inteligência e produto:** painéis, projeções, gráficos, conciliação, onboarding, PWA, acessibilidade e documentação para pais.

**Marco 6 — Validação:** E2E e testes RLS completos, backups/restore documentados, melhorias de UX, CI verde. Somente depois preparar deployment; não publicar sem autorização.

Em todos os marcos, manter algo executável, sem abandonar a finalização do escopo. Se houver limitação real de ambiente, registrar exatamente o que foi implementado, o que não foi testado e o que exige configuração externa. Não chamar de concluído aquilo que for apenas planejado.

## 28. Como finalizar e prestar contas

Ao concluir, apresente em português:
1. Arquitetura e decisões fundamentais (principalmente regras financeiras e privacidade).
2. Arquivos/pastas criados e como executar localmente.
3. Configuração exata necessária no Supabase e no Netlify, com segurança.
4. Quais testes rodaram e respectivos resultados; o que não foi possível validar.
5. Funcionalidades efetivamente implementadas vs. pendentes (sem maquiar lacunas).
6. Passos exatos para usuário leigo começar e cadastrar um empréstimo antigo com **data da primeira parcela, N total, última parcela paga e data do pagamento**, depois cadastrar Itaú compartilhado, VA/VR e contribuições à Casa.
7. Riscos e decisões a validar antes de usar dados reais.

### Referências oficiais para consultar/validar

- Supabase — Auth por senha: https://supabase.com/docs/guides/auth/passwords
- Supabase — criação administrativa de usuário: https://supabase.com/docs/reference/javascript/auth-admin-createuser
- Supabase — RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase — SMTP e limitações: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase — desenvolvimento local: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase — backups: https://supabase.com/docs/guides/platform/backups
- Supabase — pausa em projetos Free: https://supabase.com/docs/guides/platform/free-project-pausing
- Banco Central — empréstimos e financiamentos: https://www.bcb.gov.br/meubc/faqs/s/emprestimos-e-financiamentos
- Banco Central — cartão, rotativo, parcelamento e fatura: https://www.bcb.gov.br/meubc/faqs/s/cartao
- Banco Central — teto de encargos da dívida de cartão: https://www.bcb.gov.br/meubc/faqs/p/limitacao-dos-juros-e-encargos-financeiros-no-saldo-devedor-da-fatura-do-cartao
- MDN — PWA instalável: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- MTE/PAT — Perguntas e respostas 2026: https://www.gov.br/trabalho-e-emprego/pt-br/servicos/empregador/programa-de-alimentacao-do-trabalhador-pat/perguntas-e-respostas-maio2026.pdf

**AÇÃO SOLICITADA: comece a construir o aplicativo neste repositório vazio. Não se limite a gerar uma proposta ou pedir para alguém escrever o código depois. Priorize qualidade, clareza e conclusão verificável do núcleo.**