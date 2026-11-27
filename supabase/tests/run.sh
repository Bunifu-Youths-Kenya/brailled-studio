#!/usr/bin/env bash
# Tests the migration in a throwaway Postgres container, which is removed afterwards. Needs Docker and the
# postgres:17-alpine image.
set -euo pipefail
cd "$(dirname "$0")/.."
name="brailled-sql-test-$$"
docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
trap 'docker stop "$name" >/dev/null' EXIT
sql() { docker exec -i "$name" psql -U postgres -h 127.0.0.1 -X -q -v ON_ERROR_STOP=1 "$@"; }
for _ in $(seq 60); do sql -c 'select 1' >/dev/null 2>&1 && break; sleep 1; done
sql < tests/stand-in.sql
for file in migrations/*.sql; do sql < "$file"; done
sql -o /dev/null < tests/limits.sql 2>&1 | sed -E 's/^NOTICE: +//'

# Requests arriving together: a hundred at once for a person allowed ten.
sql -c "insert into auth.users (id) values ('00000000-0000-0000-0000-000000000004');
    update app_settings set requests_per_minute = 1000, daily_requests = 10, everyone_daily_requests = 100000;"
passed=$(docker exec "$name" sh -c 'for i in $(seq 100); do psql -U postgres -h 127.0.0.1 -XqtA \
    -c "select take_quota(\$\$00000000-0000-0000-0000-000000000004\$\$, 1)" & [ $((i % 25)) = 0 ] && wait; done; wait' |
    grep -c '^ok$')
if [ "$passed" = 10 ]; then echo 'PASS requests arriving together cannot pass the limit'
else echo "FAIL requests arriving together: $passed passed, not 10"; exit 1; fi
