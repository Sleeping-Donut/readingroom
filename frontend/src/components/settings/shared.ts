export function implementationLabel(impl: string): string {
  switch (impl) {
    case "torznab":
      return "Torznab";
    case "newznab":
      return "Newznab";
    case "rss":
      return "RSS";
    case "anna":
      return "Anna's Archive";
    default:
      return impl;
  }
}

export function implementationHint(impl: string): string {
  switch (impl) {
    case "torznab":
      return "Torrent indexer using the Torznab protocol.";
    case "newznab":
      return "Usenet indexer using the Newznab protocol.";
    case "rss":
      return "RSS feed indexer — API key is not required.";
    case "anna":
      return "Book search via Anna's Archive. The API key enables fast downloads.";
    default:
      return "";
  }
}
