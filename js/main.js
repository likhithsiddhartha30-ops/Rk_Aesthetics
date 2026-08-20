/* =========================================================
   RK AESTHETICS — Site behavior

   Delivery model: the files are free at the moment. Someone picks
   what they want, fills in their details at checkout, and the
   downloads are handed over immediately — the form is a lead capture,
   not a payment.

   Payment links are still defined in products.js, unused, ready for
   the day this goes paid.
   ========================================================= */

/* ---------- helpers ---------- */
function formatPrice(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function starIcon() {
  return '<svg viewBox="0 0 20 20"><path d="M10 1.5l2.6 5.5 6 .7-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L1.4 7.7l6-.7z"/></svg>';
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}

const CART_KEY = "rkaesthetics_cart";

/* ---------- cart storage ----------
   These are digital files: owning two copies of the same PDF is
   meaningless, so a product is either in the cart or it isn't. There
   is no quantity anywhere in the flow.
   ---------------------------------- */
function getCart() {
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
  // Older carts stored a qty; drop it, and drop any duplicates with it.
  const seen = new Set();
  return raw
    .filter((i) => i && i.id && !seen.has(i.id) && seen.add(i.id))
    .map((i) => ({ id: i.id }));
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartBadge();
}

function inCart(id) {
  return getCart().some((i) => i.id === id);
}

/* Returns false when the product was already there. */
function addToCart(id) {
  if (inCart(id)) return false;
  const cart = getCart();
  cart.push({ id });
  saveCart(cart);
  return true;
}

function removeFromCart(id) {
  saveCart(getCart().filter((i) => i.id !== id));
}

function cartCount() {
  return getCart().length;
}

function cartLines() {
  return getCart()
    .map((i) => {
      const p = getProduct(i.id);
      return p ? { id: i.id, product: p } : null;
    })
    .filter(Boolean);
}

function cartSubtotal() {
  return cartLines().reduce((sum, l) => sum + l.product.price, 0);
}

/* ---------- library (what the visitor has claimed) ----------
   Nothing is charged for right now: filling in the form on the
   checkout page unlocks the files. This list is what the site has
   handed over, kept in the browser.

   When payment is switched back on, this is the piece that must move
   to the server — a browser deciding its own entitlements is fine for
   free files and useless for paid ones.
   ------------------------------------------------------------ */
const LIBRARY_KEY = "rkaesthetics_library";
const ORDERS_KEY = "rkaesthetics_orders";

function getLibrary() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function ownsProduct(id) {
  return getLibrary().includes(id);
}

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

/* Files claimed, de-duplicated across overlapping products — the
   bundle contains what the singles contain. */
function libraryFiles() {
  const seen = new Set();
  const files = [];
  getLibrary().forEach((id) => {
    getProductFiles(id).forEach((f) => {
      if (!seen.has(f.file)) {
        seen.add(f.file);
        files.push(f);
      }
    });
  });
  return files;
}

/* Access is decided by files, not by product id: claiming the bundle
   gives you every single product inside it too. */
function hasAccess(id) {
  const files = getProductFiles(id);
  if (!files.length) return false;
  const owned = new Set(libraryFiles().map((f) => f.file));
  return files.every((f) => owned.has(f.file));
}

/* Records the claim, unlocks its products, empties the cart. */
function completeOrder(customer) {
  const lines = cartLines();
  if (!lines.length) return null;

  const library = getLibrary();
  lines.forEach((l) => {
    if (!library.includes(l.id)) library.push(l.id);
  });
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));

  const order = {
    id: "RK" + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    total: 0,
    listPrice: cartSubtotal(),
    customer: customer || null,
    items: lines.map((l) => ({ id: l.id, name: l.product.name, price: l.product.price }))
  };
  const orders = getOrders();
  orders.unshift(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));

  saveCart([]);
  return order;
}

/* Filename the reader ends up with on disk. */
function downloadFileName(name) {
  return "RK Aesthetics - " + String(name).replace(/[\\/:*?"<>|]/g, "") + ".pdf";
}

function downloadListHTML(files) {
  return files
    .map(
      (f) => `
      <li class="download-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        <span class="download-name">${f.name}</span>
        <a class="btn btn-outline btn-sm" href="${escapeAttr(f.file)}" download="${escapeAttr(downloadFileName(f.name))}" data-download>Download PDF</a>
      </li>`
    )
    .join("");
}

/* Saves a URL under a given filename without leaving the page. */
function saveAs(href, filename) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* Browsers hand PDFs to their built-in viewer whenever they can, so
   the file is fetched and saved from a blob — a blob has no viewer to
   open in, it can only be saved. fetch() is unavailable over file://,
   so opening the site straight from disk falls back to a plain
   download-attribute click. Either way the page never navigates,
   because navigating is what opens the viewer. */
function initDownloadHandlers() {
  document.addEventListener("click", async (e) => {
    const link = e.target.closest("a[data-download]");
    if (!link || link.dataset.busy) return;

    e.preventDefault();
    const filename = link.getAttribute("download") || "download.pdf";

    if (location.protocol === "file:") {
      saveAs(link.href, filename);
      return;
    }

    const label = link.textContent;
    link.dataset.busy = "1";
    link.textContent = "Preparing…";

    try {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error("HTTP " + res.status);

      const url = URL.createObjectURL(await res.blob());
      saveAs(url, filename);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      showToast("That file couldn't be downloaded. Please refresh, or contact support.");
      console.error("Download failed:", link.href, err);
    } finally {
      link.textContent = label;
      delete link.dataset.busy;
    }
  });
}

/* ---------- already-claimed box on the product page ---------- */
function renderOwnedBox(p) {
  const info = document.querySelector(".product-info");
  if (!info || !hasAccess(p.id)) return;

  const viaBundle = !ownsProduct(p.id);
  const box = document.createElement("div");
  box.className = "owned-box";
  box.innerHTML = `
    <h4>${viaBundle ? "Included in a bundle you have — download it below" : "You already have this — download it below"}</h4>
    <ul class="download-list">${downloadListHTML(getProductFiles(p.id))}</ul>
    <a class="link-under" href="downloads.html">All your downloads</a>
  `;
  info.querySelector(".product-actions").insertAdjacentElement("afterend", box);
}

/* ---------- downloads page ---------- */
function initDownloadsPage() {
  const wrap = document.getElementById("downloads-page");
  if (!wrap) return;

  const orderId = new URLSearchParams(location.search).get("order");
  const banner = document.getElementById("order-banner");
  if (orderId && banner) {
    const order = getOrders().find((o) => o.id === orderId);
    if (order) {
      banner.innerHTML = `
        <h3>You're all set — ${order.id}</h3>
        <p>${order.items.map((i) => i.name).join(", ")}. Your files are ready below, and this page stays available on this device.</p>`;
      banner.style.display = "block";
    }
  }

  const emptyEl = document.getElementById("downloads-empty");
  const listWrap = document.getElementById("downloads-list");
  const library = getLibrary();

  if (!library.length) {
    listWrap.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";
  listWrap.style.display = "block";

  listWrap.innerHTML = library
    .map((id) => {
      const p = getProduct(id);
      if (!p) return "";
      const files = getProductFiles(id);
      return `
        <div class="download-group">
          <div class="download-group-head">
            <div class="thumb"><img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}" loading="lazy"></div>
            <div>
              <span class="cat">${categoryLabel(p.category)}</span>
              <h3>${p.name}</h3>
              <p>${files.length} file${files.length !== 1 ? "s" : ""} · PDF · yours to keep</p>
            </div>
          </div>
          <ul class="download-list">${downloadListHTML(files)}</ul>
        </div>`;
    })
    .join("");
}

/* The Downloads link appears once something has been claimed. */
function renderLibraryNav() {
  const has = getLibrary().length > 0;
  document.querySelectorAll("[data-downloads-link]").forEach((el) => {
    el.style.display = has ? "" : "none";
  });
}

/* ---------- toast ---------- */
function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove("show"), 2400);
}

/* ---------- nav ---------- */
function renderCartBadge() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = cartCount();
  });
}

function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }

  // Overlay nav (home page) turns solid once the hero image scrolls past.
  const nav = document.querySelector(".nav--overlay");
  if (nav) {
    const onScroll = () => {
      nav.classList.toggle("is-solid", window.scrollY > 80);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  renderCartBadge();
  renderLibraryNav();
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}

/* ---------- claim button ----------
   Free for now, so this adds the product to the cart rather than
   sending anyone to a payment page. A product already claimed says so
   and points at the download instead.
   ---------------------------------- */
function claimButtonHTML(p, extraClass) {
  const cls = "btn btn-primary" + (extraClass ? " " + extraClass : "");
  if (hasAccess(p.id)) {
    return `<a class="btn btn-outline${extraClass ? " " + extraClass : ""}" href="downloads.html">Download it again</a>`;
  }
  return `<button type="button" class="${cls}" data-claim="${escapeAttr(p.id)}">Get it free</button>`;
}

function initClaimButtons(root) {
  (root || document).querySelectorAll("[data-claim]").forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      const p = getProduct(btn.dataset.claim);
      if (p) addToCartAndOpen(p.id, p.name);
    });
  });
}

/* ---------- cart drawer ----------
   Built once and reused on every page, so adding to the cart never
   costs the visitor their place on the page they were reading.
   --------------------------------- */
function ensureCartDrawer() {
  let drawer = document.getElementById("cart-drawer");
  if (drawer) return drawer;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="drawer-overlay" id="drawer-overlay" hidden></div>
    <aside class="drawer" id="cart-drawer" role="dialog" aria-modal="true" aria-label="Your cart" hidden>
      <div class="drawer-head">
        <h3 id="drawer-title">Added to cart</h3>
        <button type="button" class="drawer-close" aria-label="Close cart">&times;</button>
      </div>
      <div class="drawer-body" id="drawer-items"></div>
      <div class="drawer-foot">
        <div class="drawer-total"><span>Subtotal</span><span id="drawer-subtotal">₹0</span></div>
        <p class="drawer-note">Free during launch · download straight away.</p>
        <a href="checkout.html" class="btn btn-primary btn-block">Get my files</a>
        <a href="cart.html" class="link-under drawer-viewcart">View cart</a>
      </div>
    </aside>`;
  document.body.appendChild(wrap);

  drawer = document.getElementById("cart-drawer");
  const overlay = document.getElementById("drawer-overlay");

  drawer.querySelector(".drawer-close").addEventListener("click", closeCartDrawer);
  overlay.addEventListener("click", closeCartDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) closeCartDrawer();
  });

  return drawer;
}

function renderCartDrawer() {
  const itemsEl = document.getElementById("drawer-items");
  if (!itemsEl) return;
  const lines = cartLines();

  itemsEl.innerHTML = lines.length
    ? lines
        .map(
          (l) => `
        <div class="drawer-item" data-id="${l.id}">
          <div class="thumb"><img src="${escapeAttr(l.product.image)}" alt="${escapeAttr(l.product.name)}" loading="lazy"></div>
          <div class="drawer-item-info">
            <span class="cat">${categoryLabel(l.product.category)}</span>
            <h4><a href="product.html?id=${l.id}">${l.product.name}</a></h4>
            <span class="drawer-item-price">${formatPrice(l.product.price)}</span>
          </div>
          <button type="button" class="drawer-remove" aria-label="Remove ${escapeAttr(l.product.name)}">&times;</button>
        </div>`
        )
        .join("")
    : `<p class="drawer-empty">Your cart is empty.</p>`;

  itemsEl.querySelectorAll(".drawer-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeFromCart(btn.closest(".drawer-item").dataset.id);
      renderCartDrawer();
      document.dispatchEvent(new CustomEvent("cart:changed"));
    });
  });

  document.getElementById("drawer-subtotal").textContent = formatPrice(cartSubtotal());
}

function openCartDrawer(title) {
  ensureCartDrawer();
  renderCartDrawer();
  document.getElementById("drawer-title").textContent = title || "Your cart";
  document.getElementById("cart-drawer").hidden = false;
  document.getElementById("drawer-overlay").hidden = false;
  requestAnimationFrame(() => document.getElementById("cart-drawer").classList.add("open"));
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  const drawer = document.getElementById("cart-drawer");
  if (!drawer) return;
  drawer.classList.remove("open");
  document.body.style.overflow = "";
  setTimeout(() => {
    drawer.hidden = true;
    document.getElementById("drawer-overlay").hidden = true;
  }, 280);
}

/* One product, one copy — tells the visitor which happened. */
function addToCartAndOpen(id, name) {
  if (addToCart(id)) {
    openCartDrawer("Added to cart");
  } else {
    openCartDrawer("Already in your cart");
    showToast(`"${name}" is already in your cart — one copy is all you need.`);
  }
  document.dispatchEvent(new CustomEvent("cart:changed"));
}

/* ---------- product card ---------- */
function productCardHTML(p) {
  return `
    <a class="card" href="product.html?id=${p.id}">
      <div class="card-cover">
        ${p.tag ? `<span class="card-tag">${p.tag}</span>` : ""}
        <img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}" loading="lazy">
      </div>
      <div class="card-body">
        <span class="card-cat">${categoryLabel(p.category)}</span>
        <h3>${p.name}</h3>
        <p class="card-blurb">${p.blurb}</p>
        <div class="card-foot">
          <span class="price">${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ""}${formatPrice(p.price)}</span>
          <span class="rating">${p.number} · ${p.duration}</span>
        </div>
      </div>
    </a>
  `;
}

/* ---------- static star rows (testimonials) ---------- */
function renderStarRows() {
  document.querySelectorAll(".stars").forEach((el) => {
    if (!el.childElementCount) el.innerHTML = starIcon().repeat(5);
  });
}

/* ---------- featured (home page) ---------- */
function renderFeatured() {
  const grid = document.getElementById("featured-grid");
  if (!grid) return;
  const featured = [
    "executive-body-system",
    "corporate-diet-plan",
    "corporate-workout-plan",
    "office-lunch-guide"
  ]
    .map(getProduct)
    .filter(Boolean);
  grid.innerHTML = featured.map(productCardHTML).join("");
}

/* ---------- shop page ---------- */
function initShopPage() {
  const grid = document.getElementById("shop-grid");
  if (!grid) return;

  const params = new URLSearchParams(location.search);
  let activeCategory = params.get("category") || "all";
  let sort = "featured";

  const filterList = document.getElementById("filter-list");
  const sortSelect = document.getElementById("sort-select");
  const countEl = document.getElementById("result-count");

  function counts() {
    const c = { all: PRODUCTS.length };
    CATEGORIES.forEach((cat) => {
      c[cat.key] = PRODUCTS.filter((p) => p.category === cat.key).length;
    });
    return c;
  }

  function renderFilters() {
    const c = counts();
    const items = [{ key: "all", label: "All Products" }, ...CATEGORIES];
    filterList.innerHTML = items
      .map(
        (cat) => `
        <button data-cat="${cat.key}" class="${activeCategory === cat.key ? "active" : ""}">
          <span>${cat.label}</span><span class="n">${c[cat.key]}</span>
        </button>`
      )
      .join("");
    filterList.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = btn.dataset.cat;
        renderFilters();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    let items = PRODUCTS.filter(
      (p) => activeCategory === "all" || p.category === activeCategory
    );
    if (sort === "price-asc") items = [...items].sort((a, b) => a.price - b.price);
    if (sort === "price-desc") items = [...items].sort((a, b) => b.price - a.price);
    if (sort === "featured") items = [...items].sort((a, b) => a.number.localeCompare(b.number));

    countEl.textContent = `${items.length} product${items.length !== 1 ? "s" : ""}`;
    grid.innerHTML = items.length
      ? items.map(productCardHTML).join("")
      : `<div class="empty-state"><p>No products found in this category.</p></div>`;
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      sort = sortSelect.value;
      renderGrid();
    });
  }

  renderFilters();
  renderGrid();
}

/* ---------- product detail page ---------- */
function initProductPage() {
  const wrap = document.getElementById("product-detail");
  if (!wrap) return;

  const params = new URLSearchParams(location.search);
  const p = getProduct(params.get("id")) || PRODUCTS[0];

  document.title = `${p.name} — RK Aesthetics`;

  wrap.innerHTML = `
    <div class="product-cover">
      <img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.name)}">
    </div>
    <div class="product-info">
      <span class="card-cat">${categoryLabel(p.category)}</span>
      <h1>${p.name}</h1>
      <p class="headline">${p.headline}</p>
      <div class="product-price-row">
        <span class="price">${p.oldPrice ? `<span class="old">${formatPrice(p.oldPrice)}</span>` : ""}${formatPrice(p.price)}</span>
      </div>
      <p class="desc">${p.description}</p>
      <div class="product-meta">
        <div><span>Format</span><b>${p.format}</b></div>
        <div><span>Duration</span><b>${p.duration}</b></div>
        <div><span>Commitment</span><b>${p.commitment}</b></div>
      </div>
      <div class="product-actions">
        ${claimButtonHTML(p, "btn-lg")}
        <span class="free-note">Free while we're in launch — usually ${formatPrice(p.price)}.</span>
      </div>
      <div class="delivery-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        <div>
          <b>Yours to download in about thirty seconds.</b>
          <span>Add it, tell us where to send updates, and the PDF downloads straight away. No payment, no card details.</span>
        </div>
      </div>
      <ul class="included-list">
        ${p.features
          .slice(0, 3)
          .map(
            (f) =>
              `<li><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>${f}</li>`
          )
          .join("")}
      </ul>
    </div>
  `;

  initClaimButtons(wrap);
  renderOwnedBox(p);

  const claimBtn = wrap.querySelector("[data-claim]");
  if (claimBtn) {
    const syncClaimButton = () => {
      claimBtn.textContent = inCart(p.id) ? "In your cart" : "Get it free";
    };
    syncClaimButton();
    document.addEventListener("cart:changed", syncClaimButton);
  }

  const tabDesc = document.getElementById("tab-panel-description");
  const tabIncludes = document.getElementById("tab-panel-includes");
  if (tabDesc)
    tabDesc.innerHTML =
      `<p>${p.description}</p>` +
      (p.objection ? `<p class="objection">${p.objection}</p>` : "");
  if (tabIncludes)
    tabIncludes.innerHTML = `<ul>${p.features.map((f) => `<li>${f}</li>`).join("")}</ul>`;

  document.querySelectorAll(".tab-nav button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-nav button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((tp) => tp.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  // related products
  const relatedGrid = document.getElementById("related-grid");
  if (relatedGrid) {
    const related = PRODUCTS.filter((rp) => rp.category === p.category && rp.id !== p.id).slice(0, 4);
    relatedGrid.innerHTML = related.map(productCardHTML).join("");
  }
}

/* ---------- home page bundle CTA ---------- */
function renderBundleCta() {
  const slot = document.getElementById("bundle-cta");
  if (!slot) return;
  const bundle = getProduct("executive-body-system");
  if (bundle) slot.innerHTML = claimButtonHTML(bundle, "btn-lg");
  initClaimButtons(slot);
}

/* ---------- client results gallery (home page) ---------- */
function initResults() {
  const grid = document.getElementById("results-grid");
  if (!grid || typeof TESTIMONIAL_SHOTS === "undefined") return;

  const BATCH = 12;
  let shown = 0;

  const moreBtn = document.getElementById("results-more");
  const countEl = document.getElementById("results-count");
  if (countEl) countEl.textContent = `${TESTIMONIAL_SHOTS.length} of them.`;

  function renderNext() {
    const next = TESTIMONIAL_SHOTS.slice(shown, shown + BATCH);
    grid.insertAdjacentHTML(
      "beforeend",
      next
        .map(
          (src, i) => `
        <button class="result-shot" type="button" data-index="${shown + i}">
          <img src="${escapeAttr(src)}" alt="Client transformation ${shown + i + 1}" loading="lazy" decoding="async">
        </button>`
        )
        .join("")
    );
    shown += next.length;
    if (moreBtn) moreBtn.style.display = shown >= TESTIMONIAL_SHOTS.length ? "none" : "";
  }

  renderNext();
  moreBtn?.addEventListener("click", renderNext);

  /* ---- lightbox ---- */
  const lb = document.getElementById("lightbox");
  if (!lb) return;
  const lbImg = lb.querySelector(".lb-img");
  const lbCounter = lb.querySelector(".lb-counter");
  let current = 0;

  function show(i) {
    current = (i + TESTIMONIAL_SHOTS.length) % TESTIMONIAL_SHOTS.length;
    lbImg.src = TESTIMONIAL_SHOTS[current];
    lbCounter.textContent = `${current + 1} / ${TESTIMONIAL_SHOTS.length}`;
  }

  function open(i) {
    show(i);
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function close() {
    lb.hidden = true;
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
  }

  grid.addEventListener("click", (e) => {
    const shot = e.target.closest(".result-shot");
    if (shot) open(Number(shot.dataset.index));
  });

  lb.querySelector(".lb-close").addEventListener("click", close);
  lb.querySelector(".lb-prev").addEventListener("click", () => show(current - 1));
  lb.querySelector(".lb-next").addEventListener("click", () => show(current + 1));
  lb.addEventListener("click", (e) => {
    if (e.target === lb) close();
  });

  document.addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });
}

/* ---------- cart page ---------- */
function initCartPage() {
  const wrap = document.getElementById("cart-page");
  if (!wrap) return;

  function render() {
    const lines = cartLines();
    const itemsEl = document.getElementById("cart-items");
    const emptyEl = document.getElementById("cart-empty");
    const summaryEl = document.getElementById("cart-summary");

    if (!lines.length) {
      itemsEl.style.display = "none";
      summaryEl.style.display = "none";
      emptyEl.style.display = "block";
      return;
    }
    itemsEl.style.display = "block";
    summaryEl.style.display = "block";
    emptyEl.style.display = "none";

    itemsEl.innerHTML = lines
      .map(
        (l) => `
      <div class="cart-item" data-id="${l.id}">
        <div class="thumb"><img src="${escapeAttr(l.product.image)}" alt="${escapeAttr(l.product.name)}" loading="lazy"></div>
        <div>
          <span class="cat">${categoryLabel(l.product.category)}</span>
          <h4><a href="product.html?id=${l.id}">${l.product.name}</a></h4>
          <button type="button" class="remove">Remove</button>
        </div>
        <span class="line-price">${formatPrice(l.product.price)}</span>
      </div>`
      )
      .join("");

    itemsEl.querySelectorAll(".cart-item").forEach((row) => {
      row.querySelector(".remove").addEventListener("click", () => {
        removeFromCart(row.dataset.id);
        render();
        document.dispatchEvent(new CustomEvent("cart:changed"));
      });
    });

    const subtotal = cartSubtotal();
    document.getElementById("sum-subtotal").textContent = formatPrice(subtotal);
    document.getElementById("sum-total").textContent = formatPrice(subtotal);
  }

  document.addEventListener("cart:changed", render);

  document.getElementById("checkout-btn")?.addEventListener("click", () => {
    if (!cartLines().length) return;
    location.href = "checkout.html";
  });

  render();
}

/* ---------- checkout page ----------
   There is no payment API here: each product is paid for on its own
   hosted Razorpay page. One item is a straight redirect. Several
   items means several payments, because a Payment Link carries one
   fixed amount — so the page says so plainly and nudges the bundle.
   ----------------------------------- */
const CUSTOMER_KEY = "rkaesthetics_customer";

function getSavedCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function initCheckoutPage() {
  const page = document.getElementById("checkout-page");
  if (!page) return;

  const form = document.getElementById("checkout-form");
  const emptyEl = document.getElementById("checkout-empty");
  const lines = cartLines();

  if (!lines.length) {
    document.getElementById("checkout-layout").style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  /* ---- order summary ---- */
  document.getElementById("checkout-lines").innerHTML = lines
    .map(
      (l) => `
      <div class="checkout-line">
        <div class="thumb"><img src="${escapeAttr(l.product.image)}" alt="${escapeAttr(l.product.name)}" loading="lazy"></div>
        <div>
          <h4>${l.product.name}</h4>
          <span>${l.product.format} · one copy</span>
        </div>
        <span class="line-price">${formatPrice(l.product.price)}</span>
      </div>`
    )
    .join("");

  document.getElementById("checkout-subtotal").textContent = formatPrice(cartSubtotal());
  document.getElementById("checkout-total").textContent = "Free";
  document.getElementById("checkout-count").textContent =
    `${lines.length} item${lines.length !== 1 ? "s" : ""}`;

  /* ---- prefill from the last order ---- */
  const saved = getSavedCustomer();
  Object.keys(saved).forEach((k) => {
    const field = form.elements[k];
    if (field && typeof saved[k] === "string") field.value = saved[k];
  });

  /* ---- validation ---- */
  const RULES = {
    name: (v) => (v.trim().length >= 2 ? "" : "Please enter your full name."),
    email: (v) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
        ? ""
        : "Enter a valid email — this is where your files are sent.",
    phone: (v) =>
      /^[6-9]\d{9}$/.test(v.replace(/[\s-]/g, ""))
        ? ""
        : "Enter a 10-digit Indian mobile number."
  };

  function setError(field, message) {
    const wrap = field.closest(".field");
    wrap.querySelector(".field-error").textContent = message;
    wrap.classList.toggle("has-error", !!message);
    field.setAttribute("aria-invalid", message ? "true" : "false");
    return !message;
  }

  function validateField(name) {
    const field = form.elements[name];
    if (!field || !RULES[name]) return true;
    return setError(field, RULES[name](field.value));
  }

  Object.keys(RULES).forEach((name) => {
    const field = form.elements[name];
    if (!field) return;
    field.addEventListener("blur", () => validateField(name));
    field.addEventListener("input", () => {
      if (field.closest(".field").classList.contains("has-error")) validateField(name);
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    let ok = true;
    Object.keys(RULES).forEach((name) => {
      if (!validateField(name)) ok = false;
    });

    const consent = form.elements.consent;
    const consentWrap = consent.closest(".field");
    consentWrap.querySelector(".field-error").textContent = consent.checked
      ? ""
      : "Please accept the terms to continue.";
    consentWrap.classList.toggle("has-error", !consent.checked);
    if (!consent.checked) ok = false;

    if (!ok) {
      const firstError = form.querySelector(".has-error input");
      if (firstError) firstError.focus();
      showToast("Please fix the highlighted fields.");
      return;
    }

    const customer = {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.replace(/[\s-]/g, ""),
      city: form.elements.city.value.trim(),
      state: form.elements.state.value.trim(),
      gstin: form.elements.gstin.value.trim().toUpperCase(),
      notes: form.elements.notes.value.trim()
    };
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));

    // Nothing to charge: unlock the files and send them to the downloads.
    const order = completeOrder(customer);
    if (!order) return;
    location.href = "downloads.html?order=" + encodeURIComponent(order.id);
  });
}

/* ---------- thank-you page ---------- */
function initThankYouPage() {
  const page = document.getElementById("thankyou-page");
  if (!page) return;

  // Razorpay appends its own ids to the redirect URL. They are useful
  // to show back to the buyer for support, and nothing else — access
  // is granted by the webhook, never by this page.
  const params = new URLSearchParams(location.search);
  const paymentId =
    params.get("razorpay_payment_id") || params.get("payment_id") || "";

  const refEl = document.getElementById("payment-ref");
  if (refEl && paymentId) {
    refEl.textContent = paymentId;
    document.getElementById("payment-ref-row").style.display = "";
  }

  // The site is never told which items were paid for, so the cart is
  // left alone and the buyer decides. Guessing would either wipe items
  // they still intend to buy, or leave a cart that looks unbought.
  const lines = cartLines();
  const box = document.getElementById("leftover-cart");
  if (!box || !lines.length) return;

  document.getElementById("leftover-count").textContent =
    `${lines.length} item${lines.length !== 1 ? "s" : ""}`;
  document.getElementById("leftover-names").textContent =
    lines.map((l) => l.product.name).join(", ") +
    ". Clear it if you have paid for everything, or head back to finish the rest.";
  box.style.display = "";

  document.getElementById("clear-cart").addEventListener("click", () => {
    saveCart([]);
    box.style.display = "none";
    showToast("Cart cleared.");
  });
}

/* ---------- contact form (demo, no backend) ---------- */
function initContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    document.getElementById("form-success").classList.add("show");
    form.reset();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  renderStarRows();
  renderFeatured();
  renderBundleCta();
  initShopPage();
  initProductPage();
  initCartPage();
  initCheckoutPage();
  initResults();
  initThankYouPage();
  initContactForm();
  initClaimButtons();
  ensureCartDrawer();
  initDownloadHandlers();
  initDownloadsPage();
});
