# ReadingRoom dev commands

# Build the backend (debug)
build:
    cargo build

# Build the backend release binary
release-server:
    cargo build --release

# Build the frontend for production (emits frontend/dist/client)
release-web:
    cd frontend && vp build

# Build both and assemble the final result into dist/
release: release-server release-web
    mkdir -p dist
    cp target/release/readingroom-server dist/
    cp -r frontend/dist/client dist/web

# Run the assembled release (expects `just release` to have been run)
run-release:
    FRONTEND_DIST=dist/web dist/readingroom-server --data-dir ./localdump/release-data

# Run the backend in dev mode
dev-server:
    cargo watch -x run

# Run tests
test:
    cargo nextest run

# Run lints
lint:
    cargo clippy -- -D warnings

# Format code
fmt:
    cargo fmt

# Start frontend dev server
dev-frontend:
    cd frontend && pnpm dev

# Run all checks
check: lint fmt test

# Generate Cargo.lock
lock:
    cargo generate-lockfile

# Run database migrations (requires running server or SQLite)
migrate:
    sqlx migrate run

# Add a new migration
add-migration name:
    sqlx migrate add -r {{name}}
