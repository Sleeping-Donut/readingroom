use crate::error::Result;
use crate::search::ScoredRelease;

/// Result from a search across indexers, scored by the decision engine
#[derive(Debug, Clone)]
pub struct ScoredRelease {
    pub release: crate::models::Release,
    pub score: f64,
    pub matched_book_id: Option<i64>,
    pub matched_quality: Option<crate::models::Quality>,
    pub reasons: Vec<String>,
}

/// Decision engine evaluates releases from indexers against what we need
pub trait DecisionEngine: Send + Sync {
    /// Score a release against a specific book
    fn score_release(
        &self,
        release: &crate::models::Release,
        book: &crate::models::Book,
    ) -> Result<ScoredRelease>;

    /// Check if we should upgrade an existing file with this release
    fn is_upgrade(
        &self,
        existing: &crate::models::BookFile,
        candidate: &crate::models::Release,
    ) -> bool;
}
