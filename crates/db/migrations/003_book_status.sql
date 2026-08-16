-- Book lifecycle status: 'tracked' | 'getting' | 'have'
ALTER TABLE books ADD COLUMN status TEXT NOT NULL DEFAULT 'tracked';
