use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::get};
use chrono::Datelike;
use serde::Serialize;
use serde_json::{Value, json};

use crate::AppState;

#[derive(Serialize)]
struct MonthGroup {
    year: i32,
    month: u32,
    books: Vec<readingroom_core::models::Book>,
}

async fn list(State(state): State<Arc<AppState>>) -> Json<Value> {
    match crate::db::list_calendar_books(&state.db).await {
        Ok(books) => {
            let mut months: Vec<MonthGroup> = Vec::new();

            for book in books {
                if let Some(pd) = &book.publish_date {
                    let year = pd.year();
                    let month = pd.month();

                    let last = months.last_mut();
                    if let Some(last) = last {
                        if last.year == year && last.month == month {
                            last.books.push(book);
                            continue;
                        }
                    }

                    months.push(MonthGroup {
                        year,
                        month,
                        books: vec![book],
                    });
                }
            }

            Json(json!({ "months": months }))
        }
        Err(e) => Json(json!({ "error": e.to_string(), "months": [] })),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list))
}
