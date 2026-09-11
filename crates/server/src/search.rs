use std::sync::{Arc, RwLock};

use readingroom_core::{
    config::IndexerConfig,
    error::Result,
    models::{Book, MonitoredBook},
    search::{BasicDecisionEngine, DecisionEngine, ScoredRelease},
    traits::{Indexer, SearchCriteria},
};
use readingroom_providers::PluginManager;

use crate::db;

/// Orchestrates searches across all configured indexers and scores results.
pub struct SearchEngine {
    /// Reloadable so settings-API / Prowlarr changes take effect without a
    /// restart.
    indexers: RwLock<Vec<Arc<dyn Indexer>>>,
    decision: Box<dyn DecisionEngine>,
    db: sqlx::SqlitePool,
}

impl SearchEngine {
    pub fn new(indexers: Vec<Arc<dyn Indexer>>, db: sqlx::SqlitePool) -> Self {
        Self {
            indexers: RwLock::new(indexers),
            decision: Box::new(BasicDecisionEngine),
            db,
        }
    }

    /// Swap in a freshly built indexer set (call after any settings change).
    pub fn set_indexers(&self, indexers: Vec<Arc<dyn Indexer>>) {
        *self.indexers.write().unwrap() = indexers;
    }

    fn indexers_snapshot(&self) -> Vec<Arc<dyn Indexer>> {
        self.indexers.read().unwrap().clone()
    }

    /// Search for a specific monitored book across all indexers.
    /// Returns scored releases sorted by score descending.
    pub async fn search_book(&self, book: &MonitoredBook) -> Result<Vec<ScoredRelease>> {
        // Include the author in the free-text query: indexers match on title and
        // author, so a title-only query returns same-titled books by other
        // authors.
        let author = book.author_name.clone().filter(|a| !a.is_empty());
        let query = match &author {
            Some(a) => format!("{} {}", book.title, a),
            None => book.title.clone(),
        };
        let criteria = SearchCriteria {
            query: Some(query),
            author,
            title: Some(book.title.clone()),
            isbn: None,
            limit: Some(50),
        };

        let mut all_scored = Vec::new();

        for indexer in self.indexers_snapshot() {
            if !indexer.supports_search() {
                continue;
            }

            let releases = match indexer.search(&criteria).await {
                Ok(r) => r,
                Err(e) => {
                    tracing::warn!(indexer = %indexer.name(), error = %e, "Indexer search failed");
                    continue;
                }
            };

            for release in releases {
                match self.decision.score_release(&release, book) {
                    Ok(scored) => {
                        if scored.score > 0.0 {
                            all_scored.push(scored);
                        }
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to score release");
                    }
                }
            }
        }

        // Sort by score descending, then deduplicate by download_url
        all_scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        all_scored.dedup_by(|a, b| a.release.download_url == b.release.download_url);

        Ok(all_scored)
    }

    /// Search for all monitored books by an author.
    pub async fn search_author(&self, author_id: i64) -> Result<Vec<ScoredRelease>> {
        let books = db::get_books_by_author(&self.db, author_id).await?;
        let mut all_results = Vec::new();

        for book in books {
            let Some(monitored) = book.into_monitored() else { continue; };
            let results = self.search_book(&monitored).await.unwrap_or_default();
            all_results.extend(results);
        }

        all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        Ok(all_results)
    }
}

/// Build the active indexer set: DB-managed configs (settings API / Prowlarr)
/// first, then config.toml, de-duplicated by name. Used at startup and on every
/// indexer settings change.
pub async fn build_indexers(
    db: &sqlx::SqlitePool,
    config_indexers: &[IndexerConfig],
    plugins: &PluginManager,
) -> Vec<Arc<dyn Indexer>> {
    let mut configs = db::list_indexer_configs(db).await.unwrap_or_default();
    for c in config_indexers {
        if !configs.iter().any(|existing| existing.name == c.name) {
            configs.push(c.clone());
        }
    }
    configs
        .iter()
        .filter(|c| c.enabled)
        .filter_map(|c| {
            readingroom_providers::from_config(c, plugins)
                .map(Arc::<dyn Indexer>::from)
                .map_err(|e| {
                    tracing::warn!(name = %c.name, error = %e, "Failed to initialize indexer");
                    e
                })
                .ok()
        })
        .collect()
}
