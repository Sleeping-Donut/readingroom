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
  monitored: boolean;
  added_at: string;
}

export interface Book {
  id: number;
  foreign_id: string;
  author_id: number;
  title: string;
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
