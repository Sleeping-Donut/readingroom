-- Audiobook support: independent per-media monitoring and a queue media type.

ALTER TABLE books ADD COLUMN monitored_audiobook INTEGER NOT NULL DEFAULT 0;
ALTER TABLE queue ADD COLUMN media_type TEXT NOT NULL DEFAULT 'ebook';
