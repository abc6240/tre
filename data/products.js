/* ============================================================================
   TEAM ROCKETS EXCHANGE — PRODUCT INVENTORY
   ----------------------------------------------------------------------------
   This is the ONLY file you need to touch to add, edit or remove a card.

   Copy a block, paste it, change the values. That's it.

   FIELDS
     name      (required)  e.g. "Charizard"
     set       (required)  e.g. "Base Set Shadowless"
     category  (required)  one of: "graded" | "vintage" | "modern" | "sealed"
     image     (required)  path to your photo, e.g. "assets/products/charizard.jpg"
                           If the file is missing, a branded placeholder is
                           shown automatically — nothing breaks.
     grade     (optional)  e.g. "PSA 9", "BGS 9.5", "CGC 10". Only for slabs.
     condition (optional)  e.g. "Near Mint", "Sealed", "LP". For raw cards.
     price     (optional)  e.g. "$1,250" or "DM for price". Leave as
                           "DM for price" to keep pricing private.
     meta      (optional)  small extra line, e.g. "1st Edition · Holo"
     badge     (optional)  corner ribbon, e.g. "GRAIL", "NEW", "LAST ONE"
     featured  (optional)  true = appears in the Featured Vault grid
     sold      (optional)  true = shows a SOLD sash and keeps its place in the
                           grid; its button becomes "ask about similar" so a
                           sold card still brings you leads

   TIP: keep images roughly square (1:1) and under ~300 KB for fast loading.
   ========================================================================== */

const INSTAGRAM_DM = "https://ig.me/m/teamrocketsexchange";
const COLLECTR_URL =
  "https://app.getcollectr.com/showcase/profile/@teamrocketsexchange";

/* Category master list — edit labels and blurbs here too. */
const CATEGORIES = [
  {
    id: "graded",
    name: "Graded Slabs",
    blurb: "PSA · BGS · CGC — authenticated, encapsulated, investment-grade.",
  },
  {
    id: "vintage",
    name: "Vintage",
    blurb: "Wizards of the Coast era. Base Set through Neo and beyond.",
  },
  {
    id: "modern",
    name: "Modern Hits",
    blurb: "Alt arts, secret rares and chase cards from the current era.",
  },
  {
    id: "sealed",
    name: "Sealed Product",
    blurb: "Booster boxes, ETBs and packs — untouched since release day.",
  },
];

const PRODUCTS = [
  /* ----------------------------- FEATURED / GRAILS ----------------------- */
  {
    name: "Charizard",
    set: "Base Set · Shadowless",
    category: "graded",
    grade: "PSA 9",
    price: "DM for price",
    meta: "Holo · 1999",
    badge: "GRAIL",
    image: "assets/products/charizard-base-set.jpg",
    featured: true,
  },
  {
    name: "Umbreon VMAX",
    set: "Evolving Skies",
    category: "graded",
    grade: "PSA 10",
    price: "DM for price",
    meta: "Alt Art Secret · 215/203",
    badge: "MOONBREON",
    image: "assets/products/umbreon-vmax.jpg",
    featured: true,
  },
  {
    name: "Lugia",
    set: "Neo Genesis",
    category: "graded",
    grade: "BGS 9.5",
    price: "DM for price",
    meta: "Holo · 9/111",
    image: "assets/products/lugia-neo-genesis.jpg",
    featured: true,
  },
  {
    name: "Rayquaza VMAX",
    set: "Evolving Skies",
    category: "graded",
    grade: "PSA 10",
    price: "DM for price",
    meta: "Alt Art Secret · 218/203",
    image: "assets/products/rayquaza-vmax.jpg",
    featured: true,
  },
  {
    name: "Blastoise",
    set: "Base Set",
    category: "vintage",
    condition: "Near Mint",
    price: "DM for price",
    meta: "Holo · 2/102",
    image: "assets/products/blastoise-base-set.jpg",
    featured: true,
  },
  {
    name: "Mewtwo",
    set: "Base Set",
    category: "vintage",
    condition: "Lightly Played",
    price: "DM for price",
    meta: "Holo · 10/102",
    image: "assets/products/mewtwo-base-set.jpg",
    featured: true,
  },
  {
    name: "Gengar VMAX",
    set: "Fusion Strike",
    category: "modern",
    grade: "PSA 10",
    price: "DM for price",
    meta: "Alt Art Secret · 271/264",
    image: "assets/products/gengar-vmax.jpg",
    featured: true,
  },
  {
    name: "Evolving Skies Booster Box",
    set: "Sword & Shield",
    category: "sealed",
    condition: "Factory Sealed",
    price: "DM for price",
    meta: "36 Packs",
    badge: "SEALED",
    image: "assets/products/evolving-skies-booster-box.jpg",
    featured: true,
  },

  /* ------------------------------- GRADED -------------------------------- */
  {
    name: "Pikachu",
    set: "Base Set",
    category: "graded",
    grade: "PSA 8",
    price: "DM for price",
    meta: "Holo · 58/102",
    image: "assets/products/pikachu-base-set.jpg",
  },
  {
    name: "Charizard ex",
    set: "FireRed & LeafGreen",
    category: "graded",
    grade: "CGC 9",
    price: "DM for price",
    meta: "Ultra Rare",
    image: "assets/products/charizard-ex-frlg.jpg",
  },

  /* ------------------------------- VINTAGE ------------------------------- */
  {
    name: "Venusaur",
    set: "Base Set",
    category: "vintage",
    condition: "Near Mint",
    price: "DM for price",
    meta: "Holo · 15/102",
    image: "assets/products/venusaur-base-set.jpg",
  },
  {
    name: "Dark Dragonite",
    set: "Team Rocket",
    category: "vintage",
    condition: "Excellent",
    price: "DM for price",
    meta: "Holo · 5/82",
    badge: "TEAM ROCKET",
    image: "assets/products/dark-dragonite.jpg",
  },
  {
    name: "Tyranitar",
    set: "Neo Discovery",
    category: "vintage",
    condition: "Near Mint",
    price: "DM for price",
    meta: "Holo · 12/75",
    image: "assets/products/tyranitar-neo-discovery.jpg",
  },

  /* ---------------------------- MODERN HITS ------------------------------ */
  {
    name: "Mew ex",
    set: "151",
    category: "modern",
    grade: "PSA 10",
    price: "DM for price",
    meta: "Special Illustration Rare · 205/165",
    image: "assets/products/mew-ex-151.jpg",
  },
  {
    name: "Giratina V",
    set: "Lost Origin",
    category: "modern",
    grade: "PSA 10",
    price: "DM for price",
    meta: "Alt Art · 186/196",
    image: "assets/products/giratina-v-lost-origin.jpg",
  },
  {
    name: "Pikachu with Grey Felt Hat",
    set: "Van Gogh Promo",
    category: "modern",
    condition: "Near Mint",
    price: "DM for price",
    meta: "Black Star Promo · SVP 085",
    image: "assets/products/pikachu-grey-felt-hat.jpg",
  },

  /* --------------------------- SEALED PRODUCT ---------------------------- */
  {
    name: "151 Elite Trainer Box",
    set: "Scarlet & Violet",
    category: "sealed",
    condition: "Factory Sealed",
    price: "DM for price",
    meta: "9 Packs + Promo",
    image: "assets/products/151-etb.jpg",
  },
  {
    name: "Celebrations Collector Chest",
    set: "25th Anniversary",
    category: "sealed",
    condition: "Factory Sealed",
    price: "DM for price",
    meta: "Limited Print",
    image: "assets/products/celebrations-chest.jpg",
  },
];

/* Expose to the page (works from file:// and http:// alike). */
window.TRE_DATA = { PRODUCTS, CATEGORIES, INSTAGRAM_DM, COLLECTR_URL };
