pub mod openlibrary;
pub mod google_books;
pub mod goodreads;
pub mod audible;
pub mod ol_dump;

pub use ol_dump::{
    DEFAULT_DUMP_URL, OlCacheSource, ImportHandle, ImportProgress, ImportState, ImportCounts,
    download_and_import,
};

use readingroom_core::traits::MetadataSource;
use readingroom_core::config::MetadataConfig;

/// Build the primary metadata source from config.
/// Returns OpenLibrary by default since it requires no API key.
pub fn primary_source(config: &MetadataConfig) -> Box<dyn MetadataSource> {
    // Prefer HardCover if configured, otherwise OpenLibrary
    if config.hardcover.enabled {
        // TODO: return HardcoverSource::new(&config.hardcover)
    }
    if config.google_books.enabled && config.google_books.api_key.is_some() {
        return Box::new(google_books::GoogleBooksSource::new(config));
    }
    Box::new(openlibrary::OpenLibrarySource::new())
}

/// Create a supplementary Audible source for ASIN-based lookups.
pub fn audible_source() -> Box<dyn MetadataSource> {
    Box::new(audible::AudibleSource::new())
}
