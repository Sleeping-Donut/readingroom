use async_trait::async_trait;
use moka::future::Cache;
use readingroom_core::{
    error::Result,
    models::*,
    traits::MetadataSource,
};

pub struct CachedMetadataSource {
    inner: Box<dyn MetadataSource>,
    author_cache: Cache<String, Vec<Author>>,
    author_detail_cache: Cache<String, Author>,
    author_books_cache: Cache<String, Vec<Book>>,
    book_search_cache: Cache<String, Vec<Book>>,
    book_detail_cache: Cache<String, Book>,
    book_editions_cache: Cache<String, Vec<Edition>>,
}

impl CachedMetadataSource {
    pub fn new(inner: Box<dyn MetadataSource>) -> Self {
        Self {
            inner,
            author_cache: Cache::new(100),
            author_detail_cache: Cache::new(100),
            author_books_cache: Cache::new(100),
            book_search_cache: Cache::new(100),
            book_detail_cache: Cache::new(100),
            book_editions_cache: Cache::new(100),
        }
    }
}

#[async_trait]
impl MetadataSource for CachedMetadataSource {
    fn name(&self) -> &'static str {
        self.inner.name()
    }

    async fn search_author(&self, query: &str) -> Result<Vec<Author>> {
        let key = query.to_string();
        if let Some(cached) = self.author_cache.get(&key).await {
            return Ok(cached);
        }
        let result = self.inner.search_author(&key).await?;
        self.author_cache.insert(key, result.clone()).await;
        Ok(result)
    }

    async fn get_author(&self, foreign_id: &str) -> Result<Author> {
        let key = foreign_id.to_string();
        if let Some(cached) = self.author_detail_cache.get(&key).await {
            return Ok(cached);
        }
        let result = self.inner.get_author(&key).await?;
        self.author_detail_cache.insert(key, result.clone()).await;
        Ok(result)
    }

    async fn get_author_books(&self, foreign_id: &str) -> Result<Vec<Book>> {
        let key = foreign_id.to_string();
        if let Some(cached) = self.author_books_cache.get(&key).await {
            return Ok(cached);
        }
        let result = self.inner.get_author_books(&key).await?;
        self.author_books_cache.insert(key, result.clone()).await;
        Ok(result)
    }

    async fn search_book(&self, query: &str) -> Result<Vec<Book>> {
        let key = query.to_string();
        if let Some(cached) = self.book_search_cache.get(&key).await {
            return Ok(cached);
        }
        let result = self.inner.search_book(&key).await?;
        self.book_search_cache.insert(key, result.clone()).await;
        Ok(result)
    }

    async fn get_book(&self, foreign_id: &str) -> Result<Book> {
        let key = foreign_id.to_string();
        if let Some(cached) = self.book_detail_cache.get(&key).await {
            return Ok(cached);
        }
        let result = self.inner.get_book(&key).await?;
        self.book_detail_cache.insert(key, result.clone()).await;
        Ok(result)
    }

    async fn get_book_editions(&self, foreign_id: &str) -> Result<Vec<Edition>> {
        let key = foreign_id.to_string();
        if let Some(cached) = self.book_editions_cache.get(&key).await {
            return Ok(cached);
        }
        let result = self.inner.get_book_editions(&key).await?;
        self.book_editions_cache.insert(key, result.clone()).await;
        Ok(result)
    }

    async fn get_series(&self, foreign_id: &str) -> Result<Series> {
        self.inner.get_series(foreign_id).await
    }
}
