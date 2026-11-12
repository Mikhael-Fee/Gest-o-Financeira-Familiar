# Segurança operacional

Este documento complementa `SEGURANCA.md`. O repositório é público; somente exemplos fictícios são permitidos.

## Fronteira de confiança

- Frontend usa somente URL e chave publicável/anon do Supabase. Nenhum `service_role` entra no bundle.
- Escrita financeira acontece por RPC autorizada, transacional e auditada. RLS protege leitura direta e `load_finances()`; GRANTs negam INSERT/UPDATE/DELETE diretos.
- Admin da Casa não recebe acesso a saldos, salários ou contratos privados de outro membro.
- Titular vê fatura integral; autorizado vê as próprias linhas e acertos. Revogação bloqueia novos lançamentos no cartão. Compras que o próprio usuário criou/consumiu continuam em seu histórico.
- IDs de contas em alocações compartilhadas não concedem SELECT nas contas. Somente o dono lê saldo/nome/corte.
- SQL privilegiado usa `search_path=''`, tabelas qualificadas e checagem de `auth.uid()`/família/versão. Helpers de saldo e identidades não são executáveis pelo navegador.

## Identidade por username

A Edge Function `identity` adapta username a uma identidade Supabase Auth com e-mail técnico `member-UUID@DOMINIO_CONTROLADO`. O domínio é pré-requisito operacional; não usar domínio de terceiros nem presumir entrega de e-mail. Não depende de SMTP para provisionamento administrativo com confirmação explícita.

Username é único, minúsculo, `[a-z0-9_]{3,32}`. Senha nova tem 12–128 caracteres, maiúscula, minúscula e número. Não há senha padrão. Primeiro admin é criado somente pelo operador com `scripts/bootstrap.mjs`; o banco recusa um segundo bootstrap.

Cadastro aberto fica desabilitado. Convites têm 256 bits aleatórios, hash SHA-256 no banco, uso único, expiração (48h para cadastro; 20min para recuperação) e autorização do admin. Reivindicar o convite o bloqueia contra concorrência. Se o provisionamento externo falhar, o convite fica bloqueado por segurança e o admin emite outro; não reutilizar manualmente tokens antigos.

Login retorna mensagem genérica e chama Auth inclusive para username inexistente. Rate limit persistente por identidade e global, em janela de 15min, complementa limites do Supabase Auth. O limite global é conservador para uma família; não é proteção de borda contra DDoS. Antes de produção, configure limites do provedor e monitore bloqueios sem registrar senhas/tokens.

Na recuperação, o admin cria o código mas não escolhe/vê a senha. Sessões Auth persistidas são removidas ao finalizar; JWTs de acesso já emitidos podem durar até a expiração configurada de 15 minutos. Desativar `profiles.active` também bloqueia leituras/comandos protegidos imediatamente por RLS. Mudança de username/desativação ainda são operações de suporte, sem tela dedicada.

## Sessões e browser

Tokens ficam apenas em memória. Renovação funciona com a aba aberta; recarregar pede novo login. Logout limpa estado e identidade; requisições antigas não sobrescrevem dados de uma sessão posterior. Não registrar dados financeiros em console/analytics.

CORS permite somente `APP_ORIGIN`. Não há cookies de autenticação, portanto não há sessão cookie enviada automaticamente a um site externo. Links de convite não são analytics. Código do convite só é exibido na área administrativa em memória; compartilhe por canal privado.

PWA armazena somente shell/assets locais, nunca respostas Auth/PostgREST/Functions. Sem rede, a interface informa o estado e não promete salvar/sincronizar transações. Fontes são locais. Headers CSP, anti-frame, referrer e permissions estão em `netlify.toml`.

## Antes de usar dados reais

Homologue Auth e recuperação com domínio controlado; execute RLS por consulta direta, teste revogação e duas sessões concorrentes; revise políticas e tempos de JWT; confirme backup/restauração de identidades e finanças; teste instalação em aparelhos reais. Revise as pendências de `PRODUCT_SPEC.md`. Não habilite deploy automático nem insira dados reais antes da autorização expressa do usuário.
