# ── Stage 1: build with Nix ──────────────────────────────────────────────────
# A NixOS base builds the combined backend + frontend from the GitHub flake,
# so the Docker image always matches the published repo without a source copy.
FROM nixos/nix:2.24.15 AS build

RUN nix build \
      github:Sleeping-Donut/readingroom \
      --extra-experimental-features "nix-command flakes" \
      --out-link /result

# ── Stage 2: scratch runtime ─────────────────────────────────────────────────
# The Nix-built binary is dynamically linked, so copy the whole runtime closure
# from the Nix store into a scratch layer to make it executable.
FROM scratch

COPY --from=build /nix/store /nix/store
COPY --from=build /result /result

ENV FRONTEND_DIST=/result/share/readingroom
EXPOSE 5299
VOLUME ["/data"]

ENTRYPOINT ["/result/bin/readingroom-server"]
CMD ["--data-dir", "/data", "--host", "0.0.0.0"]
