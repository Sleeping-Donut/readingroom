use crate::error::Result;
use crate::models::{Book, BookFile, Quality, Release};
use strsim::jaro_winkler;

/// Result from a search across indexers, scored by the decision engine
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScoredRelease {
    pub release: Release,
    pub score: f64,
    pub matched_book_id: Option<i64>,
    pub matched_quality: Option<Quality>,
    pub reasons: Vec<String>,
}

/// Decision engine evaluates releases from indexers against what we need
pub trait DecisionEngine: Send + Sync {
    /// Score a release against a specific book
    fn score_release(&self, release: &Release, book: &Book) -> Result<ScoredRelease>;
    /// Check if we should upgrade an existing file with this release
    fn is_upgrade(&self, existing: &BookFile, _candidate: &Release) -> bool;
}

/// Default implementation with basic heuristics
pub struct BasicDecisionEngine;

impl BasicDecisionEngine {
    fn guess_quality(title: &str) -> Quality {
        let lower = title.to_lowercase();
        if lower.contains("epub") {
            Quality::EPUB
        } else if lower.contains("mobi") {
            Quality::MOBI
        } else if lower.contains("azw3") {
            Quality::AZW3
        } else if lower.contains("pdf") {
            Quality::PDF
        } else if lower.contains("flac") {
            Quality::FLAC
        } else if lower.contains("m4b") || lower.contains("m4a") {
            Quality::M4B
        } else if lower.contains("mp3") {
            Quality::MP3
        } else {
            Quality::Unknown
        }
    }

    fn quality_score(q: &Quality) -> f64 {
        match q {
            Quality::EPUB => 1.0,
            Quality::MOBI => 0.8,
            Quality::AZW3 => 0.9,
            Quality::PDF => 0.5,
            Quality::M4B => 0.9,
            Quality::MP3 => 0.7,
            Quality::FLAC => 1.0,
            Quality::Unknown => 0.3,
        }
    }
}

impl DecisionEngine for BasicDecisionEngine {
    fn score_release(&self, release: &Release, book: &Book) -> Result<ScoredRelease> {
        let mut score = 0.0;
        let mut reasons = Vec::new();

        // Title similarity (core signal)
        let clean_release_str = release.title.to_lowercase();
        let clean_release = clean_release_str
            .trim()
            .trim_start_matches(|c: char| c.is_ascii_punctuation())
            .trim_end_matches(|c: char| c.is_ascii_punctuation());
        let clean_book_str = book.title.to_lowercase();
        let clean_book = clean_book_str.trim();
        let similarity = jaro_winkler(clean_release, clean_book);
        score += similarity * 50.0;
        if similarity > 0.85 {
            reasons.push("High title match".into());
        } else if similarity > 0.7 {
            reasons.push("Partial title match".into());
        }

        // Author match if present in title
        if !book.clean_title.is_empty()
            && release
                .title
                .to_lowercase()
                .contains(&book.clean_title)
        {
            score += 10.0;
            reasons.push("Title match in release name".into());
        }

        // Seeder bonus
        if let Some(seeders) = release.seeders {
            let seeder_score = (seeders as f64).ln_1p() * 5.0;
            score += seeder_score.clamp(0.0, 25.0);
            reasons.push(format!("{} seeders", seeders));
        }

        // Quality bonus
        let quality = Self::guess_quality(&release.title);
        let q_score = Self::quality_score(&quality);
        score += q_score * 10.0;
        if q_score > 0.5 {
            reasons.push(format!("Quality: {:?}", quality));
        }

        // Size sanity (reject unreasonably small or large)
        if release.size > 0 {
            if release.size < 1_000_000 {
                score -= 20.0;
                reasons.push("Very small file".into());
            } else if release.size > 10_000_000_000 {
                score -= 10.0;
                reasons.push("Very large file".into());
            }
        }

        Ok(ScoredRelease {
            release: release.clone(),
            score: score.max(0.0),
            matched_book_id: Some(book.id),
            matched_quality: Some(quality),
            reasons,
        })
    }

    fn is_upgrade(&self, existing: &BookFile, candidate: &Release) -> bool {
        let existing_score = Self::quality_score(&existing.quality);
        let candidate_quality = Self::guess_quality(&candidate.title);
        let candidate_score = Self::quality_score(&candidate_quality);
        candidate_score > existing_score
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Book, BookFile, Quality, Release};
    use chrono::Utc;

    fn make_release(title: &str, seeders: Option<i32>, size: i64) -> Release {
        Release {
            title: title.to_string(),
            info_url: String::new(),
            download_url: String::new(),
            size,
            pub_date: Utc::now(),
            indexer: "test".into(),
            download_type: crate::models::DownloadType::Torrent,
            seeders,
            peers: None,
            grabs: None,
            categories: vec![],
        }
    }

    fn make_book(title: &str, clean_title: &str) -> Book {
        Book {
            id: 1,
            foreign_id: "test".into(),
            author_id: 1,
            author_name: None,
            title: title.to_string(),
            clean_title: clean_title.to_string(),
            description: None,
            isbn: None,
            isbn13: None,
            asin: None,
            pages: None,
            publisher: None,
            publish_date: None,
            image_url: None,
            genres: vec![],
            ratings: None,
            language: "en".into(),
            monitored: true,
            added_at: Utc::now(),
            last_search_at: None,
        }
    }

    #[test]
    fn test_guess_quality_epub() {
        assert_eq!(BasicDecisionEngine::guess_quality("Book Title EPUB"), Quality::EPUB);
    }

    #[test]
    fn test_guess_quality_mobi() {
        assert_eq!(BasicDecisionEngine::guess_quality("Book Title MOBI"), Quality::MOBI);
    }

    #[test]
    fn test_guess_quality_m4b() {
        assert_eq!(BasicDecisionEngine::guess_quality("Book Title M4B"), Quality::M4B);
    }

    #[test]
    fn test_guess_quality_mp3() {
        assert_eq!(BasicDecisionEngine::guess_quality("Book Title MP3 64kb"), Quality::MP3);
    }

    #[test]
    fn test_guess_quality_unknown() {
        assert_eq!(BasicDecisionEngine::guess_quality("Some Random File.txt"), Quality::Unknown);
    }

    #[test]
    fn test_quality_score_ordering() {
        assert!(BasicDecisionEngine::quality_score(&Quality::EPUB) > BasicDecisionEngine::quality_score(&Quality::MOBI));
        assert!(BasicDecisionEngine::quality_score(&Quality::M4B) > BasicDecisionEngine::quality_score(&Quality::MP3));
        assert!(BasicDecisionEngine::quality_score(&Quality::Unknown) < BasicDecisionEngine::quality_score(&Quality::PDF));
    }

    #[test]
    fn test_score_release_high_similarity() {
        let engine = BasicDecisionEngine;
        let release = make_release("The Hitchhiker's Guide to the Galaxy EPUB", Some(50), 5_000_000);
        let book = make_book("The Hitchhiker's Guide to the Galaxy", "hitchhikers guide galaxy");

        let result = engine.score_release(&release, &book).unwrap();
        assert!(result.score > 40.0, "Expected high score for similar title, got {}", result.score);
        assert!(result.reasons.iter().any(|r| r.contains("High title match")));
    }

    #[test]
    fn test_score_release_low_similarity() {
        let engine = BasicDecisionEngine;
        let release = make_release("Completely Unrelated Book Title Here", None, 5_000_000);
        let book = make_book("Something Else Entirely Different", "something else");

        let result = engine.score_release(&release, &book).unwrap();
        assert!(result.score < 40.0, "Expected low score for unrelated title, got {}", result.score);
    }

    #[test]
    fn test_score_release_seeder_bonus() {
        let engine = BasicDecisionEngine;
        let release = make_release("Test Book", Some(500), 5_000_000);
        let book = make_book("Test Book", "test book");

        // Without seeders
        let release_no_seeders = make_release("Test Book", None, 5_000_000);
        let result_no = engine.score_release(&release_no_seeders, &book).unwrap();
        let result_yes = engine.score_release(&release, &book).unwrap();

        assert!(result_yes.score > result_no.score, "Score should be higher with seeders");
    }

    #[test]
    fn test_score_release_small_file_penalty() {
        let engine = BasicDecisionEngine;
        let release = make_release("Test Book", Some(10), 500); // 500 bytes
        let book = make_book("Test Book", "test book");

        let result = engine.score_release(&release, &book).unwrap();
        assert!(result.reasons.iter().any(|r| r.contains("Very small")),
            "Should flag very small files");
    }

    #[test]
    fn test_score_release_large_file_penalty() {
        let engine = BasicDecisionEngine;
        let release = make_release("Test Book", Some(10), 20_000_000_000); // 20GB
        let book = make_book("Test Book", "test book");

        let result = engine.score_release(&release, &book).unwrap();
        assert!(result.reasons.iter().any(|r| r.contains("Very large")),
            "Should flag very large files");
    }

    #[test]
    fn test_is_upgrade_prefers_epub_over_mobi() {
        let engine = BasicDecisionEngine;
        let existing = BookFile {
            id: 1,
            edition_id: 1,
            path: "/dev/null".into(),
            size: 1_000_000,
            quality: Quality::MOBI,
            format: "mobi".into(),
            media_info: None,
            date_added: Utc::now(),
            calibre_id: None,
            part: None,
        };
        let candidate = make_release("Better Book EPUB", None, 2_000_000);

        assert!(engine.is_upgrade(&existing, &candidate),
            "EPUB should be upgrade over MOBI");
    }

    #[test]
    fn test_is_upgrade_rejects_downgrade() {
        let engine = BasicDecisionEngine;
        let existing = BookFile {
            id: 1,
            edition_id: 1,
            path: "/dev/null".into(),
            size: 1_000_000,
            quality: Quality::EPUB,
            format: "epub".into(),
            media_info: None,
            date_added: Utc::now(),
            calibre_id: None,
            part: None,
        };
        let candidate = make_release("Worse Book MOBI", None, 500_000);

        assert!(!engine.is_upgrade(&existing, &candidate),
            "MOBI should not be upgrade over EPUB");
    }
}
