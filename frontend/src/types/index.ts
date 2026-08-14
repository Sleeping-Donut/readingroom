export interface Author {
  id: number;
  foreign_id: string;
  name: string;
  sort_name?: string;
  image_url?: string;
  biography?: string;
  birth_date?: string;
  death_date?: string;
  genres: string[];
  aliases: string[];
  links: { url: string; label?: string }[];
  monitored: boolean;
  added_at: string;
  tags: number[];
}

export interface Book {
  id: number;
  foreign_id: string;
  author_id: number;
  title: string;
  clean_title: string;
  description?: string;
  isbn?: string;
  isbn13?: string;
  pages?: number;
  publisher?: string;
  publish_date?: string;
  image_url?: string;
  genres: string[];
  ratings?: number;
  language: string;
  monitored: boolean;
  added_at: string;
  last_search_at?: string;
}

export interface Edition {
  id: number;
  book_id: number;
  title: string;
  format: string;
  quality?: string;
  publisher?: string;
  pages?: number;
  release_date?: string;
  monitored: boolean;
}

export interface HistoryItem {
  id: number;
  event_type: string;
  source_title: string | null;
  book_id: number | null;
  indexer: string | null;
  download_client: string | null;
  download_id: string | null;
  quality: string | null;
  size: number | null;
  data: string | null;
  date: string;
}

export interface BookFile {
  id: number;
  edition_id: number;
  path: string;
  size: number;
  quality: string;
  format: string;
  date_added: string;
}

export interface Release {
  title: string;
  info_url: string;
  download_url: string;
  size: number;
  pub_date: string;
  indexer: string;
  download_type: string;
  seeders?: number;
}

export interface SystemStatus {
  version: string;
  name: string;
  startup_path: string;
  auth_enabled: boolean;
}

export interface Indexer {
  id: number;
  name: string;
  implementation: string;
  settings: string;
  enable_rss: boolean;
  enable_search: boolean;
  priority: number;
  tags: string;
  created_at: string;
}

export interface DownloadClient {
  id: number;
  name: string;
  implementation: string;
  settings: string;
  priority: number;
  tags: string;
  created_at: string;
}

export interface Notification {
  id: number;
  name: string;
  implementation: string;
  settings: string;
  on_grab: boolean;
  on_import: boolean;
  on_upgrade: boolean;
  on_health_issue: boolean;
  created_at: string;
}
