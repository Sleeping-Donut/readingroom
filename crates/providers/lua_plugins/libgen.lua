-- Library Genesis plugin indexer (libgen.li HTML search + get.php direct download).

local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function decode_entities(s)
  s = s:gsub("&quot;", '"')
  s = s:gsub("&#39;", "'")
  s = s:gsub("&apos;", "'")
  s = s:gsub("&lt;", "<")
  s = s:gsub("&gt;", ">")
  s = s:gsub("&nbsp;", " ")
  s = s:gsub("&amp;", "&")
  return s
end

local function clean(s)
  if not s then return "" end
  s = s:gsub("<[^>]*>", " ")
  s = decode_entities(s)
  s = s:gsub("%s+", " ")
  return trim(s)
end

local function parse_size(text)
  if not text then return 0 end
  local num, unit = text:lower():match("(%d+%.?%d*)%s*([kmgt]?b)")
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

local function extract_md5(row)
  local md5 = row:match("get%.php%?md5=(%x+)") or row:match("ads%.php%?md5=(%x+)")
  if md5 and #md5 == 32 then return md5:lower() end
  return nil
end

local function extract_direct_md5(row)
  local md5 = row:match("get%.php%?md5=(%x+)")
  if md5 and #md5 == 32 then return md5:lower() end
  return nil
end

local function extract_title(cell)
  local bpos = cell:find("</b>", 1, true)
  local scoped = cell
  if bpos then scoped = cell:sub(bpos + 4) end
  local title = scoped:match('edition%.php%?id=%d+"[^>]*>(.-)</a>')
  if not title then
    title = cell:match('edition%.php%?id=%d+"[^>]*>(.-)</a>')
  end
  if not title then title = scoped end
  return clean(title)
end

return {
  name = "libgen",
  label = "Library Genesis",
  supports_search = true,
  supports_rss = false,
  params = {
    { name = "url", label = "Base URL", type = "string", required = true, default = "https://libgen.li" },
  },

  search = function(self, criteria)
    local q = criteria.query
    if not q or q == "" then q = criteria.title end
    if not q or q == "" then return {} end

    local base = (self.url or ""):gsub("/+$", "")
    if base == "" then base = "https://libgen.li" end
    local search_url = base .. "/index.php?req=" .. host.url_encode(q)
    local body, err = host.http_get(search_url)
    if not body then return {}, err end

    body = body:gsub("[\r\n]+", " ")

    local results = {}
    local seen = {}

    for row in body:gmatch("<tr[^>]*>(.-)</tr>") do
      local md5 = extract_md5(row)
      if md5 and not seen[md5] then
        local tds = {}
        for td in row:gmatch("<td[^>]*>(.-)</td>") do
          tds[#tds + 1] = td
        end

        local titlecell = tds[1] or ""
        local author = clean(tds[2] or "")
        local title = extract_title(titlecell)

        local ext = ""
        if #tds >= 2 then
          ext = clean(tds[#tds - 1]):lower()
          if not ext:match("^[%a][%a%d]*$") then ext = "" end
        end

        local size = 0
        local sizetext = row:match('file%.php%?id=%d+"[^>]*>(.-)</a>')
        if sizetext then size = parse_size(clean(sizetext)) end

        if title == "" then title = md5 end
        if author ~= "" and not title:lower():find(author:lower(), 1, true) then
          title = author .. " - " .. title
        end
        if ext ~= "" then title = title .. " [" .. ext .. "]" end

        local edition_id = row:match("edition%.php%?id=(%d+)")
        local info = search_url
        if edition_id then info = base .. "/edition.php?id=" .. edition_id end

        local categories = nil
        if ext ~= "" then categories = { ext } end

        local download_url
        if extract_direct_md5(row) then
          download_url = base .. "/get.php?md5=" .. md5
        else
          download_url = base .. "/ads.php?md5=" .. md5
        end

        seen[md5] = true
        results[#results + 1] = {
          title = title,
          info_url = info,
          download_url = download_url,
          size = size,
          download_type = "Direct",
          categories = categories,
        }
      end
    end

    return results
  end,
}
