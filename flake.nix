{
  description = "ReadingRoom - self-hosted ebook & audiobook manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    nix-vite-plus = {
      url = "github:ryoppippi/nix-vite-plus";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    crane.url = "github:ipetkov/crane";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
      nix-vite-plus,
      crane,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        craneLib = crane.mkLib pkgs;
        vp = nix-vite-plus.packages.${system}.vp;

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
          nodejs
          pnpm
		  typescript-language-server
          # General
          just
          typos
          # For testing download clients
          docker-client
        ];
      in
      {
        packages.default = pkgs.callPackage ./nix/package.nix {
          inherit vp craneLib;
          pnpm = pkgs.pnpm;
          nodejs = pkgs.nodejs;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = devTools ++ [ vp ];

          shellHook = ''
            echo "ReadingRoom devShell"
            echo ""
            echo "Tools:"
            echo "  Rust    $(rustc --version)"
            echo "  Node    $(node --version)"
            echo "  pnpm    $(pnpm --version)"
            echo "  Vite+   $(vp --version)"
            echo "  SQLite  $(sqlite3 --version)"
            echo ""
            echo "Quick start:"
            echo "  cargo generate-lockfile         # generate Cargo.lock"
            echo "  cargo build                     # build backend"
            echo "  cargo nextest run               # run tests"
            echo "  cd frontend && vp install       # install JS deps"
            echo "  cd frontend && vp dev           # start frontend dev server"
            echo "  cd frontend && vp check         # format + lint + typecheck"
            echo ""

            export SQLX_OFFLINE=true
          '';
        };
      }
    ) // {
      # Inject the flake's combined package into the module so the service
      # works out of the box (package defaults to it) instead of requiring
      # the user to supply a package that doesn't exist in nixpkgs.
      nixosModules.default =
        { pkgs, ... }@args:
        import ./nix/nixos-module.nix ({
          readingroom = self.packages.${pkgs.system}.default;
        } // args);
    };
}
