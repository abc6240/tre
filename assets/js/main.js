/* ============================================================================
   TEAM ROCKETS EXCHANGE — site behaviour
   ----------------------------------------------------------------------------
   No dependencies, no build step. Reads window.TRE_DATA from data/products.js.
   ========================================================================== */
(function () {
  "use strict";

  var D = window.TRE_DATA || { PRODUCTS: [], CATEGORIES: [], INSTAGRAM_DM: "https://ig.me/m/teamrocketsexchange", COLLECTR_URL: "" };
  var PRODUCTS = D.PRODUCTS || [];
  var CATEGORIES = D.CATEGORIES || [];
  var DM = D.INSTAGRAM_DM || "https://ig.me/m/teamrocketsexchange";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* Which product photos actually exist on disk (see data/photo-manifest.js,
     written by tools/generate-placeholders.js). Cards without a photo skip the
     request entirely and render a branded placeholder inline — no 404s. */
  var PHOTOS = (window.TRE_PHOTOS && window.TRE_PHOTOS.available) || null;
  function photoFor(card) {
    if (!card.image) return "";
    if (!PHOTOS) return card.image;          /* no manifest: just try it */
    return PHOTOS.indexOf(card.image) !== -1 ? card.image : "";
  }

  function categoryName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i].name;
    }
    return id || "Collectible";
  }

  /* ==========================================================================
     1. MONOGRAM — refined "R" mark, injected wherever [data-monogram] appears
     ========================================================================== */
  function monogramSVG(size) {
    var s = parseInt(size, 10) || 64;
    var uid = "mono" + s + Math.random().toString(36).slice(2, 7);
    return '' +
      '<svg viewBox="0 0 120 120" width="' + s + '" height="' + s + '" role="img" aria-label="Team Rockets Exchange monogram" focusable="false">' +
        '<defs>' +
          '<linearGradient id="' + uid + 'g" x1="14%" y1="0%" x2="86%" y2="100%">' +
            '<stop offset="0%" stop-color="#f4e6c4"/>' +
            '<stop offset="38%" stop-color="#d8b672"/>' +
            '<stop offset="72%" stop-color="#a8873f"/>' +
            '<stop offset="100%" stop-color="#e8d5a8"/>' +
          '</linearGradient>' +
          '<radialGradient id="' + uid + 'f" cx="50%" cy="34%" r="62%">' +
            '<stop offset="0%" stop-color="#d8b672" stop-opacity=".2"/>' +
            '<stop offset="100%" stop-color="#d8b672" stop-opacity="0"/>' +
          '</radialGradient>' +
        '</defs>' +
        /* outer rings */
        '<circle cx="60" cy="60" r="55" fill="none" stroke="url(#' + uid + 'g)" stroke-width="1.1" opacity=".75"/>' +
        '<circle cx="60" cy="60" r="47.5" fill="url(#' + uid + 'f)" stroke="#c1121f" stroke-opacity=".5" stroke-width=".9"/>' +
        /* orbital ticks — a quiet nod to the villain motif */
        '<path d="M60 5.5v6M60 108.5v6M5.5 60h6M108.5 60h6" stroke="url(#' + uid + 'g)" stroke-width="1.2" stroke-linecap="round" opacity=".85"/>' +
	'<g fill="none" stroke="url(#' + uid + 'g)" stroke-linecap="square" stroke-linejoin="miter">' +
          '<path d="M46.5 89V39.5h15.2c6.1 0 10.1 3.6 10.1 9.2 0 4.4-2.4 7.6-6.4 8.8L76.5 89" stroke-width="6.2"/>' +
          '<path d="M59.5 57.5h5.6" stroke-width="6.2"/>' +
        '</g>' +
        '<path d="M80.5 81.5 89 91" stroke="#c1121f" stroke-width="2" stroke-linecap="round" opacity=".9"/>' +
      '</svg>';
  }

  function mountMonograms() {
    $$("[data-monogram]").forEach(function (el) {
      el.innerHTML = monogramSVG(el.getAttribute("data-monogram"));
    });
  }

  /* ==========================================================================
     2. CARD RENDERING
     ========================================================================== */
  var grid = $("[data-grid]");
  var filterBar = $("[data-filter-bar]");
  var filterName = $("[data-filter-name]");
  var emptyNote = $("[data-empty]");

  /* Branded placeholder, drawn on the fly, so a missing photo never breaks
     the layout. Happens automatically whenever an image fails to load. */
  function placeholderFor(card) {
    var initial = (card.name || "?").trim().charAt(0).toUpperCase();
    var set = (card.set || "").toUpperCase();
    var initialEsc = initial.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    var setEsc = set.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 34);
    var svg = '' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">' +
        '<defs>' +
          '<radialGradient id="bg" cx="50%" cy="26%" r="78%">' +
            '<stop offset="0%" stop-color="#1d1a20"/><stop offset="58%" stop-color="#101015"/><stop offset="100%" stop-color="#08080b"/>' +
          '</radialGradient>' +
          '<linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">' +
            '<stop offset="0%" stop-color="#f4e6c4"/><stop offset="45%" stop-color="#d8b672"/><stop offset="100%" stop-color="#a8873f"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<rect width="800" height="800" fill="url(#bg)"/>' +
        '<circle cx="400" cy="400" r="232" fill="none" stroke="url(#gold)" stroke-opacity=".36" stroke-width="1.4"/>' +
        '<circle cx="400" cy="400" r="196" fill="none" stroke="#c1121f" stroke-opacity=".3" stroke-width="1"/>' +
        '<text x="400" y="300" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="17" letter-spacing="7" fill="#7d7a85">TEAM ROCKETS EXCHANGE</text>' +
        '<text x="400" y="500" text-anchor="middle" font-family="Georgia,serif" font-size="240" fill="url(#gold)" fill-opacity=".92">' + initialEsc + '</text>' +
        '<text x="400" y="618" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="26" letter-spacing="4" fill="#e6e3dc">' + setEsc + '</text>' +
      '</svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function dmLink(card) {
    var msg = "Hi Team Rockets Exchange! I'm interested in the " + card.name +
      (card.set ? " (" + card.set + ")" : "") +
      (card.grade ? " — " + card.grade : "") +
      ". Is it still available?";
    return DM + "?text=" + encodeURIComponent(msg);
  }

  function cardHTML(card, index) {
    var sold = !!card.sold;
    var photo = photoFor(card);
    var gradeBit = card.grade ? '<span class="tag is-grade">' + esc(card.grade) + "</span>" : "";
    var condBit = card.condition ? '<span class="tag is-cond">' + esc(card.condition) + "</span>" : "";
    var kindBit = (!card.grade && !card.condition) ? '<span class="tag">' + esc(categoryName(card.category)) + "</span>" : "";
    var imgTag = photo
      ? '<img src="' + esc(photo) + '" alt="' + esc(card.name) + (card.set ? " — " + esc(card.set) : "") + '" loading="lazy" decoding="async" width="800" height="800" data-fallback="' + index + '" />'
      : '<img src="' + placeholderFor(card) + '" alt="' + esc(card.name) + (card.set ? " — " + esc(card.set) : "") + '" width="800" height="800" data-fallback="' + index + '" />';

    return '' +
      '<article class="card' + (sold ? " is-sold" : "") + '" data-card-index="' + index + '" style="--i:' + index + '">' +
        '<button class="card-open" type="button" data-open="' + index + '" aria-label="View details for ' + esc(card.name) + '"><span>View details</span></button>' +
        '<div class="card-media">' +
          imgTag +
          '<span class="holo" aria-hidden="true"></span>' +
          '<span class="spot" aria-hidden="true"></span>' +
          (card.badge ? '<span class="badge">' + esc(card.badge) + "</span>" : "") +
          (sold ? '<span class="sold-sash">Sold</span>' : "") +
        '</div>' +
        '<div class="card-body">' +
          '<p class="card-set">' + esc(card.set || "") + "</p>" +
          '<h3 class="card-name">' + esc(card.name) + "</h3>" +
          (card.meta ? '<p class="card-meta">' + esc(card.meta) + "</p>" : "") +
          '<div class="card-tags">' + gradeBit + condBit + kindBit + "</div>" +
          '<div class="card-foot">' +
            '<span class="card-price">' + esc(sold ? "Sold" : (card.price || "DM for price")) + "</span>" +
            (sold
              ? '<span class="card-cta" aria-hidden="true">Sold</span>'
              : '<a class="card-cta" href="' + esc(dmLink(card)) + '" target="_blank" rel="noopener">' +
                  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></svg>' +
                  "DM to Buy</a>") +
          "</div>" +
        "</div>" +
      "</article>";
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var currentFilter = "all";

  function visibleProducts() {
    /* Default view = the featured pieces only. Choosing a category shows that
       whole drawer, featured or not, so nothing in the inventory is hidden. */
    if (currentFilter === "all") {
      var featured = PRODUCTS.filter(function (p) { return p.featured; });
      return featured.length ? featured : PRODUCTS.slice();
    }
    return PRODUCTS.filter(function (p) { return p.category === currentFilter; });
  }

  function render() {
    if (!grid) return;
    var list = visibleProducts();

    /* remember each card's position in PRODUCTS so the lightbox can find it */
    grid.innerHTML = list.map(function (card) {
      return cardHTML(card, PRODUCTS.indexOf(card));
    }).join("");

    if (emptyNote) emptyNote.hidden = list.length !== 0;

    /* image fallbacks */
    $$("img[data-fallback]", grid).forEach(function (img) {
      img.addEventListener("error", function () {
        var card = PRODUCTS[parseInt(img.getAttribute("data-fallback"), 10)];
        if (card && img.src.indexOf("data:image/svg") !== 0) img.src = placeholderFor(card);
      });
    });

    /* entrance animation, gently staggered */
    var cards = $$(".card", grid);
    cards.forEach(function (c, i) {
      if (reduceMotion) { c.classList.add("is-in"); return; }
      c.style.animationDelay = Math.min(i * 55, 420) + "ms";
      requestAnimationFrame(function () { c.classList.add("is-in"); });
    });

    if (canHover && !reduceMotion) cards.forEach(attachPointerFX);
  }

  function applyFilter(id) {
    currentFilter = id || "all";
    var label = currentFilter === "all" ? "All featured pieces" : categoryName(currentFilter);
    if (filterBar) filterBar.hidden = currentFilter === "all";
    if (filterName) filterName.textContent = label;
    render();
  }

  /* ==========================================================================
     3. POINTER FX — spotlight + gentle 3D tilt + holo wash
     ========================================================================== */
  function attachPointerFX(card) {
    var media = $(".card-media", card);
    var spot = $(".spot", card);
    var holo = $(".holo", card);
    if (!media || !spot || !holo) return;
    var rect = null;
    var raf = null;
    var px = 0.5, py = 0.5;

    function paint() {
      raf = null;
      var rx = (0.5 - py) * 7;      /* tilt up/down */
      var ry = (px - 0.5) * 9;      /* tilt left/right */
      card.style.transform = "perspective(1000px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) translateY(-5px)";
      spot.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      spot.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      holo.style.setProperty("--hx", (px * 100).toFixed(1) + "%");
      holo.style.setProperty("--hy", (py * 100).toFixed(1) + "%");
    }

    function move(e) {
      if (!rect) rect = card.getBoundingClientRect();
      px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      if (!raf) raf = requestAnimationFrame(paint);
    }

    card.addEventListener("pointerenter", function () {
      rect = card.getBoundingClientRect();
      card.style.willChange = "transform";
    });
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", function () {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      card.style.transform = "";
      card.style.willChange = "";
      rect = null;
    });
    window.addEventListener("resize", function () { rect = null; }, { passive: true });
  }

  /* ==========================================================================
     4. LIGHTBOX
     ========================================================================== */
  var lb = $("[data-lightbox]");
  var lastFocus = null;

  function openLightbox(index) {
    var card = PRODUCTS[index];
    if (!lb || !card) return;

    var img = $("[data-lb-img]", lb);
    img.alt = card.name + (card.set ? " — " + card.set : "");
    img.style.transition = "opacity .45s ease";
    img.style.opacity = "0";
    var reveal = function () { img.style.opacity = "1"; };
    var src = photoFor(card);
    img.onload = reveal;
    img.onerror = function () {
      /* swap in the branded placeholder once, then show it */
      if (img.src.indexOf("data:image/svg") !== 0) {
        img.src = placeholderFor(card);
      }
      reveal();
    };
    img.src = src || placeholderFor(card);
    /* a cached image can already be complete before the handlers are attached */
    if (img.complete && img.naturalWidth > 0) reveal();

    $("[data-lb-name]", lb).textContent = card.name;
    $("[data-lb-set]", lb).textContent = card.set || categoryName(card.category);
    var meta = $("[data-lb-meta]", lb);
    meta.textContent = card.meta || "";
    meta.hidden = !card.meta;

    toggleRow("[data-lb-grade-row]", "[data-lb-grade]", card.grade);
    toggleRow("[data-lb-cond-row]", "[data-lb-cond]", card.condition);

    $("[data-lb-avail]", lb).textContent = card.sold ? "Sold — ask about similar" : "Available — ask in DM";
    $("[data-lb-price]", lb).textContent = card.sold ? "—" : (card.price || "DM for price");

    var dm = $("[data-lb-dm]", lb);
    if (dm) {
      dm.setAttribute("href", card.sold ? DM : dmLink(card));
      dm.innerHTML = '<svg class="btn-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>' +
        (card.sold ? "Ask about similar" : "DM to Buy");
    }

    var badge = $("[data-lb-badge]", lb);
    if (badge) { badge.textContent = card.badge || ""; badge.hidden = !card.badge; }
    var soldSash = $("[data-lb-sold]", lb);
    if (soldSash) soldSash.hidden = !card.sold;

    /* remember the opener so keyboard users keep their place */
    var active = document.activeElement;
    lastFocus = (active && active !== document.body && active !== document.documentElement) ? active : null;
    lb.hidden = false;
    document.body.classList.add("is-locked");
    var closeBtn = $(".lightbox-close", lb);
    if (closeBtn) closeBtn.focus();
  }

  function toggleRow(rowSel, valSel, value) {
    var row = $(rowSel, lb);
    if (!row) return;
    row.hidden = !value;
    if (value) $(valSel, lb).textContent = value;
  }

  function closeLightbox() {
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    document.body.classList.remove("is-locked");
    /* return focus to whatever opened it, so keyboard users don't lose place */
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus) {
      lastFocus.focus({ preventScroll: true });
      if (document.activeElement !== lastFocus) lastFocus.focus();
    }
    lastFocus = null;
  }

  /* ==========================================================================
     5. EVENTS
     ========================================================================== */
  function bind() {
    /* one delegated click handler for the whole grid */
    if (grid) {
      grid.addEventListener("click", function (e) {
        var open = e.target.closest("[data-open]");
        if (open) { openLightbox(parseInt(open.getAttribute("data-open"), 10)); }
      });
    }

    /* category cards -> filter the vault */
    $$("[data-category]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyFilter(btn.getAttribute("data-category"));
        var vault = $("#vault");
        if (vault) vault.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    });

    var clearBtn = $("[data-filter-clear]");
    if (clearBtn) clearBtn.addEventListener("click", function () { applyFilter("all"); });

    /* lightbox dismissal */
    if (lb) {
      $$("[data-lightbox-close]", lb).forEach(function (el) {
        el.addEventListener("click", closeLightbox);
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeLightbox();
        closeNav();
      }
    });

    /* mobile nav */
    var toggle = $("[data-nav-toggle]");
    var nav = $("#primaryNav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      });
      $$("a", nav).forEach(function (a) { a.addEventListener("click", closeNav); });
    }

    /* header state + floating CTA */
    var header = $("[data-header]");
    var fab = $(".fab");
    var onScroll = function () {
      var y = window.scrollY || document.documentElement.scrollTop;
      if (header) header.classList.toggle("is-stuck", y > 24);
      if (fab) fab.classList.toggle("is-visible", y > 560);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    var yearEl = $("[data-year]");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    /* how many pieces sit in each drawer */
    $$("[data-count]").forEach(function (el) {
      var id = el.getAttribute("data-count");
      var n = PRODUCTS.filter(function (p) { return p.category === id; }).length;
      el.textContent = n + (n === 1 ? " piece" : " pieces");
    });
  }

  function closeNav() {
    var toggle = $("[data-nav-toggle]");
    var nav = $("#primaryNav");
    if (nav && nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open menu"); }
    }
  }

  /* ==========================================================================
     6. SCROLL REVEALS
     ========================================================================== */
  function reveals() {
    var items = $$("[data-reveal]");
    if (!items.length) return;

    items.forEach(function (el) {
      var d = el.getAttribute("data-reveal-delay");
      if (d) el.style.setProperty("--reveal-delay", d + "ms");
    });

    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ==========================================================================
     BOOT
     ========================================================================== */
  function boot() {
    mountMonograms();
    render();
    bind();
    reveals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
