# Backup e restauração operacional

Ensaio repetido em 16/11 com schema ampliado: criptografia/descriptografia, restauração em banco local descartável, contagens e digests das tabelas financeiras, integridade das identidades Auth e **27 verificações pgTAP/RLS após restaurar** passaram. Antes das migrations remotas, foi preservada uma cópia lógica cifrada de tabelas/funções/histórico do projeto autorizado. Essa cópia JSON não foi descrita como dump PostgreSQL remoto integral. O destino externo e o ensaio entre provedores continuam pendentes.

O plano Free não deve ser tratado como garantia de backup diário ou disponibilidade contínua. O projeto pode pausar por inatividade. Uma exportação JSON do aplicativo obedece à RLS, mas não preserva uma fotografia completa das identidades e do banco; não substitui este procedimento.

## O que preservar

Uma cópia consistente reúne `public` (finanças e vínculos), `private` (identidades, convites e comandos) e `auth` (usuários, hashes de senha e sessões). Preserve também migrations versionadas, papéis necessários, configurações Auth/Edge, domínio/origem e uma relação das configurações seguras, sem colocar seus valores em documentos públicos. O aplicativo não armazena anexos no Storage nesta versão; se isso mudar, os objetos e suas políticas passam a fazer parte obrigatória do backup.

Identidades Auth e perfis precisam manter os mesmos UUIDs na restauração. Restaurar somente as tabelas financeiras pode romper os vínculos e as permissões. Não copie sessões antigas como mecanismo de primeiro acesso; revise/invalide sessões após recuperação e exija autenticação nova.

## Criptografia local executável

`scripts/secure-backup.mjs` usa AES-256-GCM, IV aleatório de 96 bits, cabeçalho autenticado versionado e tag de 128 bits. A chave é um arquivo de **32 bytes aleatórios**, separado do backup, pertencente ao operador e sem acesso para grupo/outros. O script recusa destinos dentro do checkout, diretórios que não sejam privados, chaves com permissões amplas e sobrescrita de destino. Uma falha de autenticação remove o arquivo parcial; o dump só é publicado depois da validação da tag.

Prepare os diretórios privados **fora do checkout**, substituindo os caminhos pelos escolhidos no dispositivo do operador:

```sh
umask 077
mkdir -p /CAMINHO_PRIVADO/chaves /CAMINHO_PRIVADO/backups
chmod 700 /CAMINHO_PRIVADO/chaves /CAMINHO_PRIVADO/backups
openssl rand -out /CAMINHO_PRIVADO/chaves/entre-nos-backup.bin 32
chmod 600 /CAMINHO_PRIVADO/chaves/entre-nos-backup.bin
```

Não execute a geração sobre uma chave existente. A chave pode ser guardada num gerenciador de segredos ou em mídia separada; perder a única chave torna as cópias irrecuperáveis. Não envie a chave pelo chat, Git, CI ou junto do arquivo criptografado.

Com Supabase **local** iniciado, execute do diretório do repositório:

```sh
node scripts/secure-backup.mjs create \
  /CAMINHO_PRIVADO/backups/financas-DATA.dump.enc \
  /CAMINHO_PRIVADO/chaves/entre-nos-backup.bin
```

Esse comando usa exclusivamente o socket Docker local e o container `supabase_db_financas-familiares`, desconsiderando seletores de daemon remoto. Um único `pg_dump` consistente de `public`, `private` e `auth` é criptografado por streaming, sem criar dump intermediário em texto claro. O arquivo final só é publicado se o `pg_dump` e a criptografia terminarem com sucesso. Não é um comando de backup remoto.

Para criptografar um dump já existente, também em área privada:

```sh
node scripts/secure-backup.mjs seal \
  /CAMINHO_PRIVADO/backups/origem.dump \
  /CAMINHO_PRIVADO/backups/financas-DATA.dump.enc \
  /CAMINHO_PRIVADO/chaves/entre-nos-backup.bin
```

Esse modo preserva o original; o operador deve proteger e remover a cópia em claro depois de validar a cópia cifrada, respeitando sua política de retenção. Não colocar o dump em claro em artifacts ou volumes compartilhados.

## Ensaio de restauração

```sh
node scripts/secure-backup.mjs open \
  /CAMINHO_PRIVADO/backups/financas-DATA.dump.enc \
  /CAMINHO_PRIVADO/backups/ensaio.dump \
  /CAMINHO_PRIVADO/chaves/entre-nos-backup.bin
node scripts/test-restore.mjs /CAMINHO_PRIVADO/backups/ensaio.dump
```

`open` autentica a integridade antes de publicar o dump de destino. O ensaio existente restaura num **banco local descartável**, compara contagens e integridade de identidades e executa pgTAP/RLS. Não aponta para o projeto remoto e não redefine o banco original. Após o ensaio, remova o dump em claro e registre data, versões, duração, verificações e resultado, sem dados financeiros ou credenciais. A documentação de testes distingue o ensaio efetivamente executado das instruções que continuam pendentes.

Antes de confiar numa restauração entre projetos/provedores, confira extensões, versão do PostgreSQL, papéis de Auth e permissões do operador. Execute novamente constraints, saldos/obrigações, vínculos Auth/perfis, snapshots e acesso negado entre usuários. A autorização de produção e os destinos de recuperação continuam sendo decisões distintas.

## Cópia externa e retenção

O arquivo `.enc` deve sair do volume de desenvolvimento para um destino privado escolhido pelo proprietário, com autenticação forte e acesso mínimo. Guarde a chave em destino separado. Um exemplo inicial é sete cópias diárias, quatro semanais e doze mensais, com revisão da família e teste de recuperação periódico. A exclusão de cópias deve seguir política explícita; nenhum script desta entrega apaga backups automaticamente.

Não existe destino externo configurado nem agendamento de retenção comprovado apenas por este documento. Para automatizar, configure um serviço de armazenamento privado e um executor seguro, disponibilize a chave por arquivo secreto e registre somente o sucesso/erro e o identificador da cópia cifrada. Nunca publique dumps ou chaves em artifacts públicos do GitHub.

No projeto remoto, uma credencial da API de gerenciamento ou uma chave `service_role` **não é uma senha de conexão PostgreSQL**. O backup remoto integral requer a conexão documentada pelo provedor, autenticação segura, TLS verificado e permissões apropriadas; depois deve ser cifrado e restaurado em ambiente isolado. Não desative TLS, não modifique o projeto remoto nem invente credenciais para preencher essa etapa.

## Evidência do formato criptografado

`tests/secure-backup.test.ts` verifica igualdade dos bytes após cifrar/decifrar, ciphertext diferente com IV novo, recusa de adulteração/chave incorreta sem publicar dump, preservação de destino existente e recusa de chave com permissões abertas. Esses testes de arquivo não comprovam um `pg_dump`, restauração PostgreSQL ou armazenamento externo: cada operação exige sua própria evidência.
