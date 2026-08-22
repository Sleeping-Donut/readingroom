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
	author_foreign_id?: string;
	title: string;
	clean_title: string;
	description?: string;
	isbn?: string;
	isbn13?: string;
	asin?: string;
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
	author_name?: string;
	status?: string;
}

export interface Edition {
	id: number;
	book_id: number;
	foreign_edition_id?: string;
	isbn13?: string;
	title: string;
	language?: string;
	format: string;
	quality?: string;
	publisher?: string;
	pages?: number;
	release_date?: string;
	image_url?: string;
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
	enabled: boolean;
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

export interface User {
	id: number;
	username: string;
	role: string;
}

export interface SystemStats {
	total_authors: number;
	total_books: number;
	wanted_books: number;
	active_queue: number;
	total_files: number;
	total_size: number;
	recent_history: {
		id: number;
		event_type: string;
		source_title: string | null;
		date: string;
	}[];
}

export interface HistoryResponse {
	history: HistoryItem[];
}

export interface MonthGroup {
	year: number;
	month: number;
	books: Book[];
}

export interface CalendarResponse {
	months: MonthGroup[];
}

export interface WantedResponse {
	books: Book[];
	total: number;
}

export interface QueueEntry {
	id: number;
	book_id: number | null;
	title: string;
	download_client: string;
	download_id: string;
	size: number | null;
	status: string;
	progress: number;
	added_at: string;
	error?: boolean;
}

export interface QueueResponse {
	queue: QueueEntry[];
	total: number;
}

export interface IndexersResponse {
	indexers: Indexer[];
}

export interface DownloadClientsResponse {
	download_clients: DownloadClient[];
}

export interface NotificationsResponse {
	notifications: Notification[];
}

export interface TestResponse {
	success: boolean;
	message?: string;
	version?: string;
	default_save_path?: string;
}

export interface TestResult {
	status: "idle" | "testing" | "success" | "error";
	message?: string;
	version?: string;
	default_save_path?: string;
}
