# Paper UI redesign plan

Turn ReadingRoom's dark utility UI into a **paper-like editorial interface** — the app
should feel like a printed catalog/index of a private library rather than a dashboard.

Sources (screenshots of the live sites are in `references/designs/ref-*.webp`; the
`vintage-*.webp` / `wine-*.webp` mockups are there too):

| Reference | What it nails |
| --- | --- |
| The Wordsmith mockup (`vintage-editorial-copywriter-website.webp`) | Cream paper + near-black ink, Didone display serif, numbered sections ("SERVICE 01"), boxed hairline cards, inverted dark panels, drop caps |
| Travel journal mockup (`vintage-travel-journal-phone.webp`) | Warm blush paper, terracotta accent, pill chips with filled-active state, dashed inputs, scrapbook framing of images |
| Wine Story mockup (`wine-testing-landing-page.webp`) | Kraft paper texture, ultra-light fashion display type, vertical column dividers, circular outline buttons |
| [Base Off Mute](https://offmute.basedesign.com/) (`ref-offmute.webp`) | Content-as-print-index: full-width rows split by hairlines into metadata columns (no · title · people · duration), circled-initial avatars, muted gray for not-yet items |
| [GT Mechanik](https://gt-mechanik.com/) (`ref-gtmechanik.webp`) | Type-specimen confidence: viewport-filling display type, technical diagram boxes, mono micro-labels |
| [Throxy](https://throxy.com/) (`ref-throxy.webp`) | Warm cream SaaS page: grotesque headings, mono eyebrow labels, ruled calendar grid with pastel cell fills, boxed logo strip, dark pill CTA |
| [Lapham's Quarterly](https://laphamsquarterly.substack.com/) (`ref-lapham.webp`) | Centered red serif masthead, three-column editorial grid with hairline dividers, serif headlines, small-caps date/author lines, engravings carry the color |

---

## 1. Design principles (distilled)

1. **Paper and ink, not chrome.** Light warm surfaces, near-black text. Structure comes
   from hairline rules and whitespace — never shadows or filled panels-for-depth.
2. **Typography is the interface.** One expressive display serif used at confident
   sizes (mastheads, page titles, empty states); everything else quiet. Metadata set in
   letterspaced small caps / mono.
3. **Content reads as a printed document**: numbered sections, ruled tables, catalog
   entries. A book row should look like an index line, not a card.
4. **One accent, spent sparingly.** Covers/artwork provide the color; the UI stays
   monochrome + single accent until status semantics demand otherwise (muted green/
   ruby/amber only for test/connection states).
5. **Square-ish and flat.** Radii ≤ 6px, zero shadows, 1px rules. Texture (paper grain)
   optional and subtle if used at all.

## 2. Design tokens

Defined once as Tailwind v4 `@theme` tokens in `src/index.css`; utilities
(`bg-paper-*`, `text-ink-*`, `font-display`, …) generate from them.

### Color

```css
@theme {
	--color-paper-50: #fbf8f1; /* app background */
	--color-paper-100: #f5f0e6; /* raised surface / cards */
	--color-paper-200: #ece5d6; /* inset wells, hover wash */
	--color-rule: #ddd4c2; /* hairlines/borders */
	--color-ink-900: #211d17; /* primary text */
	--color-ink-700: #4a443b; /* body text */
	--color-ink-500: #857c6d; /* metadata/muted */
	--color-accent: #9f3b3b; /* oxblood red (Lapham's masthead); alt: terracotta #b4552d */
	--color-accent-wash: #9f3b3b14; /* 8% tint for active fills */
	/* status, desaturated to sit on paper */
	--color-good: #4a7c59;
	--color-bad: #a03d3d;
	--color-pending: #b08a3e;
}
```

### Type

Self-hosted via Fontsource (no CDN — this is a self-hosted app):

```bash
pnpm add -D @fontsource-variable/newsreader @fontsource/ibm-plex-mono
```

- **Display/headings:** `Newsreader` (variable, optical sizes; editorial without being
  costumey). Weights 400–600; masthead moments at 500 with tight tracking.
- **UI/body:** system sans stack stays (data-dense screens read better); long-form copy
  (descriptions, author bios) gets `font-display` at text-lg.
- **Metadata/labels:** `IBM Plex Mono` 400/500, uppercase, tracking-widest, 11–12px —
  the "EP 01 / 21 MINS" column voice from Base Off Mute and Throxy's eyebrows.

### Space & shape

- Radius scale → `rounded-sm` (2px) default, `rounded` (4px) max; nothing rounder.
- No shadow utilities anywhere; elevation = `border-rule` + surface shift
  (paper-50 → paper-100).
- Hairline = `border border-rule`; section headers get double-weight top rules
  (`border-t-2 border-t-ink-900`) like newspaper section slugs.

## 3. Implementation strategy

Tailwind v4's CSS-first config makes this incremental instead of big-bang:

1. **Tokens land first, nothing else changes.** Old `gray-*`/`indigo-*` classes keep
   working while areas migrate one commit at a time.
2. **Shared primitives before pages.** Stand up the UI kit (§4) so pages stop
   hand-rolling classes; page-specific compositions (`RuledTable` conventions,
   `Masthead` title blocks) layer on top of it.
3. **Class sweep order** mirrors surface priority (phases below); each phase ends
   deployable with `vp check`/`vp test`/`vp build` green and a Helium screenshot
   compared against the reference board.
4. **Dark mode:** cut over light-only. Tokens make a dark variant cheap later
   (`prefers-color-scheme` swap of the same token names) — decide after living in it.

## 4. Shared UI kit (`src/components/ui`)

shadcn-style: **vendor component source into the repo** rather than depend on a styled
library. Behavior comes from headless primitives, styling from our paper tokens — so
every page gets identical surfaces for free and restyling happens in one place.

- **Headless layer:** [`@kobalte/core`](https://kobalte.dev/) — the Solid port of Radix
  (the primitives shadcn/ui builds on). Gives accessible focus management, ARIA, and
  keyboard behavior for everything interactive.
- **Variant styling:** `class-variance-authority` (same helper shadcn uses) to express
  button/badge variants against tokens.
- **Prior art to crib API shapes from:** `solid-ui` / `shadcn-solid` (Kobalte + Tailwind
  ports of shadcn) — copy patterns where handy, depend on nothing.

Inventory (build as pages need them; nothing speculative):

| Component | Based on | Notes |
| --- | --- | --- |
| `Card` | — | The Panel primitive: paper-100, border-rule, rounded-sm |
| `Button` | Kobalte `Button` | Variants: solid (ink bg), outline, ghost (small-caps text link); sizes sm/md |
| `TextField` | Kobalte `TextField` | Composed Label/Input/Description/Error; paper well + bottom-rule focus |
| `TextArea` | Kobalte `TextField` | Long-form (descriptions, format strings) |
| `Select` | Kobalte `Select` | Implementation pickers, per-page counts |
| `Checkbox` / `Switch` | Kobalte | Enable toggles; switch for settings |
| `Label`, `Eyebrow`, `Separator` | — | Mono small-caps label; hairline rule |
| `Badge` | — | Small-caps status chip with leading dot |
| `Dialog` / `AlertDialog` | Kobalte | Paper sheet, heavy top rule; AlertDialog for confirm-discard etc. |
| `DropdownMenu` | Kobalte | Row action menus if clusters outgrow text buttons |
| `Tabs` | Kobalte | Settings navigation, horizontal fallback |
| `Tooltip` | Kobalte | Icon-button affordances |
| `Toast` / `Toaster` | Kobalte `ToastRegion` | actionError/success notices replace inline-only error paragraphs |
| `Progress` | Kobalte | Download/queue progress bars |

Rules of engagement: `ui/*` components consume **tokens only** (no raw grays/indigo),
pages compose them instead of hand-rolling class strings, and interactive primitives get
a smoke test when introduced. Existing bespoke components (`IndexerCard`,
`ClientCard`, …) migrate to compose these during their phase.

## 5. Component mapping (current → new)

| Current | Becomes |
| --- | --- |
| Topbar nav (dark, indigo active) | Masthead strip: centered serif wordmark (Lapham's), nav as small-caps links with 2px ink underline on active |
| `bg-gray-900 rounded-lg border-gray-800` panels | `Card`: paper-100, border-rule, rounded-sm |
| Section titles `text-lg font-semibold` | Eyebrow (mono caps) + display serif title pair, top-ruled |
| BookCard/BookRow grid | Catalog entries: cover left, hairline-separated meta columns (title serif / author small-cap / status line), hover wash paper-200; covers carry the color |
| StatusBadge pills | Small-caps text with leading dot (`● Reading`), status colors above |
| Primary buttons (indigo fills) | Ink-solid button (throxy CTA): ink-900 bg, paper text, pill or 2px radius |
| Secondary buttons | Outline on paper (border-ink-900) or underline links with arrow → |
| Icon buttons (Test/Edit/Remove clusters) | Small-caps text buttons separated by hairline verticals |
| Inputs | Paper-200 wells with bottom rule focus (`focus:border-ink-900`), mono placeholder |
| Search/add wizard panel | Dashed-rule container (journal mockup) with ruled results table inside |
| Queue/activity tables | Base Off Mute index rows: hairline-divided full-width rows, metadata columns, muted styling for done/failed |
| Empty states ("No books tracked yet") | Specimen moment: oversized display serif line + eyebrow, centered, lots of air |
| Settings tabs | Left rail as table-of-contents: numbered entries (01 Library…), active = ink underline |

## 6. Page-by-page treatment

- **Home/dashboard** — continue-watching style "On the bench" queue as ruled index rows;
  recent activity as dated list (small-caps dates like Lapham's).
- **Books index** — toolbar becomes a catalog control strip (count in small caps,
  view toggle as text links). Grid keeps covers-forward (Lapham's engraving columns);
  list view becomes pure index rows.
- **Book detail** — masthead title + small-caps author link; cover framed like a plate
  (thin border, generous margin); info as definition list with hairline row rules;
  interactive search results as ruled table with score in mono.
- **Authors** — bio page sets `font-display` for the biography itself (long-form serif);
  book lists as index rows with Add affordances right-aligned.
- **Queue / Wanted / Calendar / Activity** — the strongest fit for the print-index look;
  calendar adopts throxy's ruled grid with pastel accent-wash cells for states.
- **Settings suite** — TOC rail + paper panels; forms unchanged structurally, restyled
  per component mapping.
- **Login** — masthead-centered single column, boxed form, feels like a bookplate.

## 7. Phases (each independently shippable)

0. **Foundations** — fonts installed, `@theme` tokens, base CSS (selection color, focus
   rings → 2px ink outline-offset), and the UI kit stood up: `@kobalte/core` +
   `class-variance-authority` installed, `src/components/ui/` seeded with `Card`,
   `Button`, `TextField`, `Eyebrow`, `Badge`. App still dark.
1. **Shell + login** — Layout masthead/nav swap; whole app flips to paper background.
   This is the visual cutover commit.
2. **Books area** — index, detail, cards (highest-traffic surfaces).
3. **Home + authors** — dashboard rows, author grid + bio typography.
4. **Queue/wanted/calendar/activity** — index-table treatment.
5. **Settings suite** — TOC rail, nine tab bodies restyled.
6. **Polish** — paper texture decision, empty-state specimens, transition details,
   delete leftover dark palette utilities; final screenshot pass against references.

Each phase: `vp check && vp test && vp build` green + Helium screenshots of its pages.

## 8. Open decisions

- **Accent**: oxblood red (literary, matches Lapham's) vs terracotta (warmer, matches
  journal mockup). Plan assumes oxblood; trivially swappable via `--color-accent`.
- **Paper texture**: kraft-grain background (Wine Story) adds warmth but risks noise
  behind dense tables; defer to phase 6 behind a `body::before` overlay so it's a
  one-line removal.
- **Script/handwritten accents** (journal mockup's "Field Notes"): likely skip — reads
  hobbyist next to the otherwise print-serious language; revisit for quotes only.
- **Display font weight budget**: Newsreader variable keeps us to one file; if the
  masthead needs more contrast later, swap to Playfair Display for masthead-only use.

## 9. Verification

- Per phase: `vp check`, `vp test`, `vp build`; then `nix run .#` and screenshot every
  touched route with the CDP harness (`/tmp/nix-shell.s3gyIy/opencode/cdp-shot.mjs`)
  at 1440×1000 alongside the reference shots in this doc.
- Contrast spot-checks: ink-700 on paper-50 ≥ 7:1, ink-500 metadata ≥ 4.5:1, accent
  only on paper backgrounds at ≥ 4.5:1 for text usage.
