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

- **Task 4 (README — Cart drawer):** qty/remove/empty state, mobile, engraving fee sync edge cases.
- **Task 5+:** Navbar/header, collection filters, accessibility, SEO structured data.
- **Separate track:** Shoplift snippet guard when app metafields are missing.
- **Near finish:** debug cleanup (`sticky-add-to-cart.js`, `custom.js`, `cart-smart-recommendations.liquid`).
