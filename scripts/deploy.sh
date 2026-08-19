#!/usr/bin/env bash
#
# Ship deploy/ to the server over ssh.
#
#   ./scripts/deploy.sh first    # once: code + database + uploaded files
#   ./scripts/deploy.sh          # every time after: code only
#
# Targets the `hstgr` host from ~/.ssh/config (admin@148.230.83.102). Using the
# alias rather than the bare IP is deliberate — it carries the IdentityFile and
# IdentitiesOnly settings with it. Override for a different host:
#
#   REMOTE=admin@1.2.3.4 REMOTE_DIR=/srv/shimeles ./scripts/deploy.sh
#
set -euo pipefail

REMOTE="${REMOTE:-hstgr}"
ROOT_REMOTE="${ROOT_REMOTE:-root@148.230.83.102}"
REMOTE_DIR="${REMOTE_DIR:-/home/admin/app}"
SERVICE="${SERVICE:-shimeles}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL="$ROOT/deploy"
MODE="${1:-update}"

# Build here rather than expecting the caller to have done it. Copying the
# build into deploy/ by hand is one forgettable step, and forgetting it ships
# the *previous* build silently — the deploy reports success and the change
# simply isn't there. Skip with NO_BUILD=1 to re-send an existing bundle.
if [ "${NO_BUILD:-}" != "1" ]; then
	echo "==> building"
	(cd "$ROOT" && npm run build)
	rm -rf "$LOCAL/build"
	cp -r "$ROOT/build" "$LOCAL/build"
fi

# deploy/ is gitignored, so the operations guide cannot live there — it would
# vanish with the next `rm -rf deploy`. scripts/DEPLOYING.md is the tracked
# original; this puts a copy on the server, where you want it at 2am.
cp "$ROOT/scripts/DEPLOYING.md" "$LOCAL/OPERATIONS.md"

[ -d "$LOCAL/build" ] || { echo "no build in $LOCAL — run 'npm run build' first" >&2; exit 1; }

case "$MODE" in
first)
	# The database is copied through SQLite's own backup API, not with cp.
	# A live database keeps recent transactions in local.db-wal, so copying
	# local.db by itself loses them — and copying the -wal alongside it can
	# still tear if a write lands mid-copy. backup() takes a consistent
	# snapshot whether or not the app is running.
	STAGE="$(mktemp -d)"
	trap 'rm -rf "$STAGE"' EXIT
	echo "==> snapshotting database"
	(cd "$LOCAL" && node -e '
		const Database = require("better-sqlite3");
		const db = new Database("local.db", { readonly: true });
		db.backup(process.argv[1]).then(() => {
			console.log("    snapshot ok");
			process.exit(0);
		});
	' "$STAGE/local.db")

	echo "==> creating $REMOTE_DIR"
	ssh "$REMOTE" "mkdir -p '$REMOTE_DIR'"

	echo "==> sending code, uploads and database"
	rsync -avz --human-readable \
		--exclude 'node_modules' \
		--exclude 'server.log' \
		--exclude '.env' \
		--exclude 'local.db*' \
		--exclude '.svelte-kit' \
		"$LOCAL/" "$REMOTE:$REMOTE_DIR/"
	rsync -avz --human-readable "$STAGE/local.db" "$REMOTE:$REMOTE_DIR/local.db"

	cat <<-EOF

		Sent. Now, on the server (ssh $REMOTE):

		  cd $REMOTE_DIR
		  cp .env.example .env
		  \$EDITOR .env               # ORIGIN + a fresh BETTER_AUTH_SECRET
		  npm install                 # .npmrc pins --omit=dev --omit=optional
		  node --env-file=.env build/index.js   # check it boots, then ctrl-c

		Then install the systemd unit (scripts/shimeles.service).
	EOF
	;;

update)
	# Only the build output and the dependency manifests move. This mode
	# deliberately cannot touch local.db or .tempFiles/ — by the second
	# deploy those hold live donations, submissions and case documents, and
	# an --exclude is one typo away from destroying them. Not listing them
	# is safer than excluding them.
	echo "==> sending build"
	rsync -avz --human-readable --delete \
		"$LOCAL/build/" "$REMOTE:$REMOTE_DIR/build/"

	echo "==> sending manifests"
	# `migrate.mjs` rides along so it is always present when a migration is
	# needed — see §3 of OPERATIONS.md. It is inert unless it is run.
	rsync -avz --human-readable \
		"$LOCAL/package.json" "$LOCAL/package-lock.json" "$LOCAL/.npmrc" \
		"$LOCAL/OPERATIONS.md" "$LOCAL/migrate.mjs" \
		"$REMOTE:$REMOTE_DIR/"

	# Cheap and idempotent when nothing changed; necessary when it did.
	echo "==> npm install"
	ssh "$REMOTE" "cd '$REMOTE_DIR' && npm install --no-audit --no-fund"

	# Restarted over a separate root connection on purpose: `admin` has no
	# passwordless sudo on this box, so `sudo systemctl` from $REMOTE would sit
	# waiting for a password that never arrives.
	echo "==> restarting $SERVICE"
	ssh "$ROOT_REMOTE" "systemctl restart '$SERVICE' && sleep 3 && systemctl is-active '$SERVICE'"
	;;

*)
	echo "usage: $0 [first|update]" >&2
	exit 1
	;;
esac
