-- Anna's Archive plugin indexer.
-- Lua port of crates/providers/src/annas.rs (plugin plan, step 4).

local FORMATS = { "PDF", "EPUB", "MOBI", "AZW3", "FB2", "TXT", "DJVU", "CBR", "CBZ",
  "RTF", "LIT", "DOC", "DOCX", "HTML", "HTM", "LRF", "MHT", "ZIP", "RAR", "PDB", "RB" }

local function book_id(href)
  local path = href:match("^([^?#]+)")
  if not path then return nil end
  local md5 = path:match("/md5/([^/]+)")
  if md5 then return md5 end
  return path:match("/books/([^%-/]+)")
end

local function extract_format(meta)
  local m = meta:upper()
  for i = 1, #FORMATS do
    local f = FORMATS[i]
    if m:find("%f[%w]" .. f .. "%f[%W]", 1) then
      return f:lower()
    end
  end
  return nil
end

local function extract_size(meta)
  local num, unit = meta:lower():match("(%d+%.?%d*)%s*([kmgt]?b)")
  if not num then return 0 end
  local value = tonumber(num) or 0
  local mult = 1
  if unit == "kb" then mult = 1024
  elseif unit == "mb" then mult = 1024 * 1024
  elseif unit == "gb" then mult = 1024 * 1024 * 1024
  elseif unit == "tb" then mult = 1024 * 1024 * 1024 * 1024
  end
  return math.floor(value * mult)
end

local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

return {
  name = "annas-archive",
  label = "Anna's Archive",
  supports_search = true,
  supports_rss = false,
  params = {
    { name = "url", label = "Base URL", type = "string", required = true, default = "https://annas-archive.is" },
    { name = "api_key", label = "API Key", type = "password", required = false },
  },

  search = function(self, criteria)
    local q = criteria.query
    if not q then return {} end

    local base = (self.url or ""):gsub("/+$", "")
    local url = base .. "/search?q=" .. host.url_encode(q) .. "&content=books&lang=all"
    local body, err = host.http_get(url)
    if not body then return {}, err end
    if body:find("No records found", 1, true) then return {} end

    body = body:gsub("<!%-%-", ""):gsub("%-%->", "")

    local results = {}
    for card in body:gmatch('<div class="flex gap%-%[18px%] items%-start">(.-)</div>') do
      local href, title
      for h, t in card:gmatch('<a[^>]*href="([^"]+)"[^>]*>(.-)</a>') do
        if h:find("/books/", 1, true) or h:find("/md5/", 1, true) then
          href, title = h, t
          break
        end
      end
      title = title and trim(title) or ""
      local id = href and book_id(href) or nil
      if id and title ~= "" then
        local meta = card:match('<div class="[^"]*text%-sm[^"]*">([^<]+)') or ""
        local author = trim(meta:match("^(.-)·") or "")
        local ext = extract_format(meta)
        local size = extract_size(meta)

        if author ~= "" and not title:lower():find(author:lower(), 1, true) then
          title = author .. " - " .. title
        end
        if ext then
          title = title .. " [" .. ext .. "]"
        end

        local info = base .. "/books/" .. id
        if #id == 32 then info = base .. "/md5/" .. id end
        local download = base .. "/dyn/api/fast_download.json?md5=" .. id
        if self.api_key then download = download .. "&key=" .. self.api_key end

        local categories = {}
        if ext then categories[1] = ext end

        results[#results + 1] = {
          title = title,
          info_url = info,
          download_url = download,
          size = size,
          download_type = "Direct",
          categories = categories,
        }
      end
    end
    return results
  end,
}
