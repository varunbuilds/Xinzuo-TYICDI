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

**Admin (you):**

1. Created product metafield definition **`custom.knife_num`** (integer, storefront API access on).
2. Set **`knife_num = 1`** on the test chef knife (One Line +$19; use piece count on knife sets).
3. Assigned the correct **product theme template** (e.g. `x05z-zhen-series`) so the engraving block appears.

**Theme (code):**

1. `snippets/engraving-fee-config.liquid` — resolves **One Line** / **Two Line** variant IDs from `all_products['engraving-fee']` and exposes `window.getXinzuoEngravingFeeVariantIds()`.
2. `layout/theme.liquid` — loads that config on every page.
3. `assets/product-form.js` — adds fee using dynamic variant IDs (removed debug `console.log`).
4. `assets/cart-engraving.js`, `assets/component-cart-items.js` — same dynamic IDs for cart drawer engraving + qty sync.
5. Cart Liquid (`cart-drawer`, `cart-summary`, `cart-products`, `cart-bubble`) — detect fee lines by **`item.product.handle == 'engraving-fee'`** instead of hardcoded variant IDs.
6. `blocks/engraving-option.liquid` — `knife_num | default: 1` so JS never breaks when metafield is unset.
7. `blocks/buy-buttons.liquid`, `blocks/add-to-cart.liquid` — engraving product guard uses **handle**, not production product ID.

**Screenshots:** `before/task2.png` (or metafield before) → `after/task2.png` (fee line + Engraving Fee in totals).

### What I'd do next

- Confirm **Products → Engraving Fee** exists with **One Line** ($19) and **Two Line** ($29) variants.
- Re-test two-line engraving and cart qty changes (fee should stay in sync).
- Task 3: remove remaining debug noise (`custom.js`, cart recommendations HTML comment).
- Task 4+: Shoplift guard, performance, SEO, accessibility.
