# ReadingRoom dev commands

# Build the backend
build:
    cargo build

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
