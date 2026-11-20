#!/usr/bin/env bash
# Solaris Studio: diagnose isolated Supabase PostgreSQL exit during DROP DATABASE.
# NO backup decryption, production Supabase access, exposed ports, or volume mounts.
set -Eeuo pipefail
umask 077
IMAGE="supabase/postgres:17.11.0.019"
CONTAINER="solaris-pg-doctor-$$"
BASE="$HOME/solaris-recovery"
mkdir -p "$BASE"
OUT=$(mktemp -d "$BASE/pg-doctor-XXXXXXXX")
echo "Private diagnostic files: $OUT"
cleanup() {
  rc=$?
  trap - EXIT
  if docker inspect "$CONTAINER" >/dev/null 2>&1; then
    docker inspect "$CONTAINER" >"$OUT/container-inspect.private.json" 2>/dev/null || true
    docker logs "$CONTAINER" >"$OUT/container.private.log" 2>&1 || true
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  exit "$rc"
}
trap cleanup EXIT
docker info >/dev/null 2>&1 || { echo "Docker unavailable"; exit 1; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Image missing: $IMAGE"; exit 1; }
echo "[1/3] Starting only a disposable, network-isolated PostgreSQL container"
docker run -d --name "$CONTAINER" --network none \
  --tmpfs /var/lib/postgresql/data:rw,size=1g --memory 3g \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" \
  postgres -c config_file=/etc/postgresql/postgresql.conf \
  -c cron.launch_active_jobs=off >"$OUT/container-id.private.txt"
READY=0
for i in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U supabase_admin >/dev/null 2>&1; then
    READY=1; break
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != true ]; then break; fi
  sleep 1
done
if [ "$READY" != 1 ]; then
  echo "Container did not become ready."
  docker inspect -f 'Docker state: {{.State.Status}}; exit={{.State.ExitCode}}; OOMKilled={{.State.OOMKilled}}' "$CONTAINER" 2>/dev/null || true
  exit 1
fi
echo "[2/3] Checking database sessions without modifying them"
docker exec "$CONTAINER" psql -X -U supabase_admin -d template1 -At -v ON_ERROR_STOP=1 \
  -c "SELECT 'Sessions using postgres database: ' || count(*) FROM pg_stat_activity WHERE datname='postgres';"
docker exec "$CONTAINER" psql -X -U supabase_admin -d template1 -At -v ON_ERROR_STOP=1 \
  -c "SELECT 'Role can signal other backends: ' || (rolsuper OR pg_has_role('supabase_admin','pg_signal_backend','member')) FROM pg_roles WHERE rolname='supabase_admin';" || true
echo "[3/3] Reproducing DROP DATABASE only inside this disposable container"
set +e
docker exec "$CONTAINER" psql -X -U supabase_admin -d template1 -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE postgres WITH (FORCE)' >"$OUT/drop.private.log" 2>&1
DROP_RC=$?
set -e
echo "DROP operation exit code: $DROP_RC"
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker inspect -f 'Docker state: {{.State.Status}}; exit={{.State.ExitCode}}; OOMKilled={{.State.OOMKilled}}' "$CONTAINER" || true
  echo 'Relevant server shutdown lines (the full log stays private):'
  docker logs "$CONTAINER" 2>&1 |
    grep -Ei 'FATAL|PANIC|terminat|shut down|killed|signal|database system|error|crash' |
    tail -n 8 | cut -c 1-200 || true
fi
echo "Private diagnostic folder: $OUT"
echo "Test complete. No backup was opened, and no production database was contacted."
