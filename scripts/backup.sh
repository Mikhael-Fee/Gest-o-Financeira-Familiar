#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${BACKUP_DIR:?Defina BACKUP_DIR em uma área privada fora do repositório}"
mkdir -p "$BACKUP_DIR"
backup_root="$(realpath "$BACKUP_DIR")"
repository_root="$(git rev-parse --show-toplevel)"
case "$backup_root/" in "$repository_root/"*) printf 'Backup deve ficar fora do repositório.\n' >&2; exit 1;; esac
backup_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
# Explicit local socket: never select a remote Docker host/context accidentally.
# One pg_dump snapshot includes Auth identities and financial records together.
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
 docker --host=unix:///var/run/docker.sock exec \
 "${SUPABASE_DB_CONTAINER:-supabase_db_financas-familiares}" \
 pg_dump -U postgres -d postgres --format=custom --no-owner \
 --schema=public --schema=private --schema=auth > "$backup_root/financas-$backup_stamp.dump"
printf 'Backup lógico local consistente, incluindo Auth, concluído. Proteja o arquivo e teste a restauração.\n'
