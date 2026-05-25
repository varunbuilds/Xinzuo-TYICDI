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
