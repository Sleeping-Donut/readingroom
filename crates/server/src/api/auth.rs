use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{post, put},
};
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::SqlitePool;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    sub: i64,
    username: String,
    role: String,
    exp: usize,
}

#[derive(Debug, Deserialize)]
struct LoginBody {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct RegisterBody {
    username: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct ChangePasswordBody {
    current_password: String,
    new_password: String,
}

#[derive(Debug, sqlx::FromRow)]
struct UserRow {
    id: i64,
    username: String,
    password: String,
    role: String,
}

/// Get JWT secret from env (READINGROOM_JWT_SECRET), or a dev default
fn get_jwt_secret(state: &AppState) -> String {
    state.jwt_secret.clone()
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginBody>,
) -> impl IntoResponse {
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, username, password, role FROM users WHERE username = ?1",
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await;

    let user = match user {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Invalid username or password" })),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    };

    // Verify password
    let parsed_hash = match PasswordHash::new(&user.password) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Invalid password hash" })),
            )
                .into_response()
        }
    };

    if Argon2::default()
        .verify_password(body.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid username or password" })),
        )
            .into_response();
    }

    // Generate JWT
    let secret = get_jwt_secret(&state);
    let now = chrono::Utc::now();
    let exp = (now + chrono::TimeDelta::days(7)).timestamp() as usize;

    let username = user.username.clone();
    let role = user.role.clone();
    let claims = Claims {
        sub: user.id,
        username: user.username,
        role: user.role,
        exp,
    };

    match encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    ) {
        Ok(token) => Json(json!({
            "token": token,
            "user": {
                "id": user.id,
                "username": username,
                "role": role,
            }
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("JWT error: {e}") })),
        )
            .into_response(),
    }
}

async fn register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterBody>,
) -> impl IntoResponse {
    // Validate
    if body.username.len() < 3 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Username must be at least 3 characters" })),
        )
            .into_response();
    }
    if body.password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Password must be at least 8 characters" })),
        )
            .into_response();
    }

    // Hash password
    let salt = SaltString::generate(&mut OsRng);
    let hash = match Argon2::default()
        .hash_password(body.password.as_bytes(), &salt)
    {
        Ok(h) => h.to_string(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Hash error: {e}" )})),
            )
                .into_response()
        }
    };

    // Insert user
    match sqlx::query("INSERT INTO users (username, password, role) VALUES (?1, ?2, 'user')")
        .bind(&body.username)
        .bind(&hash)
        .execute(&state.db)
        .await
    {
        Ok(r) => Json(json!({
            "id": r.last_insert_rowid(),
            "username": body.username,
            "success": true,
        }))
        .into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("UNIQUE") {
                return (
                    StatusCode::CONFLICT,
                    Json(json!({ "error": "Username already taken" })),
                )
                    .into_response();
            }
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": msg })),
            )
                .into_response()
        }
    }
}

/// Change the authenticated user's password.
async fn change_password(
    headers: HeaderMap,
    State(state): State<Arc<AppState>>,
    Json(body): Json<ChangePasswordBody>,
) -> impl IntoResponse {
    if !state.auth_enabled {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Authentication is disabled" })),
        )
            .into_response();
    }

    let claims = match current_user(&headers, &state).await {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Authentication required" })),
            )
                .into_response()
        }
    };

    if body.new_password.len() < 8 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Password must be at least 8 characters" })),
        )
            .into_response();
    }

    let row = sqlx::query_as::<_, UserRow>(
        "SELECT id, username, password, role FROM users WHERE id = ?1",
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "User not found" })),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    };

    let parsed_hash = match PasswordHash::new(&row.password) {
        Ok(h) => h,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Stored hash error: {e}") })),
            )
                .into_response()
        }
    };

    if Argon2::default()
        .verify_password(body.current_password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Current password is incorrect" })),
        )
            .into_response();
    }

    let salt = SaltString::generate(&mut OsRng);
    let hash = match Argon2::default().hash_password(body.new_password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Hash error: {e}") })),
            )
                .into_response()
        }
    };

    match sqlx::query("UPDATE users SET password = ?1 WHERE id = ?2")
        .bind(&hash)
        .bind(row.id)
        .execute(&state.db)
        .await
    {
        Ok(_) => Json(json!({ "success": true })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

/// Extract the current user from the request headers.
/// Returns None if auth is disabled or token is missing/invalid.
pub async fn current_user(
    headers: &HeaderMap,
    state: &AppState,
) -> Option<Claims> {
    if !state.auth_enabled {
        return Some(Claims {
            sub: 0,
            username: "anonymous".into(),
            role: "admin".into(),
            exp: 0,
        });
    }

    let auth_header = headers.get("Authorization")?.to_str().ok()?;
    let token = auth_header.strip_prefix("Bearer ")?;
    let secret = get_jwt_secret(state);

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .ok()
    .map(|data| data.claims)
}

/// Check if the request is authenticated. Returns error JSON if not.
pub async fn require_auth(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<Claims, (StatusCode, Json<Value>)> {
    current_user(headers, state)
        .await
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "Authentication required" })),
            )
        })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::<Arc<AppState>>::new()
        .route("/login", post(login))
        .route("/register", post(register))
        .route("/password", put(change_password))
}
