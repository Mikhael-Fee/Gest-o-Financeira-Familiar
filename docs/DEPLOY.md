# Supabase, desenvolvimento e publicação futura

**Nenhum deploy em produção é parte dos scripts de instalação/CI.** O proprietário autorizou homologação com dados fictícios. Produção e dados reais continuam exigindo autorização própria.

## Desenvolvimento sem credenciais

Node 24 e npm. Execute `npm ci`, `npm run dev`. Escolha **Explorar demonstração**. Dados fictícios ficam na memória e desaparecem ao sair. Para uma versão de produção local: `npm run build` e `npm run preview`.

## Supabase local, com Docker

1. `npx supabase start` (usa apenas a configuração local `supabase/config.toml`).
2. As migrations locais criam schema, RLS, GRANTs, RPCs e adaptação de identidade. `seed.sql` não cria contas nem senhas padrão.
3. Configure `.env.local` com URL e chave publicável locais; não copie service key para uma variável VITE_. Não publique a saída de `supabase status`.
4. Para a Edge Function, crie arquivo **ignorado** `.env.functions.local` com `APP_ORIGIN` e `AUTH_EMAIL_DOMAIN`. No local, use uma identidade de teste em domínio reservado/controlado; em produção é obrigatório domínio sob seu controle. O runtime local fornece SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.
5. Execute `npm run build:edge` para gerar o bundle da função com dependências verificadas pelo lockfile. Depois, `npx supabase functions serve identity --env-file .env.functions.local`. A função valida a sessão explicitamente para criar convites; login/consumo de convite precisam de gateway sem JWT (`verify_jwt=false` só nesta função).
6. Para o primeiro administrador, injete em um terminal privado SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTH_EMAIL_DOMAIN, BOOTSTRAP_USERNAME e BOOTSTRAP_PASSWORD; execute `node scripts/bootstrap.mjs`. O script não imprime valores e não oferece credenciais padrão. Remova as variáveis ao terminar.
7. Entre pelo username, abra Configurações e emita convites individuais. Use dados fictícios para homologar.

Não use `db reset` num projeto que contenha dados a preservar. Para repetir testes, use banco descartável. Migrations deste repositório são uma base inicial; antes de aplicá-las em banco existente, inspecione conflitos e faça backup.

## Projeto Supabase remoto — somente após autorização

- Criar projeto/região adequada e configurar domínio técnico controlado (`AUTH_EMAIL_DOMAIN`). Desabilitar cadastros públicos; revisar políticas Auth e expiração de JWT em 900 segundos.
- Aplicar migrations em ambiente de homologação, executar testes SQL e testes de API antes de produção. Não expor schema `private` no Data API.
- Configurar somente `APP_ORIGIN=https://SEU_HOST` e `AUTH_EMAIL_DOMAIN=SEU_DOMINIO` como configuração adicional da Edge Function. Chaves administrativas ficam no servidor, via ambiente seguro da plataforma.
- Implantar a função identity no projeto autorizado com JWT do gateway desativado e verificações próprias habilitadas. Não desligar autenticação/RLS nas tabelas para “fazer funcionar”.
- Rodar bootstrap uma vez, em terminal seguro, usando senha forte sem valor padrão. Validar conta por convite, reset, expiração, mensagens genéricas e limites. Não usar e-mail técnico para recebimento ou recuperação externa.
- Produzir backup e testar restauração. Supabase Free pode pausar por inatividade e não fornece backup diário gerenciado: não prometer disponibilidade contínua.

## Netlify — somente após autorização

- Importar o repositório sem habilitar deploy automático antes da revisão. Build `npm run build`; diretório `dist`.
- Configurar **somente** VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com valores publicáveis do projeto homologado.
- Revisar `netlify.toml`: rewrite SPA, CSP, proteção de frame e política de permissões. Ajustar `APP_ORIGIN` na função para o host final exato.
- Publicar por ação explícita após testes. Não usar domínio de preview variável como origem irrestrita; homologação deve ter origem definida.
- Testar manifest/ícones/HTTPS, rotas profundas, login/logout, sessão expirada, modo offline e atualização de service worker. Android/Samsung: menu de instalação. iOS: Safari → Compartilhar → Adicionar à Tela de Início.

## Backup/restauração

`scripts/backup.sh` faz um único `pg_dump` **local**, em snapshot consistente, incluindo schemas `public`, `private` e `auth`, em BACKUP_DIR privado fora do repositório. Usa o socket Docker local explicitamente e arquivo com permissões restritas. Isso contém mapeamentos de identidades e hashes de convites; trate como confidencial. Não subir no Git, artifacts de CI ou armazenamento público.

Este dump inclui identidades Auth, IDs e hashes de senha. Um backup operacional completo também precisa dos papéis/configurações pertinentes e arquivos Storage, se adicionados no futuro. CSV/JSON da interface não substitui dump consistente. Não restaurar os dados financeiros sem manter os mesmos IDs Auth.

Para restauração de ensaio: crie instância descartável compatível com PostgreSQL/Supabase, aplique schema e dados na ordem, restaure identidades conforme processo do provedor, valide FKs, contagens, saldos e testes de permissão. Verifique que tokens/sessões antigos não sejam reutilizados inadvertidamente. Registre data, versões, duração e resultados, sem dados pessoais no relatório. Somente depois adote rotina de retenção criptografada externa (por exemplo, cópias diárias e mensais conforme acordo da família).


### Ensaio local executável

Com o banco local sem novas escritas entre backup e verificação:

```sh
BACKUP_DIR=/CAMINHO_PRIVADO_FORA_DO_REPOSITORIO scripts/backup.sh
node scripts/test-restore.mjs /CAMINHO_PRIVADO_FORA_DO_REPOSITORIO/financas-TIMESTAMP.dump
```

O ensaio cria banco descartável no container local, restaura com o papel local `supabase_admin` (necessário para restaurar ACLs/default privileges de Auth), compara contagens e integridade das identidades e executa os 15 testes de RLS. O banco temporário é removido ao final. Não usar credenciais de produção nem executar contra host remoto. Em outro provedor, as permissões do operador e os papéis de Auth precisam de procedimento específico.

### Particularidades do cloud com proxy

Neste ambiente, o BusyBox wget do healthcheck de Auth ignorou NO_PROXY. A validação usou um wrapper somente no container local, com `wget -Y off` exclusivamente para localhost/127.0.0.1; destinos externos mantiveram proxy e TLS. O gateway interno `kong` foi acrescentado às exclusões locais do Docker, preservando as demais configurações. Essas correções não são mudanças de rede de produção.

O bundle `handler.generated.js` é ignorado pelo Git e gerado a partir de `server/identity.ts` com `npm run build:edge`. Ele evita downloads de dependências dentro da Edge Function; a instalação npm continua verificando TLS e integridade do lockfile. Gere o bundle antes de servir ou implantar a função.

O helper opcional `scripts/cloud-start-local.sh` reproduz o início local com o tratamento do healthcheck neste cloud. Mantém o estado da CLI em `SUPABASE_HOME` dentro de `.cache/`, com telemetria desabilitada, sem alterar `HOME`. Ele mantém o log da CLI em `.cache/supabase-start.private.log` (ignorado e privado), porque a CLI pode incluir chaves no resultado. Não publique esse log. Para a demonstração e os testes de domínio, Docker/Supabase não são necessários.

## Homologação autorizada — estado em 12/11/2026

Foi selecionado pelo proprietário o projeto existente e vazio na organização **Finanças casa**: `ovoqhnoaigjzihhpdukn`, região existente `us-east-1`, plano Free. A organização Grupo de Louvor está fora do escopo e não foi alterada. Não foi contratado plano ou adicional.

As 11 migrations foram aplicadas transacionalmente, preservando versões, nomes e SQL no histórico `supabase_migrations.schema_migrations`. Não foi executado reset remoto. Todas as tabelas públicas têm RLS. Cadastro aberto e anônimo estão bloqueados, senha mínima de 12 caracteres e JWT de 900 segundos; a função `identity` está ativa com autorização própria. Origem e redirects ficam restritos a `https://entre-nos-homologacao.netlify.app`. O mesmo hostname controlado é o domínio das identidades técnicas; não é usado como serviço de e-mail.

Site Netlify separado: `entre-nos-homologacao`, com a branch `feat/aplicativo-financas-familiares`. O frontend recebeu somente URL Supabase e chave publishable. O host reservado e o status de publicação devem ser distinguidos dos testes autenticados; consulte o relatório de homologação e `TEST_PLAN.md` para a validação efetivamente concluída. A `main` não foi mesclada nem configurada como produção.
