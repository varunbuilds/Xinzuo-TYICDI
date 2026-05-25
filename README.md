# Xinzuo Shopify clone — TYICDI hiring task

A sanitised, single-command clone of [xinzuo.com.au](https://xinzuo.com.au) running on your **own** free Shopify dev store: real Liquid theme, ~50 sample products (the ones the homepage actually references, plus backfill), 68 collections, 17 pages, 5 articles, and 162 optimised images. Your 2-hour timed window starts when you tick the commit gate on the [hiring portal](https://apply.toldyouicoulddoit.com). Setup below does **not** count against the timer — do it ahead of time.

**Measured script time: under 5 minutes** (plus 10–15 min for first-time Shopify Partners signup if you've never used it — that part is one-time).

---

## Setup — copy and paste, top to bottom

### A. One-time Shopify side (10–15 min if you've never done this)

1. **Create a Shopify Partner account** → <https://www.shopify.com/partners/signup> (free, no card, instant)
2. **Make a development store**: Partner dashboard → **Stores** → **Add store** → **Create development store** → pick **"Create a store to test and build"** → any name will do.
3. **Generate an Admin API token** inside that new dev store:
   1. Open the dev store admin (**View store** button on the Partner dashboard, then **Online Store**)
   2. **Settings → Apps and sales channels → Develop apps** → **Allow custom app development** (confirm)
   3. **Create an app** → name it `seed` (anything works)
   4. **Configure Admin API scopes** → tick exactly these (and nothing else):
      - `read_products`, `write_products`
      - `read_themes`, `write_themes`
      - `read_content`, `write_content`
   5. **Save** → **Install app** → **Reveal token once** → copy the value starting `shpat_…` (you will only see it once — paste it somewhere safe immediately).
4. Note your store URL — it ends in `.myshopify.com` (visible in the admin URL bar).

### B. Every-time setup (~5 min of script time)

> Prerequisites: Node 18+ and git already installed.

```bash
# 1. Clone (4s)
git clone https://github.com/dintyo/xinzuo-theme-snapshot.git
cd xinzuo-theme-snapshot

# 2. Copy the env template
#    macOS / Linux / Git Bash:
cp .env.example .env
#    Windows cmd / PowerShell (run from the repo root):
#    copy .env.example .env
#
#    Then open .env in any text editor and replace the two placeholder values
#    with your store URL and token. Save as plain UTF-8 (no BOM) if on Windows.

# 3. Run it (~4.5 min)
node scripts/setup.mjs --write
```

### C. View your store

When the script finishes it prints `Visit your store: https://your-store.myshopify.com`. Open that — you'll hit a password page (Shopify default for unopened dev stores). The password is shown in your admin under **Online Store → Preferences → "Restrict access" / Password page**, or just disable the toggle to skip it entirely.

---

## The task — pick the ONE highest-impact thing you'd fix

The clone is intentionally imperfect — it mirrors a real production-shaped store with real production-shaped issues. **Find the thing you'd ship if you owned this codebase**, then ship it.

> The point isn't to fix everything. It's to demonstrate your eye for **what matters** and your ability to **execute cleanly under time pressure**.

### Some places worth looking (not a checklist — pick what you think is highest impact)

- **Bundle Builder** is currently a dead page (`/pages/bundle-builder`). The live one at <https://xinzuo.com.au/pages/bundle-builder> shows what it should look like — tabbed series selector, sticky cart, tiered discounts. Could you rebuild it? Or improve on it?
- **Performance**: Lighthouse the homepage and a PDP. Big easy wins around image preloading, render-blocking JS, the Swiper carousels, font loading.
- **Cart drawer**: open it, add a product, remove one, change qty. Is the UX clean? Mobile? Edge cases (empty state, qty=0)?
- **Navbar / header**: mobile menu behaviour, focus traps, dropdown delays, sticky behaviour on scroll.
- **PDP** (`/products/zhen-xz05-series-8-inch-chef-knife` is a good one): variant selector logic, gallery thumbnails, schema markup, "Add to cart" feedback.
- **Collection page** (`/collections/all`): filter UX, sort options, mobile layout, empty states, perceived speed.
- **Accessibility**: keyboard nav, screen-reader labels, contrast on the dark theme, focus rings.
- **SEO / structured data**: missing schemas, broken canonicals, meta titles, OG images.
- **Conversion**: trust signals, social proof placement, urgency, abandoned-cart hooks.
- **Anywhere else you spot a real issue** — copy, alignment, broken images, dead links, a typo in the FAQ, anything.

### What to submit

A **public** GitHub repo with **at least 3 commits inside your 2-hour window**, containing:

1. Your fix — edited Liquid/CSS/JS in the original paths (so we can diff cleanly against this repo)
2. `before.png` — screenshot of the issue
3. `after.png` — screenshot of your fix
4. `NOTE.md` — markdown with these headings:
   ```markdown
   ## What I picked
   ## Why it's the highest-impact thing here
   ## What I did
   ## What I'd do next
   ```
5. Loom URL (max 3 min, face + screen, walking through the change) in your repo's `README.md`

Submit your repo + Loom + `NOTE.md` summary on the [hiring portal](https://apply.toldyouicoulddoit.com).

---

## Script options

```bash
# Default — slim seed (~50 products biased to what the theme references + all media), ~4.5 min
node scripts/setup.mjs --write

# Full catalogue — 237 products + 77 articles, ~10 min
node scripts/setup.mjs --write --full

# Wipe everything (products + collections + pages + files + non-main themes) and re-seed clean
node scripts/setup.mjs --write --wipe

# Dry-run — prints what would happen, no API writes
node scripts/setup.mjs
```

Fine-grained:
```bash
node scripts/seed-to-dev-store.mjs --write    # products + collections + pages + media only
node scripts/push-theme.mjs --write           # theme only
```

---

## Measured timing (fresh clean dev store, Win11, 1Gbps)

| Step | Time |
|---|---|
| `git clone` | 4s |
| Upload 162 media files (logo, hero, icons, testimonials, payment badges) | 80s |
| Seed ~50 products + 68 collections + 17 pages + 5 articles | 65s |
| Push + publish theme (584 files) | 130s |
| **Total** | **~4.5 min** |

---

## Troubleshooting

- **"REFUSED: store URL must end in *.myshopify.com"** — you put your custom domain in `.env`. Use the `*.myshopify.com` URL instead.
- **401 on first request** — your token is wrong or you didn't tick all six scopes. Re-check step A.3.
- **Some images don't render on the homepage** — wait a minute and reload; Shopify processes uploaded files asynchronously after the script completes.
- **Bundle Builder page is empty** — that's intentional. It's one of the things you could fix.

---

## What's NOT in this repo (and why)

- `.env` / API tokens — gitignored, never committed
- Customer data — never queried
- Order, transaction, payment data — never queried
- Refunds, discount codes, webhooks, apps — never queried
- Variant `cost`, `inventory_quantity`, internal metafields — explicitly stripped at export
- Internal tags (`supplier:`, `wholesale:`, `margin:`, `cost:`) — filtered out
- Theme app blocks (Judge.me, Klaviyo, etc.) — pruned at push time since you don't have those apps installed
- Videos (5 product preview clips) — too big to ship and not core to the task

The `media/` folder contains 162 images downsized to 1200px and converted to webp@q80 — visually identical to xinzuo.com.au, just optimised. Original `.png`/`.jpg` refs in the theme JSON are rewritten to `.webp` at push time.

In short: only what you'd see by browsing xinzuo.com.au with DevTools open.

---

## License

Shared **solely for the TYICDI developer hiring task**. Brand, product names, copy and imagery © Xinzuo Australia / Told You I Could Do It.

**You may** publish your own fix in a public GitHub repo for the sole purpose of submitting this challenge — that's how we read your work. Keep the brand assets attributed; don't claim the underlying content as your own.

**You may not** use the brand, content, theme, or any derivative for commercial purposes, in a portfolio piece beyond a reference to "TYICDI hiring task", or fork it as the basis of another store.
