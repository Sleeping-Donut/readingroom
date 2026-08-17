use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub server: ServerConfig,

    #[serde(default)]
    pub database: DatabaseConfig,

    #[serde(default)]
    pub metadata: MetadataConfig,

    #[serde(default)]
    pub indexers: Vec<IndexerConfig>,

    #[serde(default)]
    pub download_clients: Vec<DownloadClientConfig>,

    #[serde(default)]
    pub notifications: Vec<NotificationConfig>,

    #[serde(default)]
    pub quality: QualityConfig,

    #[serde(default)]
    pub library: LibraryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,
    #[serde(default = "default_log_level")]
    pub log_level: String,
    #[serde(default)]
    pub library_root: Option<PathBuf>,
    #[serde(default)]
    pub audiobook_root: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    #[serde(default = "default_db_url")]
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetadataConfig {
    #[serde(default)]
    pub openlibrary: MetadataSourceConfig,
    #[serde(default)]
    pub google_books: MetadataSourceConfig,
    #[serde(default)]
    pub goodreads: MetadataSourceConfig,
    #[serde(default)]
    pub hardcover: MetadataSourceConfig,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MetadataSourceConfig {
    #[serde(default)]
    pub enabled: bool,
    pub api_key: Option<String>,
    pub api_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexerConfig {
    pub name: String,
    pub implementation: String,
    pub url: String,
    pub api_key: Option<String>,
    /// Raw plugin/param settings JSON (DB-configured indexers only). Core
    /// indexers read the flattened `url`/`api_key`; Lua plugins read this.
    #[serde(default)]
    pub settings: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub rss_enabled: bool,
    #[serde(default = "default_true")]
    pub search_enabled: bool,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadClientConfig {
    pub name: String,
    pub implementation: String, // "transmission", "qbittorrent", "deluge", "sabnzbd"
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub url_base: Option<String>,
    pub category: Option<String>,
    #[serde(default)]
    pub download_dir: Option<PathBuf>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub rate_limit: Option<u64>,
    #[serde(default)]
    pub concurrent_downloads: Option<usize>,
    #[serde(default)]
    pub priority: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationConfig {
    pub name: String,
    pub implementation: String, // "apprise", "telegram", "email", "webhook", "discord"
    #[serde(default)]
    pub config: std::collections::HashMap<String, String>,
    #[serde(default = "default_true")]
    pub on_grab: bool,
    #[serde(default = "default_true")]
    pub on_import: bool,
    #[serde(default = "default_true")]
    pub on_upgrade: bool,
    #[serde(default = "default_true")]
    pub on_health_issue: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityConfig {
    #[serde(default = "default_profile")]
    pub profile: String,
    #[serde(default)]
    pub custom_profiles: Vec<CustomProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomProfile {
    pub name: String,
    pub qualities: Vec<String>,
    pub cutoff: Option<String>,
    pub upgrade_allowed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryConfig {
    pub root_folder: Option<PathBuf>,
    pub audiobook_folder: Option<PathBuf>,
    #[serde(default = "default_true")]
    pub rename_files: bool,
    pub author_folder_format: Option<String>,
    pub book_file_format: Option<String>,
    #[serde(default)]
    pub import_existing: bool,
}

impl LibraryConfig {
    /// Merge a runtime override on top of a base config. `overlay` wins for any
    /// field it sets; non-optional flags are always taken from `overlay`.
    pub fn merge_library(&mut self, overlay: &LibraryConfig) {
        if overlay.root_folder.is_some() {
            self.root_folder = overlay.root_folder.clone();
        }
        if overlay.audiobook_folder.is_some() {
            self.audiobook_folder = overlay.audiobook_folder.clone();
        }
        self.rename_files = overlay.rename_files;
        if overlay.author_folder_format.is_some() {
            self.author_folder_format = overlay.author_folder_format.clone();
        }
        if overlay.book_file_format.is_some() {
            self.book_file_format = overlay.book_file_format.clone();
        }
        self.import_existing = overlay.import_existing;
    }
}

// Defaults
fn default_host() -> String {
    "127.0.0.1".into()
}
fn default_port() -> u16 {
    5299
}
fn default_data_dir() -> PathBuf {
    let base = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
            PathBuf::from(home).join(".local").join("share")
        });
    base.join("readingroom")
}
fn default_log_level() -> String {
    "info".into()
}
fn default_db_url() -> String {
    "sqlite:///readingroom.db".into()
}
fn default_true() -> bool {
    true
}
fn default_profile() -> String {
    "Any".into()
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: default_host(),
            port: default_port(),
            data_dir: default_data_dir(),
            log_level: default_log_level(),
            library_root: None,
            audiobook_root: None,
        }
    }
}
impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: default_db_url(),
        }
    }
}
impl Default for MetadataConfig {
    fn default() -> Self {
        Self {
            openlibrary: MetadataSourceConfig {
                enabled: true,
                api_key: None,
                api_url: None,
            },
            google_books: MetadataSourceConfig {
                enabled: false,
                api_key: None,
                api_url: None,
            },
            goodreads: MetadataSourceConfig {
                enabled: false,
                api_key: None,
                api_url: None,
            },
            hardcover: MetadataSourceConfig {
                enabled: false,
                api_key: None,
                api_url: None,
            },
        }
    }
}
impl Default for QualityConfig {
    fn default() -> Self {
        Self {
            profile: default_profile(),
            custom_profiles: vec![],
        }
    }
}
impl Default for LibraryConfig {
    fn default() -> Self {
        Self {
            root_folder: None,
            audiobook_folder: None,
            rename_files: true,
            author_folder_format: None,
            book_file_format: None,
            import_existing: false,
        }
    }
}
impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
            database: DatabaseConfig::default(),
            metadata: MetadataConfig::default(),
            indexers: vec![],
            download_clients: vec![],
            notifications: vec![],
            quality: QualityConfig::default(),
            library: LibraryConfig::default(),
        }
    }
}
