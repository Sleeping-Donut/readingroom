# ── Stage 1: build with Nix ──────────────────────────────────────────────────
# A NixOS base builds the combined backend + frontend from the local checkout.
# filter-syscalls false is required because Docker's seccomp profile blocks
# syscalls Nix's build sandbox relies on.
FROM nixos/nix:2.24.15 AS builder

COPY . /tmp/build
WORKDIR /tmp/build

RUN nix \
    --extra-experimental-features "nix-command flakes" \
    --option filter-syscalls false \
    build

# Assemble just the runtime closure (the store paths the build output needs),
# not the whole Nix store.
RUN mkdir /tmp/nix-store-closure
RUN cp -R $(nix-store -qR result/) /tmp/nix-store-closure

# ── Stage 2: scratch runtime ─────────────────────────────────────────────────
# The closure is self-contained, so Nix isn't needed at runtime.
FROM scratch

WORKDIR /app

COPY --from=builder /tmp/nix-store-closure /nix/store
COPY --from=builder /tmp/build/result /app

ENV FRONTEND_DIST=/app/share/readingroom
EXPOSE 5299
VOLUME ["/data"]

ENTRYPOINT ["/app/bin/readingroom-server"]
CMD ["--data-dir", "/data", "--host", "0.0.0.0"]
