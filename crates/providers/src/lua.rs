use async_trait::async_trait;
use mlua::{Lua, LuaSerdeExt, Table, Value};
use readingroom_core::{
    error::{AppError, Result},
    models::{DownloadType, Release},
    traits::{Indexer, SearchCriteria},
};

use crate::plugin::{ParamDef, PluginDef, lua_err};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// An indexer backed by a loaded Lua plugin. Each instance owns its Lua state
/// (`Lua` is `!Send`), created fresh per call inside `spawn_blocking` so the
/// async runtime never blocks on Lua/HTTP.
#[derive(Clone)]
pub struct LuaIndexer {
    name: String,
    plugin: PluginDef,
    settings: serde_json::Value,
    client: reqwest::blocking::Client,
}

impl LuaIndexer {
    pub fn new(name: String, plugin: PluginDef, settings: serde_json::Value) -> Result<Self> {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::Config(format!("HTTP client: {e}")))?;
        Ok(Self {
            name,
            plugin,
            settings,
            client,
        })
    }

    /// Run the plugin's `search` (blocking; call from spawn_blocking).
    fn run(&self, criteria: &SearchCriteria) -> Result<Vec<Release>> {
        let lua = Lua::new();
        register_host(&lua, self.client.clone())?;

        let table: Table = lua
            .load(&self.plugin.source)
            .set_name("plugin")
            .eval()
            .map_err(lua_err)?;

        let self_table = build_self_table(&lua, &self.settings, &self.plugin.params)?;
        let crit = build_criteria_table(&lua, criteria)?;

        let search: mlua::Function = table.get("search").map_err(lua_err)?;
        let result: Value = search.call((self_table, crit)).map_err(lua_err)?;
        decode_releases(&self.name, result)
    }

    /// Run the plugin's `rss_sync` if it defines one.
    fn run_rss(&self) -> Result<Vec<Release>> {
        let lua = Lua::new();
        register_host(&lua, self.client.clone())?;

        let table: Table = lua
            .load(&self.plugin.source)
            .set_name("plugin")
            .eval()
            .map_err(lua_err)?;

        let rss: mlua::Function = match table.get("rss_sync") {
            Ok(f) => f,
            Err(_) => return Ok(vec![]),
        };
        let self_table = build_self_table(&lua, &self.settings, &self.plugin.params)?;
        let result: Value = rss.call(self_table).map_err(lua_err)?;
        decode_releases(&self.name, result)
    }
}

fn build_self_table(
    lua: &Lua,
    settings: &serde_json::Value,
    params: &[ParamDef],
) -> Result<Table> {
    let t = lua.create_table().map_err(lua_err)?;
    // Params with defaults first, so settings always win.
    for p in params {
        if let Some(default) = &p.default {
            let v = lua.to_value(default).map_err(lua_err)?;
            t.set(p.name.as_str(), v).map_err(lua_err)?;
        }
    }
    if let Some(obj) = settings.as_object() {
        for (k, v) in obj {
            let lv = lua.to_value(v).map_err(lua_err)?;
            t.set(k.as_str(), lv).map_err(lua_err)?;
        }
    }
    Ok(t)
}

fn build_criteria_table(lua: &Lua, criteria: &SearchCriteria) -> Result<Table> {
    let t = lua.create_table().map_err(lua_err)?;
    if let Some(q) = &criteria.query {
        t.set("query", q.clone()).map_err(lua_err)?;
    }
    if let Some(a) = &criteria.author {
        t.set("author", a.clone()).map_err(lua_err)?;
    }
    if let Some(title) = &criteria.title {
        t.set("title", title.clone()).map_err(lua_err)?;
    }
    if let Some(isbn) = &criteria.isbn {
        t.set("isbn", isbn.clone()).map_err(lua_err)?;
    }
    if let Some(limit) = criteria.limit {
        t.set("limit", limit as i64).map_err(lua_err)?;
    }
    Ok(t)
}

fn decode_releases(indexer: &str, result: Value) -> Result<Vec<Release>> {
    if result.is_nil() {
        return Ok(vec![]);
    }
    let json = serde_json::to_value(&result)
        .map_err(|e| AppError::Other(format!("Plugin returned non-serializable value: {e}")))?;
    // Lua tables that aren't a clean array (e.g. an empty table) can serialize
    // as a JSON object; treat an empty object as "no results".
    if json.is_object() && json.as_object().map(|m| m.is_empty()).unwrap_or(false) {
        return Ok(vec![]);
    }
    let rows: Vec<LuaRelease> = serde_json::from_value(json)
        .map_err(|e| AppError::Other(format!("Plugin search result is malformed: {e}")))?;
    Ok(rows
        .into_iter()
        .map(|r| Release {
            title: r.title,
            info_url: r.info_url,
            download_url: r.download_url,
            size: r.size,
            pub_date: chrono::Utc::now(),
            indexer: indexer.to_string(),
            download_type: download_type(&r.download_type),
            seeders: None,
            peers: None,
            grabs: None,
            categories: r.categories,
        })
        .collect())
}

fn download_type(s: &Option<String>) -> DownloadType {
    match s.as_deref().map(|x| x.to_lowercase()).as_deref() {
        Some("nzb") => DownloadType::NZB,
        Some("torrent") => DownloadType::Torrent,
        Some("magnet") => DownloadType::Magnet,
        _ => DownloadType::Direct,
    }
}

#[derive(serde::Deserialize)]
struct LuaRelease {
    title: String,
    info_url: String,
    download_url: String,
    #[serde(default)]
    size: i64,
    #[serde(default)]
    download_type: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
}

// ---------------------------------------------------------------------------
// Host API
// ---------------------------------------------------------------------------

/// Expose a `host` global table: HTTP + JSON + URL + logging helpers so plugins
/// have no surprise network path of their own.
fn register_host(lua: &Lua, client: reqwest::blocking::Client) -> Result<()> {
    let host = lua.create_table().map_err(lua_err)?;

    let c = client.clone();
    let http_get = lua
        .create_function(move |_, url: String| -> mlua::Result<(Option<String>, Option<String>)> {
            match c.get(&url).send() {
                Ok(resp) => match resp.text() {
                    Ok(body) => Ok((Some(body), None)),
                    Err(e) => Ok((None, Some(format!("read error: {e}")))),
                },
                Err(e) => Ok((None, Some(format!("http error: {e}")))),
            }
        })
        .map_err(lua_err)?;
    host.set("http_get", http_get).map_err(lua_err)?;

    let c = client.clone();
    let http_get_json = lua
        .create_function(
            move |lua, url: String| -> mlua::Result<(Value, Option<String>)> {
                let body = match c.get(&url).send() {
                    Ok(resp) => match resp.text() {
                        Ok(b) => b,
                        Err(e) => return Ok((Value::Nil, Some(format!("read error: {e}")))),
                    },
                    Err(e) => return Ok((Value::Nil, Some(format!("http error: {e}")))),
                };
                match serde_json::from_str::<serde_json::Value>(&body) {
                    Ok(json) => Ok((lua.to_value(&json)?, None)),
                    Err(e) => Ok((Value::Nil, Some(format!("json error: {e}")))),
                }
            },
        )
        .map_err(lua_err)?;
    host.set("http_get_json", http_get_json).map_err(lua_err)?;

    let url_encode = lua
        .create_function(|_, s: String| -> mlua::Result<String> {
            Ok(url::form_urlencoded::byte_serialize(s.as_bytes()).collect())
        })
        .map_err(lua_err)?;
    host.set("url_encode", url_encode).map_err(lua_err)?;

    let url_decode = lua
        .create_function(|_, s: String| -> mlua::Result<String> {
            Ok(url::form_urlencoded::parse(s.as_bytes())
                .map(|(_, v)| v.into_owned())
                .collect())
        })
        .map_err(lua_err)?;
    host.set("url_decode", url_decode).map_err(lua_err)?;

    let json_encode = lua
        .create_function(|_lua, v: Value| -> mlua::Result<(Option<String>, Option<String>)> {
            match serde_json::to_string(&v) {
                Ok(s) => Ok((Some(s), None)),
                Err(e) => Ok((None, Some(format!("json error: {e}")))),
            }
        })
        .map_err(lua_err)?;
    host.set("json_encode", json_encode).map_err(lua_err)?;

    let json_decode = lua
        .create_function(|lua, s: String| -> mlua::Result<(Value, Option<String>)> {
            match serde_json::from_str::<serde_json::Value>(&s) {
                Ok(json) => Ok((lua.to_value(&json)?, None)),
                Err(e) => Ok((Value::Nil, Some(format!("json error: {e}")))),
            }
        })
        .map_err(lua_err)?;
    host.set("json_decode", json_decode).map_err(lua_err)?;

    let log = lua
        .create_function(|_, (level, msg): (String, String)| -> mlua::Result<()> {
            match level.as_str() {
                "warn" => tracing::warn!("{msg}"),
                "error" => tracing::error!("{msg}"),
                _ => tracing::info!("{msg}"),
            }
            Ok(())
        })
        .map_err(lua_err)?;
    host.set("log", log).map_err(lua_err)?;

    lua.globals().set("host", host).map_err(lua_err)?;
    Ok(())
}

#[async_trait]
impl Indexer for LuaIndexer {
    fn name(&self) -> &str {
        &self.name
    }

    fn supports_rss(&self) -> bool {
        self.plugin.supports_rss
    }

    fn supports_search(&self) -> bool {
        self.plugin.supports_search
    }

    async fn rss_sync(&self) -> Result<Vec<Release>> {
        if !self.plugin.supports_rss {
            return Ok(vec![]);
        }
        let this = self.clone();
        tokio::task::spawn_blocking(move || this.run_rss())
            .await
            .map_err(|e| AppError::Other(format!("Plugin thread panicked: {e}")))?
    }

    async fn search(&self, criteria: &SearchCriteria) -> Result<Vec<Release>> {
        let this = self.clone();
        let criteria = criteria.clone();
        tokio::task::spawn_blocking(move || this.run(&criteria))
            .await
            .map_err(|e| AppError::Other(format!("Plugin thread panicked: {e}")))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin::PluginManager;

    const MINIMAL_PLUGIN: &str = r#"
return {
  name = "smoke-test",
  label = "Smoke Test",
  supports_search = true,
  supports_rss = false,
  params = {
    { name = "base", label = "Base", type = "string", required = true, default = "x" },
    { name = "api_key", label = "Key", type = "password", required = false },
  },
  search = function(self, criteria)
    local results = {}
    local q = criteria.query or "none"
    results[1] = {
      title = self.base .. " - " .. q .. " [epub]",
      info_url = "https://example.com/books/1",
      download_url = "https://example.com/dl/" .. self.api_key,
      size = 1048576,
      download_type = "Direct",
      categories = { "epub" },
    }
    return results
  end,
}
"#;

    #[test]
    fn plugin_loads_manifest_and_runs_search() {
        let dir = std::env::temp_dir().join(format!("rr_plugin_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("smoke.lua"), MINIMAL_PLUGIN).unwrap();

        let manager = PluginManager::load_dirs(&[dir.clone()]).unwrap();
        assert_eq!(manager.len(), 1);
        let def = manager.get("smoke-test").expect("plugin registered");
        assert_eq!(def.label, "Smoke Test");
        assert_eq!(def.params.len(), 2);
        assert!(def.supports_search);

        let idx = LuaIndexer::new(
            "Smoke Instance".into(),
            def.clone(),
            serde_json::json!({ "api_key": "sekret" }),
        )
        .unwrap();
        let releases = idx
            .run(&SearchCriteria {
                query: Some("Foundation".into()),
                author: None,
                title: None,
                isbn: None,
                limit: None,
            })
            .unwrap();
        assert_eq!(releases.len(), 1);
        assert_eq!(releases[0].title, "x - Foundation [epub]");
        assert_eq!(releases[0].download_url, "https://example.com/dl/sekret");
        assert_eq!(releases[0].indexer, "Smoke Instance");
        assert_eq!(releases[0].download_type, DownloadType::Direct);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Feed the bundled annas-archive.lua a canned HTML page via a stub host
    /// (no network) to exercise its parsing in isolation.
    #[test]
    fn annas_plugin_parses_canned_html() {
        let source = include_str!("../lua_plugins/annas-archive.lua");
        let lua = Lua::new();
        let host = lua.create_table().unwrap();
        let fixture = r#"<html><body>
<div class="flex gap-[18px] items-start">
  <div class="min-w-0 flex-1 pt-[2px]">
    <h3 class="font-bold text-lg leading-tight">
      <a href="https://annas-archive.is/books/5719046-foundation-5719046" class="custom-a text-black">Foundation</a>
    </h3>
    <div class="text-sm text-[#666] mt-1">Isaac Asimov · 2004 · EPUB · 2.3 MB · Books catalog</div>
  </div>
</div>
<div class="flex gap-[18px] items-start">
  <div class="min-w-0 flex-1 pt-[2px]">
    <h3 class="font-bold text-lg leading-tight">
      <a href="https://annas-archive.is/books/29118438-29118438-foundation-3" class="custom-a text-black">Foundation</a>
    </h3>
    <div class="text-sm text-[#666] mt-1">Asimov, Isaac · FB2 · 400.9 KB · Books catalog</div>
  </div>
</div>
</body></html>"#;
        host.set(
            "http_get",
            lua.create_function(move |_, _url: String| {
                Ok((Some(fixture.to_string()), None::<String>))
            })
            .unwrap(),
        )
        .unwrap();
        host.set(
            "url_encode",
            lua.create_function(|_, s: String| Ok(s)).unwrap(),
        )
        .unwrap();
        host.set(
            "log",
            lua.create_function(|_, _: (String, String)| Ok(())).unwrap(),
        )
        .unwrap();
        lua.globals().set("host", host).unwrap();

        let table: Table = lua.load(source).set_name("plugin").eval().unwrap();
        let search: mlua::Function = table.get("search").unwrap();
        let self_table = lua.create_table().unwrap();
        self_table.set("url", "https://annas-archive.is").unwrap();
        let crit = lua.create_table().unwrap();
        crit.set("query", "Foundation").unwrap();
        let result: Value = search.call((self_table, crit)).unwrap();

        let releases = decode_releases("test", result).unwrap();
        assert_eq!(releases.len(), 2);
        assert_eq!(releases[0].title, "Isaac Asimov - Foundation [epub]");
        assert_eq!(releases[1].title, "Asimov, Isaac - Foundation [fb2]");
        assert_eq!(releases[0].size, (2.3 * 1024.0 * 1024.0) as i64);
        assert_eq!(
            releases[0].download_url,
            "https://annas-archive.is/dyn/api/fast_download.json?md5=5719046"
        );
    }

    /// Feed the bundled libgen.lua a canned JSON payload via a stub host.
    #[test]
    fn libgen_plugin_parses_canned_json() {
        let source = include_str!("../lua_plugins/libgen.lua");
        let lua = Lua::new();
        let host = lua.create_table().unwrap();
        let payload = r#"
            return function(url)
              return { data = {
                { id = 587, title = "Foundations of Reinforcement Learning with Applications in Finance",
                  author = "Ashwin Rao, Tikhon Jelvis", extension = "epub", filesize = 29772674 },
                { id = 28861096, title = "Foundation", author = "Isaac Asimov", extension = "EPUB", filesize = 123456 },
              } }
            end
        "#;
        host.set("http_get_json", lua.load(payload).eval::<mlua::Function>().unwrap())
            .unwrap();
        host.set("url_encode", lua.create_function(|_, s: String| Ok(s)).unwrap())
            .unwrap();
        host.set("log", lua.create_function(|_, _: (String, String)| Ok(())).unwrap())
            .unwrap();
        lua.globals().set("host", host).unwrap();

        let table: Table = lua.load(source).set_name("plugin").eval().unwrap();
        let search: mlua::Function = table.get("search").unwrap();
        let self_table = lua.create_table().unwrap();
        self_table.set("url", "https://libgen.vc").unwrap();
        let crit = lua.create_table().unwrap();
        crit.set("query", "Foundation").unwrap();
        let result: Value = search.call((self_table, crit)).unwrap();

        let releases = decode_releases("test", result).unwrap();
        assert_eq!(releases.len(), 2);
        assert_eq!(
            releases[0].title,
            "Ashwin Rao, Tikhon Jelvis - Foundations of Reinforcement Learning with Applications in Finance [epub]"
        );
        assert_eq!(releases[0].size, 29772674);
        assert_eq!(
            releases[0].download_url,
            "https://libgen.vc/index.php/edition/587"
        );
        assert_eq!(releases[1].title, "Isaac Asimov - Foundation [epub]");
        assert_eq!(releases[1].size, 123456);
        assert_eq!(releases[1].categories, vec!["epub".to_string()]);
    }
}
