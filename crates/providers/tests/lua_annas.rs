use std::io::{Read, Write};
use std::net::TcpListener;

use readingroom_core::config::IndexerConfig;
use readingroom_core::models::Release;
use readingroom_core::traits::{Indexer, SearchCriteria};
use readingroom_providers::annas::AnnaIndexer;
use readingroom_providers::plugin::PluginManager;

/// Spawn a mock server that serves the same Anna's Archive fixture HTML for
/// two sequential requests (one per indexer), mirroring the pattern used in
/// `crates/downloaders/src/http.rs`.
fn spawn_mock() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let base = format!("http://{addr}");
    let fixture = format!(
        r#"<html><body>
<div class="flex gap-[18px] items-start">
  <div class="min-w-0 flex-1 pt-[2px]">
    <h3 class="font-bold text-lg leading-tight">
      <a href="{base}/books/5719046-foundation-5719046" class="custom-a">Foundation</a>
    </h3>
    <div class="text-sm text-[#666] mt-1">Isaac Asimov · 2004 · EPUB · 2.3 MB · Books catalog</div>
  </div>
</div>
<div class="flex gap-[18px] items-start">
  <div class="min-w-0 flex-1 pt-[2px]">
    <h3 class="font-bold text-lg leading-tight">
      <a href="{base}/books/29118438-29118438-foundation-3" class="custom-a">Foundation</a>
    </h3>
    <div class="text-sm text-[#666] mt-1">Asimov, Isaac · FB2 · 400.9 KB · Books catalog</div>
  </div>
</div>
</body></html>"#
    );
    std::thread::spawn(move || {
        for _ in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf).unwrap();
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                fixture.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(fixture.as_bytes());
            let _ = stream.flush();
        }
    });
    base
}

/// A comparable identity for a release, ignoring indexer name and pub_date.
fn keys(releases: &[Release]) -> Vec<String> {
    let mut keys: Vec<String> = releases
        .iter()
        .map(|r| {
            format!(
                "{}|{}|{}|{}|{}",
                r.title,
                r.info_url,
                r.download_url,
                r.size,
                r.categories.join(",")
            )
        })
        .collect();
    keys.sort();
    keys
}

fn criteria() -> SearchCriteria {
    SearchCriteria {
        query: Some("Foundation".into()),
        author: None,
        title: None,
        isbn: None,
        limit: None,
    }
}

// `#[test]`, not `#[tokio::test]`: the Lua plugin's host API and `LuaIndexer`
// use a reqwest *blocking* client, which panics if built inside an async
// runtime. Searches are run on a runtime created here, after construction.
#[test]
fn lua_annas_matches_hardcoded_indexer() {
    let base = spawn_mock();

    let rust_cfg = IndexerConfig {
        name: "rust".into(),
        implementation: "anna".into(),
        url: base.clone(),
        api_key: Some("k".into()),
        settings: None,
        enabled: true,
        rss_enabled: false,
        search_enabled: true,
        categories: vec![],
        priority: 0,
        tags: vec![],
    };
    let rust_idx = AnnaIndexer::new(&rust_cfg).unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let rust_res = rt.block_on(rust_idx.search(&criteria())).unwrap();
    assert_eq!(rust_res.len(), 2);
    assert_eq!(rust_res[0].title, "Isaac Asimov - Foundation [epub]");
    assert_eq!(rust_res[1].title, "Asimov, Isaac - Foundation [fb2]");
    assert_eq!(rust_res[0].size, (2.3 * 1024.0 * 1024.0) as i64);
    assert_eq!(rust_res[1].size, (400.9 * 1024.0) as i64);

    let dir = std::env::temp_dir().join(format!("rr_lua_annas_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("annas-archive.lua"),
        include_str!("../lua_plugins/annas-archive.lua"),
    )
    .unwrap();

    let manager = PluginManager::load_dirs(&[dir.clone()]).unwrap();
    assert!(manager.get("annas-archive").is_some());

    let lua_cfg = IndexerConfig {
        name: "lua".into(),
        implementation: "annas-archive".into(),
        url: base.clone(),
        api_key: Some("k".into()),
        settings: Some(format!(r#"{{"url":"{base}","api_key":"k"}}"#)),
        enabled: true,
        rss_enabled: false,
        search_enabled: true,
        categories: vec![],
        priority: 0,
        tags: vec![],
    };
    let lua_idx = manager.build(&lua_cfg).unwrap().unwrap();
    let lua_res = rt.block_on(lua_idx.search(&criteria())).unwrap();

    let _ = std::fs::remove_dir_all(&dir);

    assert_eq!(keys(&rust_res), keys(&lua_res));
}
