-- AudioBookBay plugin indexer (audiobook torrents).
-- Search results are HTML; each result's detail page carries the torrent info
-- hash, which we turn into a magnet link. The site requires a `Referer` header
-- (without it the search redirects to the home page).

-- Fetching every result's detail page is slow, so cap how many we resolve.
local MAX_DETAIL_FETCHES = 8

local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function clean(s)
  if not s then return "" end
  s = s:gsub("<[^>]*>", " ")
  s = s:gsub("&quot;", '"')
  s = s:gsub("&#39;", "'")
  s = s:gsub("&apos;", "'")
  s = s:gsub("&lt;", "<")
  s = s:gsub("&gt;", ">")
  s = s:gsub("&nbsp;", " ")
  s = s:gsub("&amp;", "&")
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

return {
  name = "audiobookbay",
  label = "AudioBookBay",
  supports_search = true,
  supports_rss = false,
  media = { "audiobook" },
  params = {
    { name = "url", label = "Base URL", type = "string", required = true, default = "https://audiobookbay.lu" },
  },

  search = function(self, criteria)
    local q = criteria.query
    if not q or q == "" then q = criteria.title end
    if not q or q == "" then return {} end
    -- AudioBookBay's search is case-sensitive and only matches lowercase.
    q = q:lower()

    local base = (self.url or ""):gsub("/+$", "")
    if base == "" then base = "https://audiobookbay.lu" end
    local referer = base .. "/"

    -- Warm up the session: AudioBookBay sets a cookie on the home page that the
    -- search requires (the host client keeps a cookie store).
    host.http_get(referer, { ["Referer"] = referer })

    local body, err = host.http_get(base .. "/?s=" .. host.url_encode(q), { ["Referer"] = referer })
    if not body then return {}, err end
    body = body:gsub("[\r\n]+", " ")

    local results = {}
    local seen = {}
    local fetched = 0

    -- <div class="postTitle"><h2><a href="/abss/<slug>/" rel="bookmark">Title</a>
    for href, raw_title in body:gmatch(
      '<div class="postTitle">%s*<h2>%s*<a%s+href="([^"]+)"[^>]*>(.-)</a>'
    ) do
      if href:find("/abss/", 1, true) and not seen[href] then
        seen[href] = true
        local title = clean(raw_title)
        local info_url = href
        if not info_url:find("^https?://") then info_url = base .. info_url end

        local download_url = nil
        local size = 0
        if fetched < MAX_DETAIL_FETCHES then
          fetched = fetched + 1
          local detail = host.http_get(info_url, { ["Referer"] = referer })
          if detail then
            detail = detail:gsub("[\r\n]+", " ")
            local hash = detail:match("Info Hash:.-<td>([a-fA-F0-9]+)")
            if hash and #hash == 40 then
              download_url = "magnet:?xt=urn:btih:"
                .. hash:lower()
                .. "&dn="
                .. host.url_encode(title)
            end
            local sz = detail:match("File Size:.-<td>([^<]+)")
            if sz then size = parse_size(clean(sz)) end
          end
        end

        if download_url then
          results[#results + 1] = {
            title = title,
            info_url = info_url,
            download_url = download_url,
            size = size,
            download_type = "Magnet",
            categories = { "audiobook" },
          }
        end
      end
    end

    return results
  end,
}
