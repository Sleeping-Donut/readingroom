{
  description = "ReadingRoom - self-hosted ebook & audiobook manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Rust toolchain: stable + extra components
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [
            "rust-src"
            "rust-analyzer"
          ];
          targets = [ "x86_64-unknown-linux-gnu" ];
        };

        devTools = with pkgs; [
          # Rust toolchain & helpers
          rustToolchain
          cargo-watch
          cargo-audit
          cargo-edit
          cargo-nextest
          cargo-expand
          cargo-insta
          # Database
          sqlx-cli
          # Frontend
          nodejs_22
          pnpm
          # General
          just
          typos
          # For testing download clients
          docker-client
        ];
      in
      {
        # Packages (add these once Cargo.lock is generated):
        #   packages.default = pkgs.callPackage ./nix/package.nix { };
        #   packages.frontend = ...;
        packages = { };

        devShells.default = pkgs.mkShell {
          buildInputs = devTools;

          shellHook = ''
            echo "ReadingRoom devShell"
            echo ""
            echo "Tools:"
            echo "  Rust    $(rustc --version)"
            echo "  Node    $(node --version)"
            echo "  pnpm    $(pnpm --version)"
            echo "  SQLite  $(sqlite3 --version)"
            echo ""
            echo "Quick start:"
            echo "  cargo generate-lockfile         # generate Cargo.lock"
            echo "  cargo build                     # build backend"
            echo "  cargo nextest run               # run tests"
            echo "  cd frontend && pnpm install     # install JS deps"
            echo "  cd frontend && pnpm dev         # start frontend dev server"
            echo ""

            export SQLX_OFFLINE=true
          '';
        };
      }
    );
}
