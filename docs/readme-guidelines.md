# Top-level README guidelines

How to write and maintain `README.md`. The key split: **install** is for users who do **not** have the repo; **development** is for contributors who do.

## The #1 rule: the Install section assumes no local clone

Install instructions must work for someone who only sees the GitHub page. Never assume the repo is downloaded:

- ❌ Local refs that need a checkout: `nix build .#server`, `nix build .`, `docker build -t readingroom .`
- ✅ Remote refs that work from anywhere:
  - `nix run github:Sleeping-Donut/readingroom`
  - `nix build github:Sleeping-Donut/readingroom#server`
  - `docker build -t readingroom https://github.com/Sleeping-Donut/readingroom` (Docker clones the repo itself)
  - NixOS: `readingroom.url = "github:Sleeping-Donut/readingroom"`

If an install example *must* start from a clone (e.g. a manual build), say so explicitly first ("clone, then…") — don't leave it implied.

## Development is the opposite

The Development section is for people who have a checkout, so local refs are correct here:

- `nix develop` (local flake)
- `just release` (local build via the justfile)
- `cargo run` / `vp dev`

Never mix the two audiences in one command block.

## Keep the top-level README user-facing

The root README answers "what is this, how do I install/use it". Keep dev-internal content out:

- ❌ Project structure trees, key-command lists, tech-stack tables — these belong in per-component readmes (e.g. `frontend/`, `crates/server/`) if anywhere.
- ✅ Usage, configuration, features, install, and a deployment-agnostic architecture overview.

## GitHub rendering specifics

- **Alerts**: `> [!NOTE]`, `> [!WARNING]`, etc. Consecutive `>` lines merge into one paragraph — separate them with a blank `>` line to keep line breaks.
- **Mermaid**: fenced ```mermaid blocks render natively on GitHub — use them instead of hand-drawn ASCII box diagrams (which break alignment on different font widths).
- **Collapsible methods**: `<details><summary>…</summary>` is the idiomatic way to keep multiple install methods compact.
- **`<br>`**: use only when you specifically want a hard break inside a line; prefer blank lines for spacing.

## Commit style for README changes

Follow the project's git-commit skill: why-focused, imperative subject, brief body. A README fix usually reads like `docs: …` with the *reason* (e.g. "install shouldn't assume a clone") in the body, not a listing of the lines changed.
