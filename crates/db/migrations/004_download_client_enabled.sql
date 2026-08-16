-- Download clients can be enabled/disabled from the Settings UI.
ALTER TABLE download_clients ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
