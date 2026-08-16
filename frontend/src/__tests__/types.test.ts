import { describe, it, expect } from "vite-plus/test";

import type { Author, Book, Release, SystemStatus } from "../types";

describe("TypeScript types", () => {
  it("Author type has required fields", () => {
    const author: Author = {
      id: 1,
      foreign_id: "OL123",
      name: "Test",
      sort_name: undefined,
      biography: undefined,
      image_url: undefined,
      birth_date: undefined,
      death_date: undefined,
      genres: [],
      aliases: [],
      links: [],
      monitored: true,
      added_at: new Date().toISOString(),
      tags: [],
    };
    expect(author.name).toBe("Test");
  });

  it("Book type accepts optional fields", () => {
    const book: Book = {
      id: 1,
      foreign_id: "OL456",
      author_id: 1,
      title: "Test Book",
      clean_title: "test book",
      description: undefined,
      isbn: undefined,
      isbn13: undefined,
      pages: undefined,
      publisher: undefined,
      publish_date: undefined,
      image_url: undefined,
      genres: ["fiction"],
      ratings: undefined,
      language: "en",
      monitored: true,
      added_at: new Date().toISOString(),
    };
    expect(book.pages).toBeUndefined();
    expect(book.ratings).toBeUndefined();
  });

  it("SystemStatus has version", () => {
    const status: SystemStatus = {
      version: "0.1.0",
      name: "ReadingRoom",
      startup_path: "/data",
      auth_enabled: false,
    };
    expect(status.version).toBe("0.1.0");
  });

  it("Release has download_type", () => {
    const release: Release = {
      title: "Test Release",
      info_url: "https://example.com",
      download_url: "https://example.com/download",
      size: 1000,
      pub_date: new Date().toISOString(),
      indexer: "test",
      download_type: "Torrent",
    };
    expect(release.download_type).toBe("Torrent");
  });
});
