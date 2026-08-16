# Deploying, migrating, and adding packages

Everything you do to the running server after the app changes: shipping code,
adding packages, migrating the database, backing up, and rolling back.

The tracked original is **`scripts/DEPLOYING.md`** — edit it there. `deploy.sh`
copies it to `deploy/OPERATIONS.md` on every deploy, and from there to
`/home/admin/app/OPERATIONS.md` on the server, so the same guide is at hand
wherever you are standing. Those two copies are generated; changes to them are
overwritten by the next deploy. (`deploy/` is gitignored, which is why the
original cannot live there.)

`deploy/README.md` describes *what* is deployed; this describes *how to change
it*.

## The server

| | |
| --- | --- |
| Host | `admin@148.230.83.102`, ssh alias `hstgr`, AlmaLinux 9.8 |
| Root | `root@148.230.83.102` — needed for `systemctl`, `admin` has no passwordless sudo |
| Directory | `/home/admin/app` |
| Service | `shimeles.service`, enabled, runs as `admin` |
| Node | v24.19.0, **nvm-installed under `/home/admin/.nvm`** |
| npm | 11.17.0 |
| Web server | OpenLiteSpeed 1.9.0 (CyberPanel) proxying to `127.0.0.1:3000` |
| Database | `/home/admin/app/local.db`, SQLite in WAL mode |
| Uploads | `/home/admin/app/.tempFiles/` |
| `sqlite3` CLI | present, `/usr/bin/sqlite3` |

The app binds loopback only and is never reachable except through LiteSpeed.

---

## 1. Deploying code or content

Changes to `.svelte` files, routes, styles, images, copy — anything that is
purely build output. This is the overwhelmingly common case.

From the repository root:

```sh
./scripts/deploy.sh
```

That's the entire procedure. The script builds, copies the build into
`deploy/`, rsyncs it, syncs the manifests, runs `npm install`, and restarts the
service. About 20 seconds, with roughly one second of downtime at the restart.

**The last line of output is `active`.** That word is the success signal. If you
see anything else, the deploy did not complete — and because the script runs
under `set -euo pipefail`, it stops at the first failure rather than continuing.
A half-deploy is not a state you can reach.

### Verifying

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://srv1891814.hstgr.cloud/
curl -s https://srv1891814.hstgr.cloud/ | grep -o 'some text you just added'
```

Expect `200`, and your new content echoed back. Browsers cache hard; check with
curl before believing a "nothing changed" report from a browser tab.

### Why your data is safe

Update mode rsyncs `build/` and three manifest files. It does **not mention**
`local.db` or `.tempFiles/` at all — they are not excluded, they are simply
never named. An `--exclude` line is one typo away from destroying live
donations, submissions and case documents; a path that is never written cannot
be mistyped. This is why `first` mode is a separate branch of the script and
why you must never run it again.

---

## 2. Adding or changing an npm package

Do it locally first, as normal:

```sh
npm install some-package        # or npm uninstall / npm update
```

Then the extra step people forget — **`deploy/package.json` is not a symlink to
the root one**, it is a copy with the `prepare` script deliberately stripped
(see the trap list below). Sync the dependency block across:

```sh
node -e '
  const fs = require("fs");
  const root = JSON.parse(fs.readFileSync("package.json"));
  const dep  = JSON.parse(fs.readFileSync("deploy/package.json"));
  dep.dependencies = root.dependencies;
  dep.devDependencies = root.devDependencies;
  fs.writeFileSync("deploy/package.json", JSON.stringify(dep, null, "\t") + "\n");
'
cp package-lock.json deploy/package-lock.json
./scripts/deploy.sh
```

The deploy rsyncs both manifests and runs `npm install` on the server, which
picks up the new package. When nothing changed, that install is a sub-second
no-op — it is not worth trying to skip.

### Runtime vs. dev dependencies

The server installs **runtime only**. `deploy/.npmrc` sets `omit[]=dev` and
`omit[]=optional`. If your new package is a `devDependency`, it will not be on
the server, and code that imports it at runtime will crash on boot with
`ERR_MODULE_NOT_FOUND`. Anything imported from `src/lib/server/**` or any
`+page.server.ts` must be a real `dependency`.

`--omit=optional` is not cosmetic either: `better-auth` declares an *optional
peer* on `drizzle-kit`, so a plain `--omit=dev` still drags in drizzle-kit,
whose nested `esbuild@0.18` fails its postinstall version check against the
hoisted `esbuild`. The install dies outright.

### Native modules

A package with a compiled binding (like `better-sqlite3`) needs two things:

1. An entry in `deploy/.npmrc`: `allow-scripts[]=<package-name>`. npm 11 does
   not run dependency install scripts unless allowed, and without the script
   the binding is never built. The server boots and dies on first use with
   `ERR_DLOPEN_FAILED`.
2. To be installed **on the server**, not shipped from your machine. Native
   bindings are tied to the Node ABI and to glibc. Your machine and the server
   run different Node builds. This is exactly why the deploy runs `npm install`
   remotely instead of rsyncing `node_modules`.

---

## 3. Database migrations

**There is no migration runner in the deployed bundle today.** The app opens
`local.db` and queries it; nobody applies pending SQL. A schema change that
reaches the server without a migration produces `no such table` or `no such
column` at runtime, on the first request that touches it.

`drizzle-kit` is a dev dependency and is deliberately absent from the server, so
`drizzle-kit migrate` is not available there. Do not install it to work around
this — it drags in the esbuild conflict above.

The path below uses `drizzle-orm`'s own migrator, which **is** a runtime
dependency and is already installed on the server. It has been verified against
a copy of the production database: it applies pending files, records them in
`__drizzle_migrations`, and re-running it is a no-op.

### Step 1 — generate the migration locally

```sh
npm run db:generate          # writes a new file into drizzle/
```

Read the generated SQL before going further. Drizzle expresses a SQLite column
change as create-table / copy / drop-table, and a rename it failed to infer
looks identical to a drop plus an add. Reading the file is what tells the two
apart, and one of them loses a column of live data.

### Step 2 — back up production

Non-negotiable, and the reason is in the next section. Do this every time.

### Step 3 — ship the migration files

`deploy.sh update` does not send `drizzle/`, because it normally has no reason
to. Send it explicitly:

```sh
rsync -avz drizzle/ hstgr:/home/admin/app/drizzle/
```

Also write the runner once, into `deploy/migrate.mjs`, and let the normal
deploy carry it thereafter:

```js
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const db = drizzle(new Database('local.db'));
migrate(db, { migrationsFolder: 'drizzle' });
console.log('migrations applied');
```

### Step 4 — stop, migrate, start

Stop the app first. A migration that rewrites a table while the app is writing
to it is how you get a torn database, and WAL mode does not save you from
schema changes landing under a live connection.

```sh
ssh root@148.230.83.102 'systemctl stop shimeles'
ssh hstgr 'cd /home/admin/app && node migrate.mjs'
ssh root@148.230.83.102 'systemctl start shimeles && sleep 3 && systemctl is-active shimeles'
```

Then deploy the code that expects the new schema:

```sh
./scripts/deploy.sh
```

**Order matters.** Migrate first, then ship code — new code against an old
schema is a guaranteed error, whereas old code against a new schema is usually
harmless for the minute in between (added columns and tables are simply
ignored). If the migration *drops* something the running code still reads,
that ordering flips: take the app down for the whole window instead.

### The alternative, if you prefer raw SQL

`sqlite3` is installed on the server. You can apply the generated file by hand:

```sh
rsync -avz drizzle/0007_whatever.sql hstgr:/tmp/
ssh root@148.230.83.102 'systemctl stop shimeles'
ssh hstgr 'cd /home/admin/app && sqlite3 local.db < /tmp/0007_whatever.sql'
ssh root@148.230.83.102 'systemctl start shimeles'
```

This works, but nothing records that the migration ran, so `__drizzle_migrations`
drifts out of sync with reality and the next `migrate.mjs` will try to apply the
same file again. Prefer the migrator.

---

## 4. Backups

Take one before every migration, and on a schedule you actually keep.

```sh
ssh hstgr 'cd /home/admin/app && node -e "
  const Database = require(\"better-sqlite3\");
  const db = new Database(\"local.db\", { readonly: true });
  db.backup(\"/home/admin/backup-\" + Date.now() + \".db\").then(() => process.exit(0));
"'
```

**Use `backup()`, never `cp`.** The database runs in WAL mode, so recent
transactions live in `local.db-wal` and not in `local.db` at all. Copying
`local.db` on its own silently loses them, and copying the `-wal` alongside it
can still tear if a write lands between the two copies. `backup()` takes a
consistent snapshot whether or not the app is running.

**Back up `.tempFiles/` at the same time.** The database holds rows that point
at files in there. A database restored to a moment the uploads directory does
not match is a set of case records pointing at documents that do not exist.

```sh
rsync -avz hstgr:/home/admin/app/.tempFiles/ ./backup-tempfiles/
```

Neither `local.db` nor `.tempFiles/` may ever be committed to git — they hold
beneficiary documents.

---

## 5. Rolling back

The build is reproducible from git, so a rollback is a deploy of an older
commit:

```sh
git stash                      # if you have uncommitted work
git checkout <last-good-sha>
./scripts/deploy.sh
git checkout main
```

This rolls back **code only**. A migration is not undone by checking out an old
commit — the schema change is already in `local.db`. Undoing that means
restoring the backup you took in step 2, which is the entire reason step 2 is
not optional.

---

## 6. Traps

Each of these has already cost real debugging time.

- **`ExecStart` in `shimeles.service` contains a Node version number**
  (`/home/admin/.nvm/versions/node/v24.19.0/bin/node`), because Node came from
  nvm and there is no `/usr/bin/node` at all. Running `nvm install` on the
  server breaks the service with `status=203/EXEC`. Installing Node
  system-wide would remove the trap permanently.

- **`omit[]=` in `deploy/.npmrc` is load-bearing syntax.** `omit` is an array
  config. `omit=dev,optional` is silently ignored by npm 10 and rejected as
  invalid by npm 11; a repeated plain `omit=` key overwrites instead of
  appending. Both wrong spellings look fine and quietly install the full dev
  tree.

- **`deploy/package.json` has no `prepare` script, on purpose.** The root one
  runs `svelte-kit sync`, which has nothing to sync in a build bundle and dumps
  a stack trace on every server install. Never copy the root `package.json`
  over it wholesale — sync only the dependency blocks, as in section 2.

- **OpenLiteSpeed duplicates the `Origin` header when proxying.** The app
  compensates in `src/hooks.server.ts` with `handleCsrf`, and
  `csrf.checkOrigin` is off in `vite.config.ts` because of it. Without this,
  every form POST returns 403. That code is correct on any proxy and is not a
  workaround to undo later.

- **Restarts need the root connection.** `admin` has no passwordless sudo, so
  `sudo systemctl` over the `hstgr` alias hangs waiting for a password that
  never arrives.

- **Never `pkill -f build/index.js` over ssh.** The pattern matches your own
  remote command line and kills the session — twice, in practice, once leaving
  the service stopped. Use `systemctl`, or a bracket pattern like
  `[b]uild/index.js`.

- **`bun` crashes on `better-sqlite3`.** Standalone database scripts must run
  under `node` or `tsx`.

---

## 7. When something is wrong

```sh
ssh root@148.230.83.102 'systemctl status shimeles'
ssh root@148.230.83.102 'journalctl -u shimeles -n 100 --no-pager'
ssh root@148.230.83.102 'journalctl -u shimeles -f'        # follow live
```

| Symptom | Almost always |
| --- | --- |
| `status=203/EXEC` | Node moved — nvm upgrade broke the `ExecStart` path |
| `ERR_MODULE_NOT_FOUND` on boot | A runtime import is declared as a `devDependency` |
| `ERR_DLOPEN_FAILED` | Native binding not built — missing `allow-scripts[]` |
| `no such table` / `no such column` | Code deployed ahead of its migration |
| 403 on every form POST | The CSRF hook or `checkOrigin` was reverted |
| 502 from LiteSpeed | App is down; check `systemctl status` |
| Changes not visible | Browser cache — confirm with `curl` first |

## 8. Still outstanding

- **SMTP is not configured.** `SMTP_HOST` is empty, so notification mail is
  logged and skipped. Form submissions succeed; nobody is emailed.
- **No automated backups.** Section 4 is manual today.
- **`shimelesaberafoundation.org` is untouched** — still Cloudflare in front of
  a WordPress site on another host. Pointing it here is a deliberate cutover,
  not part of any deploy.
