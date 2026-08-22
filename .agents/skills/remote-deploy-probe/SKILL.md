---
name: remote-deploy-probe
description: Use when deploying ReadingRoom to the remote machine (zwei) from the 'foropen' tmux session, or when probing/verifying the running server from the local machine with curl or the helium devtools mcp
---

# Deploy to and probe the remote machine (zwei)

## Rules

1. **Never SSH directly.** The persistent `foropen` tmux session already has SSH
   connections into the remote machine. Interact only via:
   - `tmux send-keys -t foropen:<window>.<pane> '<command>' Enter`
   - `tmux capture-pane -p -t foropen:<window>.<pane> -S -30` (read output; `-S -N`
   for more history)
2. **Remote layout** — everything lives in `/tmp` on zwei:

   | Path | Purpose |
   | --- | --- |
   | `/tmp/readingroom` | Git checkout of this repo |
   | `/tmp/readingroom-data` | Data dir: `readingroom.db`, cache DB, jwt_secret, plugins |
   | `/tmp/readingroom-http-dl` | HTTP download client dir |
   | `/tmp/readingroom-media` | Imported media |
   | `/tmp/readingroom.log` | Server log |

3. **The remote is NixOS.** Build/run with `nix run .# -- …` from `/tmp/readingroom`.
4. **Port 8096 for local probing.** Start the server with
   `--host 0.0.0.0 --port 8096` so the local machine can reach it.

## Deploy

```bash
# 1. Push local work first (remote pulls from origin)
git push origin main

# 2. Pull on the remote, through tmux
tmux send-keys -t foropen:2.1 'cd /tmp/readingroom && git pull' Enter
```

## Run

In the tmux pane sitting at `/tmp/readingroom`:

```
nix run .# -- --data-dir /tmp/readingroom-data --host 0.0.0.0 --port 8096
```

Stop a running instance by sending `C-c` to the same pane. Watch startup with
capture-pane until you see `Listening on http://0.0.0.0:8096`.

## Probe

From the **local machine**, base URL is `http://zwei.time-augmented.ts.net:8096`:

- Status sweep: `curl -s -o /dev/null -w '%{http_code}' <base>/<route>` across routes
  (`books`, `authors/<id>`, `queue`, `wanted`, `calendar`, `activity`, `settings/...`).
- API spot-checks: `curl -s <base>/api/v1/books | jq …`.
- Browser checks: use the **helium devtools mcp** against the same base URL — navigate,
  screenshot, evaluate JS for console errors and computed styles.

## Gotchas learned the hard way

- **Stale nix artifacts:** if the served CSS looks old (dark theme, missing tokens),
  force a real build and verify the palette landed before re-running:
  ```bash
  nix build .# && grep -rl fbf8f1 result/share/readingroom | head -1
  ```
- **New pnpm dependency ⇒ vendor hash mismatch.** Set `pnpmDeps.hash = ""` in
  `nix/package.nix`, build once, copy the printed `got: sha256-…` back into the field.
- **Don't trust rg `-r` flag while grepping for verification:** `rg -rn "pat" file`
  *replaces* matches with `n` in its OUTPUT ONLY — it makes clean files look mangled.
