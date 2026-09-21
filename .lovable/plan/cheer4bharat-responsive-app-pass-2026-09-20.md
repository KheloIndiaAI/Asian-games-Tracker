# Cheer4Bharat responsive app pass

## Goal
Preserve the current phone experience below 600 px while adding tablet and desktop layouts, complete Cheer4Bharat metadata and brand assets, faster first paint, and the requested athlete result corrections. Existing ingest, scheduler, database, agent, voice-flag, and public data response shapes remain unchanged.

## Implementation

### 1. Shared responsive shell and accessibility
- Replace the fixed-width app wrapper with CSS-first phone, tablet, desktop, and wide layouts at 600, 1024, and 1440 px.
- Keep the existing phone header and bottom navigation unchanged; add a tablet top navigation and a 232 px desktop sidebar plus sticky content top bar. Both navigation variants render server-side and are shown only by CSS.
- Add active states to every navigation, a skip link, semantic header/nav/main landmarks, safe-area spacing, visible keyboard focus, touch sizing, hover styles only on hover-capable devices, and overflow safeguards.
- Make settings a bottom sheet on phones and an anchored panel from 600 px upward. Keep the future voice-enabled Ask Jeet desktop row and right-side voice panel behind the existing flag.
- Consolidate repeated dimensions, spacing, grids, typography, and responsive visibility into the existing Cheer4Bharat stylesheet without altering existing color/type tokens or phone styling.

### 2. Responsive screen layouts
- Today: retain the phone switch card; add desktop three-card Live/Next/Results layout and the 8/4 main/rail composition, with tablet supporting cards below in two columns.
- Schedule: retain phone/tablet rows; add the desktop table, wrapping filters, sticky table header, and all-day strip at larger widths.
- Sports and Search: add auto-fill sport tiles and desktop three-column search groups with constrained readable widths.
- Sport, Match, Medals, and Athlete: add the specified desktop column arrangements, desktop squad/filter treatment, expanded medal table, fixture cards, and responsive stat grids while retaining phone tabs and rows.
- Status: make existing cards and tables adapt cleanly without changing their content.
- Add shared row/card hover behavior and ensure deliberate rails are the only horizontally scrolling regions.

### 3. Metadata and brand assets
- Add a shared per-route metadata helper using `https://ag.ccki.in`, the supplied title/description/share image, full Open Graph/Twitter fields, and self-referencing canonical URLs.
- Update every content route to use unique route titles/descriptions without any Lovable wording or old deployment URLs; remove the root Twitter account tag.
- Create the 1200×630 branded share image, chakra favicon SVG/ICO, 180 px Apple icon, 192/512 manifest icons, and `site.webmanifest`; wire all icon, manifest, and light/dark theme-color links into the root head.
- Keep `robots.txt` unchanged because no sitemap currently exists.

### 4. Faster initial data and athlete corrections
- Add route loaders for Today and the current Schedule page that prefill the existing query cache during server rendering; retain existing live 30-second and normal 60-second refresh behavior.
- Keep the current client timezone preference behavior; the server-rendered preload uses the default India-time query, and other persisted timezone choices hydrate/fetch through their existing distinct cache key.
- Update athlete entry rows to prioritize a future “Next” line, show the latest finished result as a smaller “Last” line, and only show the result tag when there is no future item.
- Classify athlete results only when score, rank, mark, or outcome exists; move otherwise-empty future rows into Still to come and hide empty past rows.

### 5. Verification
- Run the TypeScript check and production build.
- Use browser checks at 320, 360, 390, 430, 600, 768, 1024, 1280, 1440, and 1920 px in light and dark themes, checking overflow, navigation visibility, active states, wrapping, sticky behavior, and representative screens.
- Confirm rendered metadata and public brand assets, and verify no user-facing metadata contains Lovable text.

## Technical notes
- No JavaScript viewport branching will control layout; responsive behavior uses CSS media queries only.
- Existing inline phone styles remain the base layer. New semantic class names and media-query overrides add larger-screen behavior, minimizing risk to the finished phone design.
- No public endpoint JSON fields will be changed; server-rendered loading only pre-populates existing query keys.
