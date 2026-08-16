/// Parse a host string into (scheme, host_without_port_and_scheme, port, base_path).
/// Accepts "host", "host:8080", "http://host:8080", "https://host:8080/sub", "host/sub".
/// Returns sensible defaults: scheme "http", port fallback given.
pub fn parse_host(host: &str, default_port: u16) -> (String, String, u16, String) {
    let input = host.trim();
    let mut rest = input;
    let mut scheme = "http";

    let lower = input.to_ascii_lowercase();
    if lower.starts_with("http://") {
        rest = &input[7..];
    } else if lower.starts_with("https://") {
        scheme = "https";
        rest = &input[8..];
    }

    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };

    let mut host_only = authority.to_string();
    let mut port = default_port;
    if let Some(idx) = authority.rfind(':') {
        if let Ok(p) = authority[idx + 1..].parse::<u16>() {
            port = p;
            host_only = authority[..idx].to_string();
        }
    }

    let base_path = normalize_path(path);
    (scheme.to_string(), host_only, port, base_path)
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

pub fn client_url(scheme: &str, host: &str, port: u16, base_path: &str, endpoint: &str) -> String {
    let mut url = format!("{}://{}:{}", scheme.trim(), host, port);
    let base = normalize_path(base_path);
    if !base.is_empty() {
        url.push_str(&base);
    }
    let ep = normalize_path(endpoint);
    if !ep.is_empty() {
        url.push_str(&ep);
    }
    url
}

pub fn join_base_paths(a: &str, b: &str) -> String {
    let a = normalize_path(a);
    let b = normalize_path(b);
    match (a.is_empty(), b.is_empty()) {
        (true, true) => String::new(),
        (true, false) => b,
        (false, true) => a,
        (false, false) => format!("{a}{b}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_host() {
        assert_eq!(
            parse_host("host", 8080),
            ("http".to_string(), "host".to_string(), 8080, String::new())
        );
    }

    #[test]
    fn host_with_port() {
        assert_eq!(
            parse_host("host:9091", 8080),
            ("http".to_string(), "host".to_string(), 9091, String::new())
        );
    }

    #[test]
    fn host_with_port_and_path() {
        assert_eq!(
            parse_host("host:8080/sub", 80),
            ("http".to_string(), "host".to_string(), 8080, "/sub".to_string())
        );
    }

    #[test]
    fn scheme_http_host_port() {
        assert_eq!(
            parse_host("http://host:8080", 80),
            ("http".to_string(), "host".to_string(), 8080, String::new())
        );
    }

    #[test]
    fn scheme_https_host() {
        assert_eq!(
            parse_host("https://host", 443),
            ("https".to_string(), "host".to_string(), 443, String::new())
        );
    }

    #[test]
    fn scheme_https_host_port_path() {
        assert_eq!(
            parse_host("https://host:8443/sub/", 443),
            ("https".to_string(), "host".to_string(), 8443, "/sub".to_string())
        );
    }

    #[test]
    fn scheme_uppercase() {
        assert_eq!(
            parse_host("HTTPS://host:8443", 443),
            ("https".to_string(), "host".to_string(), 8443, String::new())
        );
    }

    #[test]
    fn host_with_path() {
        assert_eq!(
            parse_host("host/sub", 8080),
            ("http".to_string(), "host".to_string(), 8080, "/sub".to_string())
        );
    }

    #[test]
    fn host_trailing_slash() {
        assert_eq!(
            parse_host("host/", 8080),
            ("http".to_string(), "host".to_string(), 8080, String::new())
        );
    }

    #[test]
    fn path_only() {
        assert_eq!(
            parse_host("/qb", 8080),
            ("http".to_string(), String::new(), 8080, "/qb".to_string())
        );
    }

    #[test]
    fn invalid_port_kept_in_host() {
        assert_eq!(
            parse_host("host:abc", 8080),
            ("http".to_string(), "host:abc".to_string(), 8080, String::new())
        );
    }

    #[test]
    fn client_url_joins_base_with_slash() {
        assert_eq!(
            client_url("http", "host", 8080, "/qb", "/api/v2/app/version"),
            "http://host:8080/qb/api/v2/app/version"
        );
    }

    #[test]
    fn client_url_base_no_trailing_slash() {
        assert_eq!(
            client_url("http", "host", 8080, "/qb", "/api/v2/app/version"),
            "http://host:8080/qb/api/v2/app/version"
        );
    }

    #[test]
    fn client_url_endpoint_no_leading_slash() {
        assert_eq!(
            client_url("http", "host", 8080, "/qb", "api/v2/app/version"),
            "http://host:8080/qb/api/v2/app/version"
        );
    }

    #[test]
    fn client_url_no_base() {
        assert_eq!(
            client_url("http", "host", 8080, "", "/json"),
            "http://host:8080/json"
        );
    }

    #[test]
    fn client_url_https() {
        assert_eq!(
            client_url("https", "host", 8443, "/qb", "/transmission/rpc"),
            "https://host:8443/qb/transmission/rpc"
        );
    }

    #[test]
    fn join_base_paths_handles_empty() {
        assert_eq!(join_base_paths("", ""), "");
        assert_eq!(join_base_paths("/qb", ""), "/qb");
        assert_eq!(join_base_paths("", "/sub"), "/sub");
        assert_eq!(join_base_paths("/qb", "/api"), "/qb/api");
        assert_eq!(join_base_paths("/qb/", "/api/"), "/qb/api");
    }
}
