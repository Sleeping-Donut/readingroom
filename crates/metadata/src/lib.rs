pub mod openlibrary;
pub mod google_books;
pub mod goodreads;

use readingroom_core::error::Result;
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
        // TODO: return GoogleBooksSource::new(&config.google_books)
    }
    Box::new(openlibrary::OpenLibrarySource::new())
}
