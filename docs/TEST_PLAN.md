# Validação executada — 12/11/2026

Dados exclusivamente fictícios. Resultados locais não constituem publicação, auditoria independente nem homologação de produção.

## Resultado desta entrega

| Verificação | Resultado |
|---|---|
| `npm ci` a partir do lockfile | passou |
| `npm run lint` | passou |
| `npm run typecheck` (frontend, testes e servidor) | passou |
| `npm test` | **75 testes passaram**, três suítes |
| `npm run build` | passou; frontend, cache versionado PWA e bundle da Edge Function |
| Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e` | **21 testes passaram**, desktop, mobile e PWA |
| `npm run test:rls` em Supabase local | **15 testes pgTAP passaram**, rollback, após aplicar as 11 migrations em banco local descartável |
| RLS no Supabase remoto autorizado (Finanças casa) | **15 verificações pgTAP passaram**, em transação com rollback; confirmado que não ficaram usuários/famílias/lançamentos de teste |
| `npm run test:api` com Supabase local / Edge real | passou: bootstrap, login, convite, reuso negado, cadastro público negado, RLS HTTP, cartão, Pix, correção/rejeição, pagamento concorrente idempotente, salário mensal/correção versionada, calendário parcial, snapshot e recuperação |
| Backup + `node scripts/test-restore.mjs ARQUIVO_PRIVADO.dump` | passou: contagens financeiras, integridade Auth e **15 verificações RLS após restauração** |
| `npm audit --omit=dev` | zero vulnerabilidades conhecidas reportadas naquele momento |

A suíte de domínio/banco usa PostgreSQL real compilado para WASM (PGlite), com roles e `auth.uid()` de teste. Ela não substitui Auth/PostgREST/Edge: por isso também foi executada a integração HTTP no Supabase local com Docker. O smoke de API recusa URLs remotas. Credenciais de teste são aleatórias e ficam em `.cache/` ignorado, nunca no código ou nos logs de resultado.

## Cobertura dos critérios financeiros

| Critérios da especificação | Evidência |
|---|---|
| 1–3, histórico de empréstimo e pagamento fora de ordem | cronograma explícito, lacunas não presumidas e maior parcela quitada separada de obrigação aberta |
| 4–6, datas, pagamentos parciais e abertura | vencimento preservado, duas baixas, excesso negado, ausência de fluxo retroativo fictício |
| 7, fim de mês/fuso | 31/01, fevereiro comum/bissexto, março com dia 31 e mudança de ano |
| 8, valores variáveis, carência e quitação | alteração individual versionada; renegociação vinculada e cotação informada distinta de soma futura; não se inventa amortização/CET |
| 9–10, calendário de cartão e 6x200 | ciclos 04/11 vs 06/11, seis linhas exatas e consumo único |
| 11, transporte de saldo | 800 anteriores + 300 novos + 50 encargos = 1.150, origem fora do exigível ativo |
| 12–15, cartão compartilhado | titular/consumidor separados, privacidade por linha, Pix 400 informado/confirmado, saldo 250, fatura independente, pagamento parcial/idempotente e renegociação |
| 16–19, benefícios e metas | recarga não é salário; VA250 + débito150 = consumo400; uso pessoal não contribui; metas 600/400/700 sem dívida |
| 20, Casa sem responsável e múltiplos pagadores | responsável não inferido; dois membros baixam a mesma obrigação; consumo reconhecido uma vez |
| 21–22, privacidade | admin não lê conta/contrato privado; autorizado vê só próprias linhas; acesso estranho e escrita direta negados; RPC snapshot preserva RLS |
| 23, convites | expirado/reivindicado/consumido recusados; cadastro aberto negado; recuperação com senha nova e senha antiga recusada |
| 24, concorrência | mesma chave/payload não repete débito; mesma chave com outro payload e versão antiga são recusadas; duas chamadas HTTP concorrentes verificadas |
| 25–26, recorrências e coerência | regra/mês únicos, geração repetida sem duplicar, datas âncora, soma de partes, saldo, alocações e estornos |

Também há testes de datas futuras recusadas, saldo atual sem movimentos futuros, recebimento de empréstimo exigindo contrato, correção de consumo de conta parcialmente paga e compra dividida pessoal/Casa com privacidade do agregado, categoria privada/subcategoria/versão, helper de saldo não executável pelo browser, auditoria append-only e correção de acerto sem reaplicar envio rejeitado.

## Navegador e acessibilidade

Desktop e Pixel 7 emulados: navegação, saída, despesa VA+débito, empréstimo antigo com calendário completo/parcial, salário mensal e correção sem duplicar receita, validação de formulário com preservação de campos, categoria própria e Pix confirmado sem quitar fatura. Teclado e largura da tela foram verificados. Axe verificou critérios automatizáveis WCAG A/AA nas telas testadas, sem violações remanescentes. Isso não substitui avaliação humana com leitor de tela e familiares.

O projeto PWA usa build de produção: instala service worker, confere manifest/ícones, entra offline, recarrega o shell e verifica que caches não contêm URLs de Auth/PostgREST/Supabase. A causa da falha inicial foi `Vary: Origin` nos assets do servidor de preview; o cache de assets de mesmo domínio e hash ignora esse Vary, sem afetar respostas autenticadas.

Screenshots de teste foram geradas em `/tmp`, com dados fictícios. Não foram publicadas nem adicionadas ao Git. CI não envia traces ou exports para artifacts públicos.

## Repetir

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Para banco/HTTP completos: inicie Supabase local, gere `npm run build:edge`, sirva a função com configuração local e capture `supabase status -o env` em arquivo **privado**, sem imprimir. `SUPABASE_STATUS_FILE` seleciona esse arquivo para `npm run test:api`. Nunca aponte esse teste para produção. A fixture de bootstrap local não tem senha padrão e é conservada em `.cache/` para repetição.

No cloud, o navegador já instalado foi usado; o download inicial do Playwright era bloqueado pela política. Supabase local exigiu tratamento de proxy somente para destinos internos, sem desabilitar TLS. Detalhes em `DEPLOY.md`.

## Ainda não homologado

- Android/Samsung Internet/iOS em aparelhos reais, instalação nativa e leitores de tela com usuários reais.
- Auth, domínio técnico controlado, CORS, limites e recuperação num projeto remoto do proprietário.
- Restauração entre projetos/provedores distintos, plano de retenção criptografado e operação contínua.
- Testes autenticados na URL pública de homologação; o ambiente precisa permitir os hosts exatos de Supabase e Netlify.
- Recursos ainda pendentes listados em `PRODUCT_SPEC.md`; uma suíte verde não representa conclusão desses recursos.

## GitHub e regressões adicionais

A branch `feat/aplicativo-financas-familiares` foi enviada preservando os commits originais. O PR permanece em rascunho, sem merge: https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/pull/1 . CI remoto passou no commit `452e828`: https://github.com/Mikhael-Fee/Gest-o-Financeira-Familiar/actions/runs/43320253320 .

A chamada direta de correção salarial sem versão reproduziu uma falha de concorrência. A validação SQL passou a recusar versão ausente/nula; a regressão e a correção foram verificadas em PostgreSQL/PGlite e na integração HTTP local. O ensaio de restauração também compara as novas tabelas de previsão e referência salarial.
