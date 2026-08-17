-- Library Genesis plugin indexer (libgen.vc JSON API).

return {
  name = "libgen",
  label = "Library Genesis",
  supports_search = true,
  supports_rss = false,
  params = {
    { name = "url", label = "Base URL", type = "string", required = true, default = "https://libgen.vc" },
  },

  search = function(self, criteria)
    local q = criteria.query
    if not q then return {} end

    local base = (self.url or ""):gsub("/+$", "")
    local url = base .. "/json.php?object=f&q=" .. host.url_encode(q) .. "&limit1=0&limit2=25"
    local res, err = host.http_get_json(url)
    if not res then return {}, err end
    if not res.data or #res.data == 0 then return {} end

    local results = {}
    for i = 1, #res.data do
      local row = res.data[i]
      local title = row.title or ""
      local author = (row.author or ""):gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
      local ext = (row.extension or ""):lower()
      local size = tonumber(row.filesize) or 0

      if title == "" then title = tostring(row.id) or "" end
      if author ~= "" and not title:lower():find(author:lower(), 1, true) then
        title = author .. " - " .. title
      end
      if ext ~= "" then
        title = title .. " [" .. ext .. "]"
      end

      local edition = base .. "/index.php/edition/" .. tostring(row.id)
      local categories = {}
      if ext ~= "" then categories[1] = ext end

      results[#results + 1] = {
        title = title,
        info_url = edition,
        download_url = edition,
        size = size,
        download_type = "Direct",
        categories = categories,
      }
    end
    return results
  end,
}
