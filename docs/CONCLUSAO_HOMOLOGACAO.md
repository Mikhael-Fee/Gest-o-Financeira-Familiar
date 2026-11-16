# Conclusão do desenvolvimento e homologação autenticada — 16/11/2026

## Resultado

O Entre Nós foi ampliado no repositório existente e a versão foi publicada no **site de homologação existente**. O administrador do proprietário foi provisionado no Supabase autorizado e testado no navegador público. O acesso final usa ativação privada de uso único, para o proprietário escolher sua senha. Nenhum segredo de ativação ou senha faz parte deste documento ou do Git.

Esta entrega encerra as pendências de implementação e homologação autenticada registradas na etapa anterior. **Uso de dados reais e produção definitiva continuam sem autorização.** Aparelhos físicos, armazenamento externo de backups e a autorização do aplicativo GitHub no Netlify são pendências operacionais explícitas.

## Requisitos e funcionalidades

A [matriz de conclusão](MATRIZ_DE_CONCLUSAO.md) relaciona os requisitos aos módulos e testes. Os documentos originais continuam preservados; relatórios de etapas anteriores são históricos.

**Meu espaço:** contas bancárias/dinheiro/VA/VR próprias, saldos com corte e conferência, conciliação, salários e extras, competência e data de caixa distintas, previsões mensais e referência futura, histórico robusto sem confundir bônus com aumento, despesas ocasionais/recorrentes, cartões/faturas/acertos, contratos e parcelas, orçamentos mensais por categoria, metas privadas, disponível estimado e relatórios pessoais. O usuário pode utilizar esses recursos sem registrar despesas na Casa.

**Casa:** despesas compartilhadas sem responsável obrigatório, vários pagadores, vencimentos/pendências, metas flexíveis e contribuições sem gerar dívida, relatórios por categoria/período e acertos. Salários, saldos, contratos, orçamentos e metas privados não ficam disponíveis a outros familiares, inclusive ao administrador.

**Novos módulos:** orçamento planejado/realizado/restante/percentual/comparação e avisos; cópia e alterações futuras; metas com saldo declarado/aportes/retiradas/estornos, conta opcional e previsão; disponível até o próximo salário e em 30/60/90 dias; recebimentos futuros previstos/certos separados de caixa; recorrências por dias/meses com edição de ocorrência/futuras/regra; compra detalhada com valores distintos e calendário histórico ou automático; adiantamentos familiares; etiquetas editáveis já utilizadas; importação CSV/OFX com prévia/correção/classificação/deduplicação; tutorial em nove etapas e avisos internos.

## Cartões, empréstimos e integridade

Titular, consumidor, responsável e pagador permanecem separados. Pix informado e confirmado não quitam fatura; pagamento parcial, estorno, transporte e renegociação mantêm os vínculos. Os testes preservam o caso 800 anteriores + 300 novos + 50 de encargos = 1.150 exigíveis. Empréstimos mantêm parcela nona paga com oitava aberta, datas antigas e histórico desconhecido sem fabricar saídas de caixa. Principal, juros e CET desconhecidos permanecem desconhecidos.

A revisão corrigiu duas integrações: reservas de metas e obrigações agora compartilham o mesmo limite de saldo; calendários de compras comuns/detalhadas respeitam a exceção de cada ciclo sem propagar um vencimento excepcional aos demais meses. Consultas e comandos continuam usando RLS, GRANTs mínimos, transações, versões, locks, idempotência e auditoria.

O refresh após salvar passou a preservar os componentes montados; formulários e confirmações dos novos módulos não somem durante o recarregamento de dados. As novas senhas respeitam 12–72 caracteres e o limite de 72 bytes UTF-8 do Supabase; uma senha inválida é recusada antes de consumir o convite.

## Testes e evidências atuais

| Camada | Resultado |
|---|---|
| Lint, TypeScript e build | passaram |
| `npm test -- --maxWorkers=2` | **182 testes em 21 suítes passaram**, incluindo domínio, PostgreSQL/PGlite, UI, identidade e backup cifrado |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e -- --workers=2` | **63 casos passaram**, desktop/mobile/PWA/Auth sintético, acessibilidade e regressão dos novos módulos |
| `npm run test:rls`, Supabase local | **27 verificações pgTAP passaram**, com rollback |
| pgTAP no Supabase remoto autorizado | **27 verificações passaram**, com rollback; antes do provisionamento, usuários/perfis/lançamentos continuavam zerados |
| `SUPABASE_STATUS_FILE=... npm run test:api`, backend local real | passou: Auth/Edge/PostgREST, bootstrap, convites/reuso, senha inválida sem consumir convite, recuperação, RLS, cartão/Pix, pagamento concorrente idempotente, salário/correção e calendário parcial |
| Integração ampliada local com quatro usuários reais | passou: isolamento, cadastro público negado, convites, cartão/Pix/fatura parcial, VA+débito, Casa, empréstimo fora de ordem/calendário desconhecido, orçamento/meta privada sem caixa fictício, salário futuro e importação repetida, desativação e recuperação |
| Backup cifrado e restauração em banco local descartável | passaram: AES-256-GCM, contagens e digests das tabelas financeiras, integridade Auth e **27 verificações RLS após restaurar** |
| API pública real com quatro usuários | passou nos mesmos fluxos ampliados, sem mocks e somente com dados fictícios |
| Navegador público real | passou: administrador, Meu espaço/Casa/Configurações, convite, criação/consulta/anulação de despesa fictícia, Planejamento, saída/nova entrada e sessão em memória após recarga |
| Ativação por link no navegador público | passou com membro fictício: nova senha, fragmento removido da URL, senha antiga e reuso do código negados |
| Celular emulado na URL pública, com autenticação real | passou: login, disponível, privacidade da Casa, largura mobile e Axe A/AA |
| PWA no site público | passou: shell abre sem conexão e caches não contêm URLs de Auth/PostgREST/Functions/Supabase |

Os resultados locais, sintéticos e públicos são camadas diferentes. Nenhum resultado de teste com mocks foi descrito como autenticação pública. A quantidade de testes não substitui as verificações funcionais e de acesso negado.

## GitHub, Supabase e Netlify

- Branch: `feat/aplicativo-financas-familiares`. [PR #1](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/pull/1) preservado, sem merge na main.
- Commit publicado: **`bf896f4934764c30cf9b4995c8608737586490d1`**. Commits novos preservam o histórico anterior.
- [CI do código publicado aprovado](https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/43920134356). A execução correspondente ao PR também passou.
- Supabase: **somente `ovoqhnoaigjzihhpdukn`, Finanças casa**; 20 migrations, função identity ativa, cadastro aberto bloqueado, JWT de 900 segundos, quatro usuários de homologação e um administrador ativo. Nenhuma tabela pública está sem RLS. Sem reset remoto.
- Aplicativo: **https://entre-nos-homologacao.netlify.app**. Deploy **`6afb3f590e04014bc5d3cae5`**, `ready`, confirmado como publicado. O `/version.json` público retorna o SHA acima. Rotas profundas e headers CSP/anti-frame/referrer foram conferidos.
- Build gerado de `git archive` do commit, com somente URL/chave publicável. Os 21 arquivos do artefato foram conferidos contra as credenciais administrativas disponíveis; nenhum segredo foi encontrado. Nenhum arquivo de ambiente/cache/servidor foi publicado.

Não houve novo projeto Supabase/Netlify, contratação de plano ou acesso/alteração ao Sistema Grupo de Louvor. Builds automáticos do site permanecem pausados para não publicar antes das verificações. A integração GitHub negou gerenciamento de secrets com `403 Resource not accessible by integration`; a autorização GitHub/Netlify precisa ser concluída pelo proprietário para o fluxo automático. A publicação manual versionada foi concluída.

A verificação pública de acessibilidade encontrou contraste insuficiente no selo opcional injetado pelo Netlify. O selo foi desabilitado na configuração do mesmo site, sem contratação ou alteração do plano; a repetição em celular autenticado passou sem violações automatizáveis.

## Administrador e primeiro uso

O perfil administrativo foi confirmado no banco e a autenticação foi testada na URL pública. O arquivo privado de ativação é entregue separadamente ao proprietário, fora do checkout. Ele permite escolher a própria senha e expira em 20 minutos. A senha temporária usada na validação foi invalidada antes dessa entrega. Os demais três usuários são fictícios de teste, com credenciais individuais que não são compartilhadas.

1. Abra o arquivo privado de ativação, escolha uma senha pessoal e entre no endereço público.
2. Explore Meu espaço e Casa com os registros exclusivamente fictícios. O aplicativo não possui conexão bancária automática.
3. Configurações oferece convites individuais, revogação, recuperação, desativação de membros e o tutorial. Desative os membros fictícios quando concluir seus testes.
4. Em Planejamento, confira orçamento, metas, recorrências, compras e empréstimos; em Movimentações, veja lançamentos e a importação com prévia.
5. Ao terminar em dispositivo compartilhado, use Sair e limpar sessão. Reabrir/recarregar exige entrar novamente; dados financeiros e tokens não são guardados pelo PWA.

## Pendências operacionais antes de dados reais

- Validar instalação e uso em aparelhos Android/Samsung Internet/iOS físicos e com leitor de tela. Automação/emulação não substitui essa avaliação.
- Escolher/configurar destino privado externo para backups cifrados e chave separada, retenção e execução agendada; ensaiar restauração entre projetos/provedores. A cópia lógica cifrada anterior às migrations remotas foi preservada privadamente; não foi chamada de backup remoto `pg_dump` integral.
- Concluir a autorização GitHub–Netlify para deploy automático após CI, usando somente este repositório/branch/site. As permissões atuais não permitem configurar essa integração por completo.
- Anexos, notificações push e sincronização financeira offline permanecem fora da versão. Há avisos internos e shell offline; não se anuncia lançamento financeiro offline.
- Revogar/substituir os tokens de gerenciamento enviados no chat por bindings seguros. Nenhum valor integra os commits ou este relatório.
- Obter autorização expressa para dados financeiros reais e produção definitiva. Esta homologação não concede essa autorização.
