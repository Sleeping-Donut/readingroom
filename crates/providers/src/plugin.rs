use std::collections::HashMap;
use std::path::Path;

use mlua::Lua;
use readingroom_core::error::{AppError, Result};

use crate::lua::LuaIndexer;
use readingroom_core::config::IndexerConfig;
use readingroom_core::traits::Indexer;

/// A single configurable field a Lua plugin exposes to the WebUI.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ParamDef {
    pub name: String,
    #[serde(default)]
    pub label: String,
    /// string | password | number | boolean | select
    #[serde(default = "default_param_type", rename = "type")]
    pub param_type: String,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default: Option<serde_json::Value>,
    #[serde(default)]
    pub options: Vec<String>,
}

fn default_param_type() -> String {
    "string".into()
}

/// Metadata for an indexer implementation (hardcoded or plugin), surfaced to
/// the WebUI so the add/edit flow can render the right form.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImplementationInfo {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub hint: String,
    pub supports_search: bool,
    pub supports_rss: bool,
    /// Param schema. Empty for hardcoded implementations (the UI renders those
    /// from a static form); plugins always carry their params here.
    #[serde(default)]
    pub params: Vec<ParamDef>,
    /// True when this implementation is a loaded Lua plugin.
    #[serde(default)]
    pub plugin: bool,
}

/// A loaded Lua plugin: its parsed manifest plus the raw source, kept as plain
/// data so the manager stays Send+Sync (Lua states are created per-indexer).
#[derive(Debug, Clone)]
pub struct PluginDef {
    pub name: String,
    pub label: String,
    pub version: Option<String>,
    pub supports_search: bool,
    pub supports_rss: bool,
    pub params: Vec<ParamDef>,
    pub source: String,
}

impl PluginDef {
    /// Evaluate the Lua file and extract the manifest table. The Lua state is
    /// dropped immediately; only plain data is retained.
    fn parse(source: &str) -> Result<PluginDef> {
        let lua = Lua::new();
        let chunk = lua.load(source).set_name("plugin");
        let table: mlua::Table = chunk.eval().map_err(lua_err)?;

        let name: String = table.get("name").map_err(lua_err)?;
        if name.trim().is_empty() {
            return Err(AppError::Other("Plugin is missing a non-empty 'name'".into()));
        }
        let label: String = table.get("label").unwrap_or_else(|_| name.clone());
        let version: Option<String> = table.get("version").ok();
        let supports_search: bool = table.get("supports_search").unwrap_or(false);
        let supports_rss: bool = table.get("supports_rss").unwrap_or(false);
        let params = parse_params(&table)?;

        Ok(PluginDef {
            name,
            label,
            version,
            supports_search,
            supports_rss,
            params,
            source: source.to_string(),
        })
    }
}

fn parse_params(table: &mlua::Table) -> Result<Vec<ParamDef>> {
    let value: mlua::Value = table.get("params").unwrap_or(mlua::Value::Nil);
    if value.is_nil() {
        return Ok(vec![]);
    }
    let json = serde_json::to_value(&value).map_err(|e| {
        AppError::Other(format!("Plugin 'params' is not serializable: {e}"))
    })?;
    serde_json::from_value(json)
        .map_err(|e| AppError::Other(format!("Plugin 'params' is malformed: {e}")))
}

/// Owns the set of loaded Lua plugins.
#[derive(Debug, Default)]
pub struct PluginManager {
    plugins: HashMap<String, PluginDef>,
}

impl PluginManager {
    /// Load every `*.lua` file in the given directories. Missing directories
    /// are fine; a broken file is logged and skipped so one plugin can't take
    /// the server down.
    pub fn load_dirs(paths: &[std::path::PathBuf]) -> Result<Self> {
        let mut manager = PluginManager::default();
        for path in paths {
            manager.load_dir(path)?;
        }
        Ok(manager)
    }

    /// Load every `*.lua` file in `path` into this manager. Missing directories
    /// are fine; a broken file is logged and skipped.
    pub fn load_dir(&mut self, path: &Path) -> Result<()> {
        if !path.exists() {
            return Ok(());
        }
        let mut files: Vec<_> = std::fs::read_dir(path)?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map(|x| x == "lua").unwrap_or(false))
            .collect();
        files.sort();

        for file in files {
            let source = match std::fs::read_to_string(&file) {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!(file = %file.display(), error = %e, "Failed to read Lua plugin");
                    continue;
                }
            };
            match PluginDef::parse(&source) {
                Ok(def) => {
                    if self.plugins.contains_key(&def.name) {
                        tracing::warn!(
                            plugin = %def.name,
                            file = %file.display(),
                            "Duplicate plugin name, skipping"
                        );
                    } else {
                        tracing::info!(plugin = %def.name, file = %file.display(), "Loaded Lua plugin");
                        self.plugins.insert(def.name.clone(), def);
                    }
                }
                Err(e) => {
                    tracing::error!(file = %file.display(), error = %e, "Failed to load Lua plugin");
                }
            }
        }
        Ok(())
    }

    pub fn get(&self, name: &str) -> Option<&PluginDef> {
        self.plugins.get(name)
    }

    pub fn implementations(&self) -> Vec<ImplementationInfo> {
        self.plugins
            .values()
            .map(|p| ImplementationInfo {
                id: p.name.clone(),
                label: p.label.clone(),
                hint: format!(
                    "Lua plugin{}.",
                    p.version.as_deref().map(|v| format!(" v{v}")).unwrap_or_default()
                ),
                supports_search: p.supports_search,
                supports_rss: p.supports_rss,
                params: p.params.clone(),
                plugin: true,
            })
            .collect()
    }

    pub fn is_empty(&self) -> bool {
        self.plugins.is_empty()
    }

    pub fn len(&self) -> usize {
        self.plugins.len()
    }

    /// Build a running indexer for a config whose implementation is a plugin.
    pub fn build(&self, config: &IndexerConfig) -> Option<Result<Box<dyn Indexer>>> {
        let def = self.plugins.get(&config.implementation)?;
        let settings = config
            .settings
            .as_deref()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
            .unwrap_or_else(|| serde_json::json!({}));
        Some(
            LuaIndexer::new(config.name.clone(), def.clone(), settings)
                .map(|i| -> Box<dyn Indexer> { Box::new(i) }),
        )
    }
}

pub(crate) fn lua_err(e: mlua::Error) -> AppError {
    AppError::Other(format!("Lua error: {e}"))
}
