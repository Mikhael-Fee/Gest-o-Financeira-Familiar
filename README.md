# Entre Nós · Finanças Familiares

Aplicação React/TypeScript/PWA com núcleo financeiro em centavos inteiros, integração Supabase, migrations/RLS, autenticação por convite e demonstração isolada com dados fictícios. Interface em português, escura e mobile-first.

**Versão de desenvolvimento, sem publicação em produção e sem dados reais.** Há funcionalidades do contrato original que ainda precisam de ampliação/homologação; consulte [escopo e limites](docs/PRODUCT_SPEC.md). Não interpretar uma suíte local verde como autorização para usar finanças reais.

## Executar

```sh
npm ci
npm run dev
```

Escolha **Explorar demonstração**. Ela não precisa de Supabase, não grava no localStorage e descarta alterações ao sair. Dados autenticados usam PostgreSQL/Supabase via comandos transacionais e RLS; não há fallback silencioso para demonstração depois do login.

Para integrar um Supabase de desenvolvimento, siga [DEPLOY.md](docs/DEPLOY.md), copie `.env.example` para `.env.local` e use somente URL/chave publicável no frontend. Credenciais administrativas ficam exclusivamente no servidor. Não executar comandos remotos/deploy sem autorização.

## Verificar

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

No ambiente cloud com Chromium existente, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e`. A suíte PWA usa o build, portanto execute `build` antes. `npm run test:db` usa PostgreSQL WASM/PGlite real com roles/RLS locais. `npm run test:rls` usa pgTAP no Supabase local iniciado. Evidências e limitações estão em [TEST_PLAN.md](docs/TEST_PLAN.md).

## Organização

- `src/domain`: dinheiro, datas, cronogramas, projeções, saldos, estados e contribuições.
- `src/data`: repositórios separados de demonstração e Supabase, comandos e validações locais.
- `src/App.tsx`: rotas, formulários e interface acessível.
- `supabase/migrations`: modelo, permissões, comandos ACID, identidade e snapshot de leitura.
- `supabase/functions/identity`: adaptação segura username → Supabase Auth.
- `tests`: domínio, integração PostgreSQL/RLS e E2E desktop/mobile/PWA.
- `scripts`: bootstrap administrativo explícito, backup local e geração de cache seguro.
- `.github/workflows/ci.yml`: lint, tipos, testes, build e E2E, sem deploy e sem artifacts financeiros.

## Guias

- [Guia para familiares](docs/GUIA_FAMILIA.md)
- [Produto e decisões de arquitetura](docs/PRODUCT_SPEC.md)
- [Regras financeiras](docs/FINANCIAL_RULES.md)
- [Modelo de dados](docs/DATA_MODEL.md)
- [Segurança](docs/SECURITY.md)
- [Supabase, publicação futura e backups](docs/DEPLOY.md)
- [Testes e evidências](docs/TEST_PLAN.md)

O contrato integral original permanece em [ESPECIFICACAO_CODEX.md](docs/ESPECIFICACAO_CODEX.md). O administrador da Casa não tem acesso automático a salários, saldos ou contratos pessoais. Não há integração bancária automática, cálculo de CET inventado ou confirmação presumida de pagamentos.
