export function implementationLabel(impl: string): string {
  switch (impl) {
    case "torznab":
      return "Torznab";
    case "newznab":
      return "Newznab";
    case "rss":
      return "RSS";
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
    default:
      return "";
  }
}
