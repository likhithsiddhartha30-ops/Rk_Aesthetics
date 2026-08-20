/* =========================================================
   RK AESTHETICS — Site behavior: cart, rendering, interactions
   ========================================================= */

const CART_KEY = "rkaesthetics_cart";

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

/* ---------- cart storage ---------- */
function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartBadge();
}

function addToCart(id, qty) {
  qty = qty || 1;
  const cart = getCart();
  const existing = cart.find((i) => i.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id, qty });
  }
  saveCart(cart);
}

function removeFromCart(id) {
  saveCart(getCart().filter((i) => i.id !== id));
}

function setQty(id, qty) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (item) {
    item.qty = Math.max(1, qty);
    saveCart(cart);
  }
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

function cartLines() {
  return getCart()
    .map((i) => {
      const p = getProduct(i.id);
      return p ? { ...i, product: p } : null;
    })
    .filter(Boolean);
}

function cartSubtotal() {
  return cartLines().reduce((sum, l) => sum + l.product.price * l.qty, 0);
}

/* ---------- library (what the buyer owns) ----------
   A completed order writes its products here, and every download on
   the site is gated on this list. This is client-side only: it proves
   the purchase flow, it is not real access control. Once a payment
   gateway and a backend exist, the library should be issued by the
   server against the paid order.
   -------------------------------------------------- */
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

/* Access is decided by files, not by product id: buying the bundle
   entitles you to every single product inside it too. */
function hasAccess(id) {
  const files = getProductFiles(id);
  if (!files.length) return false;
  const owned = new Set(libraryFiles().map((f) => f.file));
  return files.every((f) => owned.has(f.file));
}

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

/* Files the buyer is entitled to, de-duplicated across overlapping
   purchases — the bundle contains what the singles contain. */
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

/* Records the order, unlocks its products, empties the cart. */
function completeOrder() {
  const lines = cartLines();
  if (!lines.length) return null;

  const total = cartSubtotal();
  const library = getLibrary();
  lines.forEach((l) => {
    if (!library.includes(l.id)) library.push(l.id);
  });
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));

  const order = {
    id: "RK" + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    total: total,
    items: lines.map((l) => ({ id: l.id, name: l.product.name, qty: l.qty }))
  };
  const orders = getOrders();
  orders.unshift(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));

  saveCart([]);
  return order;
}

/* Filename the buyer ends up with on disk. */
function downloadFileName(name) {
  return "RK Aesthetics - " + String(name).replace(/[\/:*?"<>|]/g, "") + ".pdf";
}

/* Browsers ignore the `download` attribute in a few cases (file://
   among them) and hand the PDF to their built-in viewer instead. So
   fetch the file and save it from a blob, which always downloads.
   If the fetch fails, the plain link is left to do its job. */
function initDownloadHandlers() {
  document.addEventListener("click", async (e) => {
    const link = e.target.closest("a[data-download]");
    if (!link || link.dataset.busy) return;

    e.preventDefault();
    const label = link.textContent;
    link.dataset.busy = "1";
    link.textContent = "Preparing…";

    try {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(res.status);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = link.getAttribute("download") || "download.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      window.location.href = link.href;
    } finally {
      link.textContent = label;
      delete link.dataset.busy;
    }
  });
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
  const yearEls = document.querySelectorAll("[data-year]");
  yearEls.forEach((el) => (el.textContent = new Date().getFullYear()));
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
  let sort = "popular";

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
  let qty = 1;

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
        <div class="qty-box">
          <button type="button" id="qty-minus" aria-label="Decrease quantity">&minus;</button>
          <span id="qty-val">1</span>
          <button type="button" id="qty-plus" aria-label="Increase quantity">+</button>
        </div>
        <button class="btn btn-primary" id="add-to-cart">Add to Cart</button>
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

  document.getElementById("qty-minus").addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    document.getElementById("qty-val").textContent = qty;
  });
  document.getElementById("qty-plus").addEventListener("click", () => {
    qty += 1;
    document.getElementById("qty-val").textContent = qty;
  });
  document.getElementById("add-to-cart").addEventListener("click", () => {
    addToCart(p.id, qty);
    showToast(`Added "${p.name}" to cart`);
  });

  renderOwnedBox(p);

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
          <div class="qty-box">
            <button type="button" class="qty-dec" aria-label="Decrease quantity">&minus;</button>
            <span>${l.qty}</span>
            <button type="button" class="qty-inc" aria-label="Increase quantity">+</button>
          </div>
          <button type="button" class="remove">Remove</button>
        </div>
        <span class="line-price">${formatPrice(l.product.price * l.qty)}</span>
      </div>`
      )
      .join("");

    itemsEl.querySelectorAll(".cart-item").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector(".qty-inc").addEventListener("click", () => {
        const item = getCart().find((i) => i.id === id);
        setQty(id, item.qty + 1);
        render();
      });
      row.querySelector(".qty-dec").addEventListener("click", () => {
        const item = getCart().find((i) => i.id === id);
        setQty(id, item.qty - 1);
        render();
      });
      row.querySelector(".remove").addEventListener("click", () => {
        removeFromCart(id);
        render();
      });
    });

    const subtotal = cartSubtotal();
    document.getElementById("sum-subtotal").textContent = formatPrice(subtotal);
    document.getElementById("sum-total").textContent = formatPrice(subtotal);
  }

  document.getElementById("checkout-btn")?.addEventListener("click", () => {
    if (!cartLines().length) return;
    // No gateway yet, so the order completes immediately and the buyer
    // is taken straight to their downloads.
    const order = completeOrder();
    if (!order) return;
    location.href = "downloads.html?order=" + encodeURIComponent(order.id);
  });

  render();
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

/* ---------- owned-product box on the product page ---------- */
function renderOwnedBox(p) {
  const info = document.querySelector(".product-info");
  if (!info || !hasAccess(p.id)) return;

  const viaBundle = !ownsProduct(p.id);
  const box = document.createElement("div");
  box.className = "owned-box";
  box.innerHTML = `
    <h4>${viaBundle ? "Included in a bundle you own — download it below" : "You already own this — download it below"}</h4>
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
        <h3>Order ${order.id} confirmed</h3>
        <p>${order.items.map((i) => i.name).join(", ")} — ${formatPrice(order.total)}. Your files are ready below.</p>`;
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

  // Grouped by the product that was bought, so a bundle reads as a bundle.
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
              <p>${files.length} file${files.length !== 1 ? "s" : ""} · PDF · yours for life</p>
            </div>
          </div>
          <ul class="download-list">${downloadListHTML(files)}</ul>
        </div>`;
    })
    .join("");
}

/* The Downloads link only appears once something has been bought. */
function renderLibraryNav() {
  const owns = getLibrary().length > 0;
  document.querySelectorAll("[data-downloads-link]").forEach((el) => {
    el.style.display = owns ? "" : "none";
  });
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

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  renderLibraryNav();
  initDownloadHandlers();
  renderStarRows();
  renderFeatured();
  initResults();
  initShopPage();
  initProductPage();
  initCartPage();
  initDownloadsPage();
  initContactForm();
});
