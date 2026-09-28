/* ============================================================================
   TEAM ROCKETS EXCHANGE — CATALOG + CONFIG
   ----------------------------------------------------------------------------
   This is the only file you edit to change the inventory.

   ---------------------------------------------------------------- CONFIG ---
   PRICE_API  the deployed Cloudflare Worker URL (see worker/README or the
              main README for deploy steps). Until you paste yours in, the site
              simply shows the offline fallbackMarket prices.
   MARKUP     1.10 = market price + 10%. Change it here and every price,
              everywhere, follows (the Worker imports the same maths).
   CURRENCY   USD.

   --------------------------------------------------------------- PRODUCT ---
   slug           matches the image file: assets/products/_placeholders/<slug>.svg
   name, set      card name and the set it belongs to
   number         card or product number, e.g. #4. Use "" when there isn't one.
   category       one of CATEGORIES below: "Graded" | "Vintage" | "Modern" | "Sealed"
   grade          "PSA 10" | "BGS 9.5" | "CGC 9" | "PSA 8" | "Raw" | "Sealed"
   collectrId     the Collectr product id used by the price Worker.
                  Left as "TODO" until you look it up. Products with "TODO"
                  are skipped by the price sync and keep their fallbackMarket.
   fallbackMarket last known Collectr MARKET price in USD (not the marked-up
                  price). Shown immediately on page load, then replaced by the
                  live price when the Worker answers. Keep it fresh with:
                      node tools/update-fallback.js
   badge          optional gold ribbon, e.g. "GRAIL"
   featured       true = also shown in the Featured Vault at the top
   ========================================================================== */

const TRE_CONFIG = {
  PRICE_API: "https://YOUR-WORKER.workers.dev/prices",
  MARKUP: 1.10,
  CURRENCY: "USD",
};

const CATEGORIES = ["Graded", "Vintage", "Modern", "Sealed"];

const PRODUCTS = [
  /* ----------------------------- featured ------------------------------ */
  {
    slug: "charizard-base-set",
    name: "Charizard",
    set: "Base Set Shadowless",
    number: "#4",
    category: "Graded",
    grade: "PSA 9",
    badge: "GRAIL",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 9974,
  },
  {
    slug: "umbreon-vmax",
    name: "Umbreon VMAX Alt Art",
    set: "Evolving Skies",
    number: "#215",
    category: "Graded",
    grade: "PSA 10",
    badge: "MOONBREON",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 3999,
  },
  {
    slug: "lugia-neo-genesis",
    name: "Lugia",
    set: "Neo Genesis",
    number: "#9",
    category: "Graded",
    grade: "BGS 9.5",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 2775,
  },
  {
    slug: "rayquaza-vmax",
    name: "Rayquaza VMAX Alt Art",
    set: "Evolving Skies",
    number: "#218",
    category: "Graded",
    grade: "PSA 10",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 2298,
  },
  {
    slug: "blastoise-base-set",
    name: "Blastoise",
    set: "Base Set",
    number: "#2",
    category: "Vintage",
    grade: "Raw",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 100,
  },
  {
    slug: "mewtwo-base-set",
    name: "Mewtwo",
    set: "Base Set",
    number: "#10",
    category: "Vintage",
    grade: "Raw",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 30,
  },
  {
    slug: "gengar-vmax",
    name: "Gengar VMAX Alt Art",
    set: "Fusion Strike",
    number: "#271",
    category: "Modern",
    grade: "Raw",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 850,
  },
  {
    slug: "evolving-skies-booster-box",
    name: "Evolving Skies Booster Box",
    set: "Sword & Shield",
    number: "",
    category: "Sealed",
    grade: "Sealed",
    badge: "SEALED",
    featured: true,
    collectrId: "TODO",
    fallbackMarket: 2294,
  },

  /* ----------------------------- inventory ----------------------------- */
  {
    slug: "pikachu-base-set",
    name: "Pikachu",
    set: "Base Set",
    number: "#58",
    category: "Graded",
    grade: "PSA 8",
    collectrId: "TODO",
    fallbackMarket: 46,
  },
  {
    slug: "charizard-ex-frlg",
    name: "Charizard ex",
    set: "FireRed & LeafGreen",
    number: "#105",
    category: "Graded",
    grade: "CGC 9",
    collectrId: "TODO",
    fallbackMarket: 6400,
  },
  {
    slug: "venusaur-base-set",
    name: "Venusaur",
    set: "Base Set",
    number: "#15",
    category: "Vintage",
    grade: "Raw",
    collectrId: "TODO",
    fallbackMarket: 78,
  },
  {
    slug: "dark-dragonite",
    name: "Dark Dragonite",
    set: "Team Rocket",
    number: "#5",
    category: "Vintage",
    grade: "Raw",
    collectrId: "TODO",
    fallbackMarket: 66,
  },
  {
    slug: "tyranitar-neo-discovery",
    name: "Tyranitar",
    set: "Neo Discovery",
    number: "#12",
    category: "Vintage",
    grade: "Raw",
    collectrId: "TODO",
    fallbackMarket: 100,
  },
  {
    slug: "mew-ex-151",
    name: "Mew ex",
    set: "Scarlet & Violet 151",
    number: "#205",
    category: "Modern",
    grade: "Raw",
    collectrId: "TODO",
    fallbackMarket: 27,
  },
  {
    slug: "giratina-v-lost-origin",
    name: "Giratina V Alt Art",
    set: "Lost Origin",
    number: "#186",
    category: "Modern",
    grade: "Raw",
    collectrId: "TODO",
    fallbackMarket: 746,
  },
  {
    slug: "pikachu-grey-felt-hat",
    name: "Pikachu with Grey Felt Hat",
    set: "Van Gogh Promo",
    number: "#085",
    category: "Modern",
    grade: "Raw",
    collectrId: "TODO",
    fallbackMarket: 925,
  },
  {
    slug: "151-etb",
    name: "151 Elite Trainer Box",
    set: "Scarlet & Violet 151",
    number: "",
    category: "Sealed",
    grade: "Sealed",
    collectrId: "TODO",
    fallbackMarket: 492,
  },
  {
    slug: "celebrations-chest",
    name: "Celebrations Collector Chest",
    set: "Celebrations",
    number: "",
    category: "Sealed",
    grade: "Sealed",
    collectrId: "TODO",
    fallbackMarket: 165,
  },
];

const INSTAGRAM_URL = "https://www.instagram.com/teamrocketsexchange/";
const COLLECTR_URL =
  "https://app.getcollectr.com/showcase/profile/@teamrocketsexchange";

/* Classic script, so the catalog is readable from a <script> tag and works
   from file:// too. main.js reads it from window.TRE_DATA. */
window.TRE_DATA = {
  CONFIG: TRE_CONFIG,
  CATEGORIES: CATEGORIES,
  PRODUCTS: PRODUCTS,
  INSTAGRAM_URL: INSTAGRAM_URL,
  COLLECTR_URL: COLLECTR_URL,
};

/* Also expose the raw arrays for tools and console poking. */
window.TRE_CONFIG = TRE_CONFIG;
