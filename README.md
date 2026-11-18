# Entre Nós · Finanças da Família

App para celular (instalável como aplicativo) em que cada pessoa da família cuida das próprias finanças e todos acompanham as contas da **Casa**.

## Como o projeto está sendo feito

Em **etapas pequenas**, uma por vez, cada uma testada no celular antes da próxima. O plano está em [docs/ETAPAS.md](docs/ETAPAS.md).

A primeira tentativa (branch `feat/aplicativo-financas-familiares`) tentou fazer tudo de uma vez e ficou complexa demais para o dia a dia. Ela continua guardada como referência, assim como a especificação original em `docs/ESPECIFICACAO_CODEX.md`, que agora serve como lista de ideias para etapas futuras.

## Rodar no computador

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm test           # testes
npm run build      # versão para publicar (pasta dist)
```

Sem as variáveis do Supabase o app abre só no **modo demonstração**, com dados de exemplo. Com o banco ligado (site oficial), a demonstração não aparece; para mostrá-la numa prévia, use `VITE_DEMO=1`.

## Ligar ao Supabase

1. Copie `.env.example` para `.env.local` e preencha a URL e a chave **publicável** (anon) do projeto.
2. Rode as migrations da pasta `supabase/migrations` (SQL Editor do Supabase ou `supabase db push`).
3. Em *Authentication → Providers → Email*, deixe **desligado** o cadastro aberto ("Allow new users to sign up") e a confirmação por e-mail.
4. Crie cada pessoa em *Authentication → Users → Add user* com o e-mail `usuario@entrenos.local` (o app transforma o usuário digitado nesse e-mail) e uma senha.
5. Crie o perfil de cada um no SQL Editor:

```sql
insert into public.perfis (id, nome, papel)
select id, 'Nome que aparece no app', 'responsavel'  -- ou 'filho'
from auth.users where email = 'usuario@entrenos.local';
```

Quem não tem perfil não consegue entrar.

## Publicar no Netlify

O `netlify.toml` já tem o comando de build e a pasta `dist`. No Netlify, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do site.

## Segurança

Repositório público: nada de nomes reais, valores reais, senhas ou chaves no Git. Veja [docs/SEGURANCA.md](docs/SEGURANCA.md).
