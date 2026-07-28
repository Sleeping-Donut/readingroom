use async_trait::async_trait;
use readingroom_core::{
    error::Result,
    models::*,
    traits::MetadataSource,
};

pub struct OpenLibrarySource {
    client: reqwest::Client,
}

impl OpenLibrarySource {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl MetadataSource for OpenLibrarySource {
    fn name(&self) -> &'static str {
        "openlibrary"
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        // GET https://openlibrary.org/search/authors.json?q={query}
        Ok(vec![])
    }

    async fn get_author(&self, _foreign_id: &str) -> Result<Author> {
        Err(readingroom_core::error::AppError::Other("not implemented".into()))
    }

    async fn get_author_books(&self, _foreign_id: &str) -> Result<Vec<Book>> {
        Ok(vec![])
    }

    async fn search_book(&self, _query: &str) -> Result<Vec<Book>> {
        Ok(vec![])
    }

    async fn get_book(&self, _foreign_id: &str) -> Result<Book> {
        Err(readingroom_core::error::AppError::Other("not implemented".into()))
    }

    async fn get_book_editions(&self, _foreign_id: &str) -> Result<Vec<Edition>> {
        Ok(vec![])
    }

    async fn get_series(&self, _foreign_id: &str) -> Result<Series> {
        Err(readingroom_core::error::AppError::Other("not implemented".into()))
    }
}
