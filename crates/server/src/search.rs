use std::sync::Arc;

use readingroom_core::{
    error::Result,
    models::{Book, MonitoredBook},
    search::{BasicDecisionEngine, DecisionEngine, ScoredRelease},
    traits::{Indexer, SearchCriteria},
};

use crate::db;

/// Orchestrates searches across all configured indexers and scores results.
pub struct SearchEngine {
    indexers: Vec<Box<dyn Indexer>>,
    decision: Box<dyn DecisionEngine>,
    db: sqlx::SqlitePool,
}

impl SearchEngine {
    pub fn new(
        indexers: Vec<Box<dyn Indexer>>,
        db: sqlx::SqlitePool,
    ) -> Self {
        Self {
            indexers,
            decision: Box::new(BasicDecisionEngine),
            db,
        }
    }

    /// Search for a specific monitored book across all indexers.
    /// Returns scored releases sorted by score descending.
    pub async fn search_book(&self, book: &MonitoredBook) -> Result<Vec<ScoredRelease>> {
        let criteria = SearchCriteria {
            query: Some(book.title.clone()),
            author: None,
            title: Some(book.title.clone()),
            isbn: None,
            limit: Some(50),
        };

        let mut all_scored = Vec::new();

        for indexer in &self.indexers {
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
