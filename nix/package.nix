{ lib, craneLib, pnpm, nodejs, vp, stdenv, symlinkJoin, cacert, pnpmConfigHook, fetchPnpmDeps }:

let
  # ── Frontend: web UI ───────────────────────────────────────────────────────
  # Uses pnpmConfigHook which sets up the offline store from pnpmDeps,
  # then runs `vp build` to produce the static assets.
  frontend = stdenv.mkDerivation (finalAttrs: {
    pname = "readingroom-web";
    version = "0.1.0";

    src = lib.cleanSource ../frontend;

    nativeBuildInputs = [ pnpm pnpmConfigHook nodejs vp cacert ];

    # CA certificates for npm registry access in Nix sandbox
    NODE_EXTRA_CA_CERTS = "${cacert}/etc/ssl/certs/ca-bundle.crt";

    # Pre-fetched pnpm dependencies
    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version src;
      fetcherVersion = 4;
      hash = "sha256-/5E/CFZJ4jr3GL7VTuL3P3VlkCeplPlvzp8UwBMOyl4=";
    };

    buildPhase = ''
      runHook preBuild
      # vp manages its own Node runtime by default and would try to download
      # one, but the build sandbox has no network. Switch to system-first so
      # it uses the nodejs provided by nativeBuildInputs.
      vp env off
      vp build 2>&1
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      # Start mode (client-only) emits the static SPA under dist/client.
      cp -r dist/client/* $out/
      runHook postInstall
    '';
  });

  # ── Backend: Rust binary (crane) ───────────────────────────────────────────
  # Filter source to Cargo-relevant files only to avoid unnecessary rebuilds.
  # Also keep .sql migrations (embedded by sqlx::migrate!).
  src = lib.cleanSourceWith {
    src = ../.;
    filter = path: type:
      (craneLib.filterCargoSources path type)
      || (type == "regular" && lib.hasSuffix ".sql" path);
  };

  commonArgs = {
    inherit src;
    strictDeps = true;
    pname = "readingroom-server";
    version = "0.1.0";

    buildInputs = lib.optionals stdenv.isDarwin [
      # macOS frameworks for reqwest/TLS
    ];
  };

  # Build Cargo dependencies separately for fast caching.
  cargoArtifacts = craneLib.buildDepsOnly commonArgs;

  server = craneLib.buildPackage (commonArgs // {
    inherit cargoArtifacts;
    meta.mainProgram = "readingroom-server";
  });

  # ── Combined: backend + frontend ───────────────────────────────────────────
  # The single deliverable: the server binary plus the built web assets, with
  # a wrapper that points the server at its own frontend.
  combined = symlinkJoin {
    name = "readingroom";
    paths = [ server frontend ];

    postBuild = ''
      mkdir -p $out/bin
      ln -sf ${server}/bin/readingroom-server $out/bin/readingroom-server

      cat > $out/bin/readingroom << EOF
      #!${stdenv.shell}
      export FRONTEND_DIST="$out/share/readingroom"
      exec "$out/bin/readingroom-server" "\$@"
      EOF
      chmod +x $out/bin/readingroom

      mkdir -p $out/share/readingroom
      cp -r ${frontend}/* $out/share/readingroom/
    '';

    meta = with lib; {
      description = "ReadingRoom - self-hosted ebook and audiobook manager";
      homepage = "https://github.com/user/readingroom";
      license = licenses.mit;
      mainProgram = "readingroom";
    };
  };
in
combined
