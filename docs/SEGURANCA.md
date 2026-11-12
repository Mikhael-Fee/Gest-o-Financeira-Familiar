# Segurança e privacidade — repositório público

Este repositório está **público** e contém apenas exemplos fictícios e anônimos. Não inserir nome completo de pessoas, salários reais, números de documentos, extratos, contas bancárias, nomes de usuário reais, tokens, senhas ou dados familiares privados em commits, issues, CI ou screenshots.

## Variáveis de ambiente

- Mantenha `.env`, `.env.local`, `.env.production` e arquivos equivalentes fora do Git.
- No frontend, só utilize chaves PUBLICÁVEIS e URLs do Supabase, mesmo assim aplicando RLS.
- Chaves secretas `service_role`/secret key e operações `auth.admin.*` ficam exclusivamente em servidor/Edge Function com autenticação e autorização adequadas.
- Usar convites individuais, únicos e expirados; não permitir cadastro aberto sem convite, nem enumerar usuários por respostas de login.

## Supabase

- Habilitar RLS e restringir GRANTs em tabelas expostas; testar SELECT/INSERT/UPDATE/DELETE e negar usuários estranhos.
- Proibir acesso cruzado a perfis financeiros privados, inclusive por IDs adivinhados, filtros, views e RPCs.
- Administrador da Casa gerencia convites e configurações coletivas, não vê automaticamente contas privadas.
- Proteger exportações, trilha de auditoria, exclusões/estornos e backups. Validar restauração em ambiente de teste.

## Implantação

- Antes de publicar: revise secrets, CORS, políticas, rate limits, senhas e recuperação, backups, RLS e testes de ponta a ponta.
- Nunca publicar app com banco de demonstração aberto ou serviços de e-mail falsos.
- Não configurar deploy automático da main até aprovação do usuário.

Documentação oficial: https://supabase.com/docs/guides/database/postgres/row-level-security ; https://supabase.com/docs/guides/security/production-checklist
