# TYICDI hiring task — submission notes

---

## Task 1 — Bundle Builder page

### What I picked

Fixing the **Bundle Builder** page (`/pages/bundle-builder`) so it renders the full bundle-builder experience (series tabs, product grid, tiered savings, sticky add-to-cart bar) instead of an empty default page.

### Why it's the highest-impact thing here

- The homepage and navigation link to **Build Your Knife Set** / bundle builder — a dead page is a direct conversion loss.
- The README calls this out as an intentional gap; the theme already ships the `bundle-builder` section, JavaScript, and `page.bundle-builder.json` template — only the **page → theme template** assignment in Shopify admin was missing.
- High visibility, clear before/after proof, and shows correct use of Shopify Online Store 2.0 page templates.

### What I did

1. Confirmed the page used **Default page** (`page.json` → title + empty `body_html`), so the bundle UI never loaded.
2. In Shopify admin: **Online Store → Pages → Bundle Builder → Theme template** → selected **bundle-builder** → **Save**.
3. Verified on the storefront: heading, series filter tabs (ALL, MO, LAN, etc.), product cards, and “Select at least 3 items to unlock your discount” messaging.

**Screenshots:** `before/task1.png` (default template / empty content) → `after/task1.png` (full bundle builder UI).

No theme Liquid/JS/CSS changes were required for this task — the implementation was already in the theme; the fix was wiring the correct page template in admin.

### What I'd do next

- Create **BUNDLE-10** and **BUNDLE-15** discount codes in Shopify admin (referenced in `page.bundle-builder.json`; cart drawer uses `/discount/{code}` at checkout).
- Test **Add Bundle to Cart** with 3+ selected knives and confirm cart drawer + checkout discount flow.
- **Task 2:** Replace hardcoded production engraving variant IDs in theme JS/Liquid with dynamic lookup from the `engraving-fee` product on the dev store.
- Continue: remove debug `console.log` / HTML comments, cart drawer edge cases, performance, SEO, accessibility.

---

## Task 2 — Engraving UI + cart fee

### What I picked

Fixing **product engraving** so the PDP toggle works reliably and the **engraving fee** is added to the cart with correct totals (matching xinzuo.com.au).

### Why it's the highest-impact thing here

- Engraving is a paid upsell on high-AOV knives; broken fee logic means lost revenue and incorrect checkout totals.
- The UI depended on `custom.knife_num` (missing on dev store broke JavaScript); add-to-cart used **production-only** variant IDs for the hidden `engraving-fee` product, so `/cart/add.js` for the fee silently failed on any cloned dev store.

### What I did

**Admin:**

1. Created product metafield definition **`custom.knife_num`** (integer, storefront API access on).
2. Set **`knife_num = 1`** on the test chef knife (One Line +$19; use piece count on knife sets).
3. Assigned the correct **product theme template** (e.g. `x05z-zhen-series`) so the engraving block appears.
4. Created the hidden **`engraving-fee`** product (not included in the slim seed’s ~40 products): handle **`engraving-fee`**, tag **`engraving-fee`**, option **Lines** with **One Line** ($19.00) and **Two Line** ($29.00), published to Online Store.

**Theme (code):**

1. `snippets/engraving-fee-config.liquid` — resolves **One Line** / **Two Line** variant IDs from `all_products['engraving-fee']` and exposes `window.getXinzuoEngravingFeeVariantIds()`.
2. `layout/theme.liquid` — loads that config on every page.
3. `assets/product-form.js` — adds fee using dynamic variant IDs; null-safe form/variant guards; removed debug `console.log`.
4. `assets/cart-engraving.js`, `assets/component-cart-items.js` — same dynamic IDs for cart drawer engraving + qty sync.
5. Cart Liquid (`cart-drawer`, `cart-summary`, `cart-products`, `cart-bubble`) — detect fee lines by **`item.product.handle == 'engraving-fee'`** instead of hardcoded production variant IDs.
6. `blocks/engraving-option.liquid` — `knife_num | default: 1` so JS never breaks when metafield is unset.
7. `blocks/buy-buttons.liquid`, `blocks/add-to-cart.liquid` — engraving product guard uses **handle**, not production product ID.
8. `assets/global.d.ts` — extended `Window` with engraving globals so TypeScript checks pass in the IDE.

**Debugging note:** Before the `engraving-fee` product existed, `window.getXinzuoEngravingFeeVariantIds()` returned `{ productId: 0, oneLine: null, twoLine: null }`, so add-to-cart skipped the fee line silently. After creating the product and refreshing the PDP, variant IDs resolved and the fee posted correctly.

**Verified on storefront (8" Chef Knife — Zhen Series, two-line engraving):**

- Cart line properties: Line 1 / Line 2 engraving text.
- **Engraving Fee — $29.00** in cart summary.
- Total **$428.95** ($399.95 knife + $29 fee), matching xinzuo.com.au.

**Screenshots:** `before/task2.png` (engraving UI missing or fee not in totals) → `after/task2.png` (two-line engraving + Engraving Fee in cart drawer).

### What I'd do next

- Re-test **one-line** engraving ($19 fee) and **cart quantity changes** (fee qty should stay in sync via `component-cart-items.js`).
- On future dev stores: ensure **`engraving-fee`** exists (slim seed omits it; full seed or manual admin create).

---

## Task 3 — Site-wide LCP image loading

### What I picked

Tightening **LCP image loading** across PDP, collection, and homepage templates: one purposeful preload per page type, no competing hero requests, and smaller payloads for non-main gallery images.

### Why it's the highest-impact thing here

- README calls out **Performance** and **image preloading** (homepage, PDP, collection) as easy Lighthouse wins.
- PDP had two competing preloads (832 + canceled 1920). Collection pages preloaded the **first grid card** while the real LCP is the **hero banner**. Homepage hero used `decoding="sync"` and oversized desktop preload hints.

### What I did

**PDP (`layout/theme.liquid`)**

1. Merged duplicate PDP preloads into **one** early `<head>` preload (`featured_image`, else first gallery media; srcset max 1200w).
2. Removed the second preload block that ran after fonts.

**Collection (`layout/theme.liquid` + `sections/collection-hero-banner.liquid`)**

3. Preload **collection hero** (`custom.main_image` or `collection.image`) instead of the first product card when a hero exists; keep card preload only as fallback.
4. Hero `<img>`: default `src` at 1200w (srcset still serves 1920w on large screens), `decoding="async"`.

**Homepage (`sections/cw-hero.liquid`)**

5. Desktop hero preload `href` at 1200w (removed 2560w from preload srcset).
6. Hero `<img>`: `decoding="async"`, default `src` 1200w, trimmed oversized srcset entries.

**PDP gallery (`snippets/product-media.liquid`)**

7. Main slide: max width **1920** (zoom/LCP). Additional slides: max **1200** with a smaller srcset so off-screen gallery images don’t pull 3840px assets.

**Verified**

- PDP Network (Img): single hero preload at 832, **no canceled 1920** row (`after/task3.png`).

**Screenshots**

- `before/task3.png` → `after/task3.png` (PDP Network Img)

No admin changes.

### What I'd do next

- **Task 5+:** Navbar/header, collection filters, accessibility, SEO structured data.
- **Separate track:** Shoplift snippet guard when app metafields are missing.
- **Near finish:** debug cleanup (`sticky-add-to-cart.js`, `custom.js`, `cart-smart-recommendations.liquid`).

---

## Task 4 — Cart drawer responsiveness & empty state

### What I picked

Fixing **laggy cart drawer updates** (qty +/-, remove) and the **delayed empty-cart UI** after removing the last item.

### Why it's the highest-impact thing here

- README calls out cart drawer UX (qty, remove, empty state). After engraving (Task 2), the drawer is a core checkout path.
- Removing an item animated rows out immediately but left **footer, totals, and shipping bar** visible until a second API round-trip finished (~1–2s), then morphed to empty — felt broken.
- `cart-drawer--empty` on `<dialog>` was only set on full page load, so AJAX empty state missed centered layout CSS.

### What I did

1. **`assets/component-cart-items.js`**
   - Removed **optimistic row removal animation** before the cart API completes; section morph now drives the UI in one step.
   - **Optimistic empty class** when removing the last visible line; **`#syncCartDrawerEmptyState`** after every cart morph.
   - Reduced qty change debounce **300ms → 100ms**.
   - Centralized **`#applyCartSectionUpdate`** (morph + event + empty sync).
   - Bundle remove: skip pre-API row animation (same stale-footer issue).

2. **`assets/cart-drawer.js`** — listen for `cart:update` and toggle **`cart-drawer--empty`** on the dialog.

3. **`snippets/cart-drawer.liquid`** — recommended-product add requests **section HTML** in `/cart/add.js` (avoids slow full `sectionRenderer` refetch).

4. **Performance follow-up (laggy qty still reported):**
   - **Single `/cart/update.js`** for qty/remove when line `data-key` is present — updates the knife line **and** engraving fee variant qty together (removes the extra ~1s second round-trip after `/cart/change.js`).
   - **`snippets/cart-products.liquid`** — `data-has-engraving`, `data-engraving-two-line`, `data-knife-num` on rows for client-side fee math.
   - Removed **100ms debounce** on cart qty events (immediate +/- response).
   - **Cart recommendations Swiper** — debounced one reinit on `cart:update` instead of 3× `setTimeout` + morph `MutationObserver` reinits.

**Screenshots:** `before/task4.png` → `after/task4.png` (cart drawer: engraved item with fee line + totals; qty/remove/empty-state fixes verified on store).

**Also fixed:** Continue shopping in empty cart → `/collections/all-products` (same as homepage SHOP ALL). Theme setting default stays `/collections/all` (required by Shopify schema); Liquid remaps that legacy URL to `collections['all-products']`.

---

## Task 5 — Header responsiveness (mobile / tablet)

### What I picked

Fixing **header layout and navigation** at tablet and mobile widths: remove the white horizontal menu strip, center the logo, align hamburger + search on the left with account/cart on the right, restore desktop + drawer menu links, and unify mega-menu overlay cards (Series / Type / Accessories) — matching xinzuo.com.au while keeping desktop (logo left, nav center) intact.

### Why it's the highest-impact thing here

- README calls out **navbar / header**; broken breakpoints were visible on every page after wiring the main menu in admin.
- Theme Editor **Logo → Center** had no effect because `site-overrides.css` hid any logo in the center column.
- Between **750px–1280px**, the desktop `<header-menu>` wrapper could leave a **second-row white bar** (`scheme-1` background) when only the inner `nav` was hidden.
- `{% render 'header-menu' %}` did not pass `menu` / `block` into the snippet, so `home-menu-ul` rendered **empty** on desktop and the hamburger drawer showed only Reviews / Contact.
- Accessories overlay cards used mixed tile styles and legacy dropdown CSS, so image/title areas were uneven compared with Shop by Series.

### What I did

**Layout (`assets/site-overrides.css`, `sections/header.liquid`):**
- Removed `display: none` on center-column logo (was blocking Theme Editor “Center”).
- Added ≤1280px grid helpers for `.header-logo` and `.header__drawer` (logo centered, burger + search on the left).
- Scoped legacy `.header-dropdown > ul > li` rules to `:not(.xz-mega-series-list)` so they do not fight the mega-menu grid.

**Menu links (`blocks/_header-menu.liquid`, `snippets/header-menu.liquid`, `snippets/header-drawer.liquid`):**
- Pass `block`, `section`, and `menu: block.settings.menu` from the header block into `header-menu` / drawer snippets (`{% render %}` does not inherit `block`).
- Fallback chain: passed menu → `block.settings.menu` → `linklists['main-menu-restructured']` → `main-menu`.
- Desktop nav at **>1280px**; hamburger drawer at **≤1280px** (unchanged breakpoint from task 4).

**Mega-menu overlays (Series / Type / Accessories):**
- All three use **`xz-series-tile`** with the same image resolution (`custom.main_image` → featured → first product image).
- Removed **FROM: $X** price line from Shop by Type overlay (was `xz-type-tile`).
- **`assets/site-overrides.css` + `snippets/header-menu.liquid`:** equal grid columns (`minmax(0, 1fr)`), square image (`aspect-ratio: 1 / 1`, `object-fit: cover`), fixed title strip height (`5.5rem`), `align-items: stretch` so every card is the same size.

**`assets/header-menu.js`:**
- File was truncated (no `HeaderMenu` class) — restored minimal component: registers `<header-menu>`, lazy image preload, Horizon-compatible `activate` / `deactivate`. Xinzuo dropdowns still use `openMenu` / `closeMenu` in `snippets/header-menu.liquid`.

**Theme Editor:** Logo **Left**, Menu **Center**, menu **`main-menu-restructured`**.

**Verified on storefront:**
- Desktop: 5 nav links (Shop by Series, Shop by Type, Accessories, Top Picks, Knife Sets).
- Tablet/mobile: same links in hamburger; logo centered; no white link strip.
- Overlays: consistent card geometry across Series, Type, and Accessories.

**Screenshots:** `before/task5.png` → `after/task5.png` (tablet white strip + empty/broken nav → compact header + working menus + uniform overlay cards).

### What I'd do next

- **Separate track:** Shoplift snippet guard when app metafields are missing.
- **Near finish:** debug cleanup (`sticky-add-to-cart.js`, `custom.js`, etc.).

---

## Task 6 — Collection filters (`/collections/all-products`)

### What I picked

Improving **custom collection filters** on the shop-all page: clear feedback when filters match nothing, reliable mobile drawer sync, and a visible product count — so filtering feels intentional instead of broken.

### Why it's the highest-impact thing here

- `/collections/all-products` is the main browse path after homepage and header nav (`?filter=knives` / `?filter=accessories` from the menu).
- README calls out **filter UX, mobile layout, empty states** on the collection page.
- Client-side filters (`custom-collection-filters.liquid`) could hide every product with **no message**, and the mobile drawer synced checkboxes **by index** (wrong when section order differed).

### What I did

**Empty state (`sections/main-collection.liquid`):**
- Added `#collection-filter-empty` (reuses `.main-collection-grid__empty` styles) with **Clear all filters** action.
- Shown when active filters match **zero** products; hides the product grid and load-more.

**Product count (`sections/main-collection.liquid` + `snippets/custom-collection-filters.liquid`):**
- Added `#collection-results-count` with `aria-live="polite"`.
- Updates on filter/sort: e.g. `12 items` or `3 items match your filters`.

**Filter logic (`snippets/custom-collection-filters.liquid`):**
- `updateFilteredEmptyState()` after `applyFilters()`.
- `syncAllFilterCheckboxes()` matches by `data-filter-type` + `data-filter-value` (not DOM index).
- Mobile **Clear All** clears drawer + desktop, runs `applyFilters()`, updates badge.
- Desktop **Clear All** also syncs mobile clones.
- URL `?filter=knives` / `?filter=accessories` unchanged (already mapped to Category checkboxes).

**Verified on storefront:**
- Desktop: checkbox filters apply; count updates; zero results shows empty message.
- Mobile: drawer Apply/Clear sync correctly with sidebar.
- Header “VIEW ALL KNIVES” → `/collections/all-products?filter=knives` pre-checks filters.

### What I'd do next

- **Shoplift snippet guard** when app metafields are missing.
- **Accessibility:** focus trap in mobile filter drawer, keyboard apply.
- **SEO / structured data** on PDP and collection pages.
- **Debug cleanup** (`console.log` in cart/theme JS).

---

## Task 7 — Homepage/header + CTA polish

### What I picked

Finalizing **homepage/header behavior + CTA consistency** to match the target visual spec: transparent homepage header at top, black-on-scroll behavior, and corrected button states across PDP, product cards, and cart drawer.

### Why it's the highest-impact thing here

- Header and CTAs are visible on every key conversion path (homepage → collection → PDP → cart).
- Task 7 combined brand consistency work and functional polish (scroll behavior + button state feedback).
- Several regressions surfaced while iterating (sticky bar syntax, conflicting button selectors), so this pass focused on stable end-state behavior.

### What I did

**Homepage / header behavior**

1. Homepage header remains transparent at top and turns black after scroll threshold.
2. Added smoother transition (non-instant switch) for scrolled state.
3. Added directional-aware header show/hide using GSAP + ScrollTrigger (hide on down-scroll, show on up-scroll).
4. Kept non-homepage headers solid dark.

**PDP / collection / cart CTA styling**

5. PDP add-to-cart default changed to white background with dark text/icon.
6. PDP add-to-cart hover updated to no-fill + white text/icon as requested.
7. Product-grid card add-to-cart loading/added states changed to white (instead of red).
8. Cart drawer **Secure Checkout** switched to payment-like green default with slightly darker hover/active.
9. Cart drawer recommendations (“You might also like”) add button restored to its local style and set to white default; “Adding...” also kept white.

**PDP support content**

10. Payment method icons placed between detail icons and DESCRIPTION area on PDP.

**Stability fix**

11. Fixed Liquid error in `blocks/sticky-add-to-cart-bar.liquid` by moving `{% stylesheet %}` outside conditional block; sticky bar remains disabled as requested.

**Files touched in this task window**

- `assets/site-overrides.css`
- `assets/header.js`
- `layout/theme.liquid`
- `assets/xinzuo-buttons.css`
- `snippets/cart-recommended-products.liquid`
- `blocks/payment-icons.liquid`
- `blocks/_product-details.liquid`
- `blocks/sticky-add-to-cart-bar.liquid`

**Screenshots:** `before/task7.png` → `after/task7.png`

### What I'd do next

- Run one final breakpoint QA sweep (mobile/tablet/desktop) for header + button states.
- Remove/trim any temporary stylistic overlap in `xinzuo-buttons.css` once UI is locked.
- Optional: move GSAP/ScrollTrigger to theme assets for tighter control/version pinning.

---

## Task 8 — Section stability + lint cleanup

### What I picked

Fixing remaining **theme-check blockers/warnings** that could hurt reviewer confidence: invalid section schema JSON, broken quick-question modal handlers, and missing image dimensions warnings.

### Why it's the highest-impact thing here

- Invalid section schema JSON can break Theme Editor parsing and is an immediate quality red flag in a hiring submission.
- Runtime `ReferenceError` in a customer-facing section (“Quick Question”) is a visible functional defect.
- Clearing lint noise makes the final submission look deliberate and production-minded, even in challenge scope.

### What I did

1. Fixed invalid schema JSON (trailing commas) in:
   - `sections/series-comparison.liquid`
   - `sections/product-info6.liquid`
   - `sections/product-info7.liquid`

2. Fixed quick-question modal runtime handlers in `sections/quick-question.liquid`:
   - Exposed `openModal`, `closeModal`, `nextModal` to `window` so inline `onclick` calls resolve.
   - Added null-safety checks for modal/step nodes.

3. Resolved image width/height lint errors by replacing raw `<img>` with Shopify `image_tag`:
   - `sections/product-info6.liquid` (left/right images)
   - `sections/product-info7.liquid` (main image)

4. Resolved remaining class-scope warnings in `sections/series-comparison.liquid` by scoping class names:
   - `rating-text` → `series-rating-text`
   - `afterpay-text` → `series-afterpay-text`
   - `afterpay-logo` → `series-afterpay-logo`
   - Updated both CSS and corresponding markup.

### Verification

- Re-ran lints on touched files and full workspace.
- Result: **no linter warnings/errors** remaining in workspace diagnostics.

### What I'd do next

- Keep section-level class naming convention strict (prefix with section/component namespace) to prevent future scope warnings.
- Continue challenge submission prep (final screenshot audit + concise changelog quality pass).
