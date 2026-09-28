# Team Rockets Exchange — showcase site

A modern-luxury, mobile-first showcase for a premium Pokémon card collection.
**No cart, no checkout, no payments.** Every purchase happens in Instagram DMs —
each product has a **DM to Buy** button that opens the DMs with the card name
already written out.

- Instagram DM link: **https://ig.me/m/teamrocketsexchange**
- Full inventory: **https://app.getcollectr.com/showcase/profile/@teamrocketsexchange**

---

## 1. Preview it

Everything is plain HTML/CSS/JS — no build step, no dependencies.

```bash
node tools/serve.js          # → http://localhost:5173
```

Then open that address. (You can also just double-click `index.html`, but use
the server: it loads `data/*.js` as real files, exactly like your host will.
`file://` blocks that in some browsers.)

## 2. Put it online

Upload the whole folder to any static host. Nothing to compile.

| Host | What to do |
| --- | --- |
| **Netlify** | Drag the folder onto app.netlify.com/drop |
| **Vercel** | `npx vercel --prod` in this folder |
| **Cloudflare Pages** | Connect the repo, leave the build command empty, output dir `/` |
| **GitHub Pages** | Push to a repo → Settings → Pages → deploy from branch root |
| **Your own hosting** | Upload via FTP to the web root |

Then point your Instagram bio link at the site.

> Before uploading: run `node tools/generate-placeholders.js` once so
> `data/photo-manifest.js` matches the photos you actually added.

## 3. Add or edit cards — one file

Open **`data/products.js`**. Copy a block, change the values. That's the whole
job.

```js
{
  name: "Charizard",                       // required
  set: "Base Set · Shadowless",            // required
  category: "graded",                      // required: graded | vintage | modern | sealed
  image: "assets/products/charizard-base-set.jpg",   // required
  grade: "PSA 9",                          // optional — slabs
  condition: "Near Mint",                  // optional — raw cards
  price: "DM for price",                   // optional — e.g. "$1,250"
  meta: "Holo · 1999",                     // optional — small line under the name
  badge: "GRAIL",                          // optional — gold corner ribbon
  featured: true,                          // show in the Featured Vault grid
  sold: true                               // optional — adds a SOLD sash, hides DM button
}
```

**How the vault grid behaves**

- No category selected → shows every card marked `featured: true`.
- Pick a category from the **Categories** section → shows *that whole drawer*,
  featured or not, plus a filter bar with a "Show everything" reset.
- Mark a card `sold: true` and it stays visible with a SOLD sash and an
  "ask about similar" DM button — good social proof, still a sales lead. Remove
  it from the grid entirely by deleting the block (or dropping `featured`).

Edit the four **category names and blurbs** in the `CATEGORIES` array at the top
of the same file.

### Prices

`price` accepts anything: `"$1,250"`, `"$480 shipped"`, or `"DM for price"`.
Keep it as `"DM for price"` to negotiate privately — the site never shows a
number the card doesn't declare.

## 4. Add product photos

1. Drop your photo into **`assets/products/`**.
2. Name it to match the `image:` value in `data/products.js`.
3. Run `node tools/generate-placeholders.js`.

That last step writes `data/photo-manifest.js`, which lists the photos that
exist. Cards without a photo cost **zero network requests** and draw a branded
gold-monogram placeholder instead — so the site never shows a broken image while
you're still photographing inventory.

Square images (1:1) look best; keep them under ~300 KB for fast loading, ideally
`.jpg` or `.webp`. Everything is lazy-loaded.

## 5. Files

```
index.html                     all six sections + the product lightbox
assets/css/style.css           the whole design system (tokens at the top)
assets/js/main.js              rendering, filtering, lightbox, animations
data/products.js               ← YOUR INVENTORY — the only file you edit
data/photo-manifest.js         generated — which photos exist on disk
assets/brand/monogram.svg      the "R" crest (also used as the logo source)
assets/brand/favicon.svg       browser tab icon
assets/products/               your product photos go here
assets/products/_placeholders/ preview placeholders (reference only, safe to delete)
tools/                         helper scripts (see below)
```

### The design

Everything visual is driven by CSS variables at the top of `assets/css/style.css`:

```css
--crimson: #c1121f;   /* the red */
--gold:    #d8b672;   /* accents, rules, eyebrows */
--champagne: #f0dfb8; /* headline gradient */
--black:   #050506;   /* page base */
```

Change those and the entire site re-themes. Headings are Cormorant Garamond,
body text is Inter, both loaded from Google Fonts with system fallbacks — swap
the `<link>` in `index.html` to change them.

## 6. Helper scripts (optional)

All dependency-free Node scripts used to build and check the site:

```bash
node tools/serve.js                    # local preview server
node tools/generate-placeholders.js    # sync photo manifest + previews (--force to redo)
node tools/qa.js http://localhost:5173 # 36 end-to-end checks: filters, lightbox, keyboard,
                                       # focus handling, mobile nav, overflow, console errors
node tools/shot.js <url> out.png 390 844 full   # screenshot the page at any width
node tools/inspect.js <url> 1440 900            # print computed grid/viewport geometry
```

`qa.js` exits non-zero on failure, so it works as a pre-deploy check or in CI.

## 7. What's built in

- **Mobile-first**, no horizontal overflow at any width, 4/3/2/1-up card grid.
- **Fast**: no frameworks, no build, lazy images, single CSS file, ~11 KB of JS.
- **Accessible**: keyboard-operable card grid, `Esc` closes the lightbox, focus
  returns to the card you opened, `aria-modal` dialog, visible focus rings,
  skip link, and full `prefers-reduced-motion` support.
- **Resilient**: missing photos fall back to branded art, no console errors.

## 8. Notes

- This is a **fan-styled showcase**. It is not affiliated with, endorsed by, or
  sponsored by Nintendo, Creatures Inc., GAME FREAK inc. or The Pokémon Company,
  and it deliberately uses no official logos or artwork. That disclaimer is in
  the footer — please leave it there.
- Availability, pricing, payment and shipping are all handled privately in DMs.
  The site holds no customer data and has no backend.
