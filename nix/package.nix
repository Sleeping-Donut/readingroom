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
      hash = "sha256-9OSgunObTKRxhjU0vRLYHx5RrE1aYWbSA4iMnrSP+Sk=";
    };

    buildPhase = ''
      runHook preBuild
      vp build 2>&1
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      # Start mode (client-only) emits the static SPA under dist/client.
      # Copy its contents to $out so FRONTEND_DIST=$out serves index.html directly.
      cp -r dist/client/* $out/
      runHook postInstall
    '';

    meta = with lib; {
      description = "ReadingRoom web UI (static files)";
      license = licenses.mit;
    };
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

  # Build the final Rust binary, with the frontend dist path made available.
  server = craneLib.buildPackage (commonArgs // {
    inherit cargoArtifacts;

    # Make the built frontend assets discoverable by the binary at runtime.
    FRONTEND_DIST = "${frontend}";

    meta = with lib; {
      description = "ReadingRoom backend server";
      license = licenses.mit;
      mainProgram = "readingroom-server";
    };
  });

  # ── Combined: backend + frontend ───────────────────────────────────────────
  combined = symlinkJoin {
    name = "readingroom";
    paths = [ server frontend ];

    postBuild = ''
      mkdir -p $out/bin
      ln -sf ${server}/bin/readingroom-server $out/bin/readingroom-server
      ln -sf ${server}/bin/readingroom-server $out/bin/readingroom

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
{
  inherit frontend server combined;
  default = combined;
}
