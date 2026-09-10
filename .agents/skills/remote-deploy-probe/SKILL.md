---
name: remote-deploy-probe
description: Use when deploying or testing ReadingRoom on the remote machine (zwei) — push local changes, pull and build with nix on the remote, run the server, then probe the live site with the Helium MCP. All remote access goes through the `readroom` tmux session's `remote` window; never open your own SSH.
---

# Deploy and test on the remote (zwei)

ReadingRoom's end-to-end testing runs against a real server on the NixOS host
`zwei`. Every remote command goes through the `readroom:remote` tmux window,
which already is a shell on `zwei`.

> **Never run `ssh` yourself.** No `ssh`, `scp`, or `rsync` from any shell — the
> `readroom:remote` window already is the connection. Send every remote command
> there; never dial in fresh.

## The two tmux layers

Local tmux session `readroom`:

| Window | What it is |
| --- | --- |
| `local` | persistent local shell — use it whenever a persistent local terminal is needed |
| `remote` | a shell already SSH'd into `zwei`; that shell runs its own tmux session |

Drive the local window:

```bash
tmux send-keys -t readroom:local '<command>' Enter
tmux capture-pane -t readroom:local -p -S -30   # read output; -S -N for more history
```

Drive the remote window the same way, but keystrokes land in the **remote** tmux's
active pane (that shell *is* the remote tmux client):

```bash
tmux send-keys -t readroom:remote '<command>' Enter
tmux capture-pane -t readroom:remote -p -S -30
```

The remote is the second tmux layer (session `0`). Its prefix2 is `C-\`: the
outer session consumes `C-b`, so `C-\` is the keystroke that reaches the remote.
When a human is attached locally, `C-b` drives the local session and `C-\`
drives the remote.

- Switch the remote's window: `tmux send-keys -t readroom:remote C-\\ 2`
  (remote prefix, then window number).
- Create a remote window: `tmux send-keys -t readroom:remote C-\\ c`.

Give each long-running remote task its own window — a `nix build`, the server, a
scratch shell — so sending keys to one never disturbs another.

## Testing workflow

1. **Push local changes.** In `readroom:local`:
   ```bash
   git push origin main
   ```
   Done when the push succeeds and `git status -sb` shows the branch level with
   `origin/main`.

2. **Pull on the remote.** In `readroom:remote`:
   ```bash
   git -C /tmp/readingroom-env/readingroom pull --ff-only
   ```
   Done when it fast-forwards (or reports already up to date) with no conflicts.
   If it fails with *not a git repository*, the checkout is not a real clone —
   repair it once (see **Setup**), then pull.

3. **Build and run with nix.** On the remote, in a build window:
   ```bash
   cd /tmp/readingroom-env/readingroom
   nix build .#        # or run it directly (below)
   ```
   Run the server on a port the local machine can reach:
   ```bash
   nix run .# -- --data-dir /tmp/readingroom-env/data --host 0.0.0.0 --port 8096
   ```
   Done when the log prints `Listening on http://0.0.0.0:8096`. Stop it with
   `C-c` in the same pane.

4. **Test through the Helium MCP.** The site is `http://zwei.time-augmented.ts.net:8096`
   (the tailnet name for `zwei`). Navigate there, take a snapshot, and exercise
   the flow. Confirm the result from `list_network_requests` and
   `evaluate_script` — the API calls and rendered state must match expectations.

## Setup (once)

The remote checkout must be a real git clone. A stub `.git/` (only `objects/`,
no `HEAD`/`config`) makes every git command fail with *not a git repository*.
Re-clone it, leaving the data dir untouched:

```bash
rm -rf /tmp/readingroom-env/readingroom
git clone https://github.com/Sleeping-Donut/readingroom.git /tmp/readingroom-env/readingroom
```

To force the remote tree to exactly match `origin/main` (discarding any drift on
the remote), fetch and hard-reset instead of pulling:

```bash
git -C /tmp/readingroom-env/readingroom fetch origin
git -C /tmp/readingroom-env/readingroom reset --hard origin/main
```

## Remote layout

Everything lives under `/tmp/readingroom-env/` on `zwei`:

| Path | Purpose |
| --- | --- |
| `/tmp/readingroom-env/` | root for all project files |
| `/tmp/readingroom-env/readingroom` | git checkout of this repo |
| `/tmp/readingroom-env/data` | data dir: `readingroom.db`, cache DB, `jwt_secret`, plugins |
| `/tmp/readingroom-env/http-dl` | HTTP download client dir |
| `/tmp/readingroom-env/media` | imported media |
| `/tmp/readingroom-env/log` | server log |

### The cache DB rides inside the data dir

There is no separate cache-db flag. The offline OpenLibrary cache lives at
`<data-dir>/ol_dump.sqlite` (see `crates/server/src/local_cache.rs`), so pointing
`--data-dir` at `/tmp/readingroom-env/data` picks up the existing cache DB
(`ol_dump.sqlite` + `-wal`/`-shm`) and the Lua plugins dir (`<data-dir>/plugins/`)
automatically.

Cache-related flags when you need them:

- `--import-dump <file.txt.gz>` — seed/rebuild the cache from a local OL dump
  file instead of downloading (one-shot, exits after import)
- `--backfill-fts` — rebuild offline-cache FTS indexes (one-time migration)
- `--plugin-dir <dir>` — extra plugin dirs beyond `<data-dir>/plugins/`

## Probe with curl

From the **local machine**, base URL `http://zwei.time-augmented.ts.net:8096`:

- Status sweep: `curl -s -o /dev/null -w '%{http_code}' <base>/<route>` across
  routes (`books`, `authors/<id>`, `queue`, `wanted`, `calendar`, `activity`,
  `settings/...`).
- API spot-checks: `curl -s <base>/api/v1/books | jq …`.

For anything a browser exercises, prefer the Helium MCP over curl.

## Gotchas learned the hard way

- **Stale nix artifacts:** if the served CSS looks old (dark theme, missing
  tokens), force a real build and verify the palette landed before re-running:
  ```bash
  nix build .# && grep -rl fbf8f1 result/share/readingroom | head -1
  ```
- **New pnpm dependency ⇒ vendor hash mismatch.** Set `pnpmDeps.hash = ""` in
  `nix/package.nix`, build once, copy the printed `got: sha256-…` back into the field.
- **A stub `.git` breaks every git step.** If `git` reports *not a git repository*
  while `.git/` visibly exists, it is a partial copy — re-clone (see **Setup**).
- **Don't trust rg `-r` while grepping for verification:** `rg -rn "pat" file`
  *replaces* matches with `n` in its OUTPUT ONLY — it makes clean files look mangled.
