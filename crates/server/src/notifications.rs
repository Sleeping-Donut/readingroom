use std::collections::HashMap;

use readingroom_core::{
    error::{AppError, Result},
    traits::{NotificationEvent, NotificationService},
};

struct ServiceEntry {
    id: i64,
    name: String,
    service: Box<dyn NotificationService>,
    on_grab: bool,
    on_import: bool,
    on_upgrade: bool,
    on_health_issue: bool,
}

impl ServiceEntry {
    fn should_send(&self, event: &NotificationEvent) -> bool {
        match event {
            NotificationEvent::Grab { .. } => self.on_grab,
            NotificationEvent::Import { .. } => self.on_import,
            NotificationEvent::Upgrade { .. } => self.on_upgrade,
            NotificationEvent::HealthIssue { .. } => self.on_health_issue,
            NotificationEvent::Test => true,
            _ => false,
        }
    }
}

pub struct NotificationManager {
    db: sqlx::SqlitePool,
    services: Vec<ServiceEntry>,
}

#[derive(Debug, sqlx::FromRow)]
struct NotificationRow {
    id: i64,
    name: String,
    implementation: String,
    settings: String,
    on_grab: bool,
    on_import: bool,
    on_upgrade: bool,
    on_health_issue: bool,
}

impl NotificationManager {
    pub fn new(db: sqlx::SqlitePool) -> Self {
        Self {
            db,
            services: Vec::new(),
        }
    }

    pub async fn load_from_db(&mut self) {
        let rows = sqlx::query_as::<_, NotificationRow>(
            "SELECT id, name, implementation, settings, on_grab, on_import, on_upgrade, on_health_issue
             FROM notifications ORDER BY name",
        )
        .fetch_all(&self.db)
        .await
        .unwrap_or_default();

        self.services = rows.into_iter().filter_map(|r| {
            let settings: HashMap<String, String> =
                serde_json::from_str(&r.settings).unwrap_or_default();
            let service: Box<dyn NotificationService> = match r.implementation.as_str() {
                "apprise" => Box::new(AppriseNotificationService {
                    name: r.name.clone(),
                    config: settings,
                }),
                _ => {
                    tracing::warn!(impl_type = %r.implementation, "Unknown notification implementation");
                    return None;
                }
            };
            Some(ServiceEntry {
                id: r.id,
                name: r.name,
                service,
                on_grab: r.on_grab,
                on_import: r.on_import,
                on_upgrade: r.on_upgrade,
                on_health_issue: r.on_health_issue,
            })
        }).collect();

        tracing::info!(count = %self.services.len(), "Notification services loaded");
    }

    pub async fn send_to_all(&self, event: &NotificationEvent) {
        for entry in &self.services {
            if !entry.should_send(event) {
                continue;
            }
            if let Err(e) = entry.service.send(event).await {
                tracing::warn!(
                    name = %entry.name,
                    error = %e,
                    "Failed to send notification"
                );
            }
        }
    }

    pub async fn send_to(&self, id: i64, event: &NotificationEvent) -> Result<()> {
        let entry = self.services.iter().find(|e| e.id == id);
        match entry {
            Some(e) => e.service.send(event).await,
            None => Err(AppError::NotFound(format!("Notification {id} not found"))),
        }
    }
}

struct AppriseNotificationService {
    name: String,
    config: HashMap<String, String>,
}

#[async_trait::async_trait]
impl NotificationService for AppriseNotificationService {
    fn name(&self) -> &str {
        &self.name
    }

    async fn send(&self, event: &NotificationEvent) -> Result<()> {
        let webhook_url = match self.config.get("webhook_url") {
            Some(u) => u,
            None => return Err(AppError::Notification("No webhook_url configured".into())),
        };

        let (event_type, message) = match event {
            NotificationEvent::Grab { release } => {
                ("grab", format!("Grabbed {} from {}", release.title, release.indexer))
            }
            NotificationEvent::Import { book, .. } => {
                ("import", format!("Imported {}", book.title))
            }
            NotificationEvent::Upgrade { book, .. } => {
                ("upgrade", format!("Upgraded {}", book.title))
            }
            NotificationEvent::HealthIssue { message, severity } => {
                ("health", format!("[{}] {}", severity, message))
            }
            NotificationEvent::Test => {
                ("test", "Test notification from ReadingRoom".into())
            }
            _ => ("unknown", "Unknown notification event".into()),
        };

        let body = serde_json::json!({
            "event": event_type,
            "message": message,
        });

        let client = reqwest::Client::new();
        client
            .post(webhook_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Notification(format!("Apprise request failed: {e}")))?;

        Ok(())
    }
}
