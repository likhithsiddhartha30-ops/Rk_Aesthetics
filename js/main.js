/* =========================================================
   RK AESTHETICS / Site behavior

   This is a paid shop. Files are never served from here: a download
   link is issued by the server, signed and short-lived, and only
   against an order Razorpay has confirmed as paid.

   Until CONFIG.FUNCTIONS_BASE is set in js/config.js the payment step
   has nowhere to go, so checkout says payment is opening shortly and
   takes nobody's details any further. Nothing is ever given away.
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

/* ---------- orders this device has paid for ----------
   The order uuid is the buyer's key to their files. It is kept here
   so the downloads page works on a refresh or a later visit, and it
   is the only thing about the purchase this browser stores — the
   files themselves come from the server, signed and short-lived.
   ----------------------------------------------------- */
const ORDERS_KEY = "rkaesthetics_orders";

function getOrders() {
  try {
    return JSON.parse(localStorage.getItem(ORDERS_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function rememberOrder(order) {
  const orders = getOrders().filter((o) => o.id !== order.id);
  orders.unshift(order);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders.slice(0, 20)));
}

/* ---------- talking to the Edge Functions ---------- */
async function callFunction(name, payload) {
  const res = await fetch(functionUrl(name), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  let body = {};
  try {
    body = await res.json();
  } catch (e) {
    /* a non-JSON error page: fall through to the status check */
  }

  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.detail = body.detail;
    err.status = res.status;
    throw err;
  }
  return body;
}

/* Razorpay's checkout script is only needed on the checkout page, so
   it is fetched when payment actually starts rather than on load. */
let razorpayScriptPromise = null;
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CONFIG.RAZORPAY_CHECKOUT_JS;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Could not load the payment window"));
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
}

/* ---------- the payment itself ----------
   create-order prices the cart on the server, Razorpay collects the
   money, verify-payment checks the signature and returns the files.
   Nothing here can unlock a download on its own.
   ---------------------------------------- */
async function payAndCollect(customer, onStage) {
  const stage = onStage || (() => {});

  stage("Setting up your order…");
  const order = await callFunction("create-order", {
    product_ids: getCart().map((i) => i.id),
    full_name: customer.name,
    email: customer.email,
    phone: customer.phone,
    city: customer.city,
    state: customer.state,
    gstin: customer.gstin,
    notes: customer.notes
  });

  stage("Opening the payment window…");
  const Razorpay = await loadRazorpay();

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.razorpay_key_id,
      order_id: order.razorpay_order_id,
      amount: order.amount,
      currency: order.currency,
      name: CONFIG.BRAND_NAME,
      description: `${order.items_label || "Your order"} · ${order.order_number}`,
      prefill: order.prefill,
      notes: { order_id: order.order_id },
      theme: { color: CONFIG.BRAND_COLOR },

      handler: async (response) => {
        try {
          stage("Confirming your payment…");
          const verified = await callFunction("verify-payment", {
            order_id: order.order_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          resolve({ order, verified });
        } catch (err) {
          // The money may well have left their account, so never say
          // the payment failed — point them at support with the id.
          err.paymentTaken = true;
          err.paymentId = response.razorpay_payment_id;
          err.orderId = order.order_id;
          reject(err);
        }
      },

      modal: {
        ondismiss: () => {
          const err = new Error("Payment window closed before paying.");
          err.dismissed = true;
          reject(err);
        }
      }
    });

    rzp.on("payment.failed", (e) => {
      const err = new Error(
        e?.error?.description || "The payment did not go through."
      );
      err.failed = true;
      reject(err);
    });

    rzp.open();
  });
}

/* ---------- downloads page, paid mode ----------
   The files live in a private bucket, so the links are fetched from
   the server each visit and expire fifteen minutes later. Nothing
   here decides who may download what: order-files refuses any order
   that has not actually been paid for.
   ----------------------------------------------- */
function renderPaidDownloads() {
  // Only the downloads page has this markup; every other page calls
  // this and should do nothing.
  if (!document.getElementById("downloads-page")) return;

  const banner = document.getElementById("order-banner");
  const emptyEl = document.getElementById("downloads-empty");
  const listWrap = document.getElementById("downloads-list");

  const known = getOrders();
  const orderId = new URLSearchParams(location.search).get("order") || known[0]?.id;

  // Nothing to ask: with no server configured there are no orders to
  // look up, and a failed request would only confuse people.
  if (!paymentsEnabled() || !orderId) {
    listWrap.style.display = "none";
    emptyEl.style.display = "block";
    return;
  }

  emptyEl.style.display = "none";
  listWrap.style.display = "block";
  listWrap.innerHTML = `<p class="downloads-loading">Fetching your files…</p>`;

  load(orderId);

  async function load(id) {
    try {
      const data = await callFunction("order-files", { order_id: id });

      // Keep it on this device so a later visit still works.
      rememberOrder({
        id: data.order_id,
        number: data.order_number,
        date: data.paid_at,
        total: data.total_inr,
        items: (data.items || []).map((i) => ({
          name: i.product_name,
          price: i.unit_price_inr
        }))
      });

      if (banner) {
        banner.innerHTML = `
          <h3>Order ${data.order_number} confirmed</h3>
          <p>${(data.items || []).map((i) => i.product_name).join(", ")} &middot; ${formatPrice(data.total_inr)} paid. Your files are below.</p>`;
        banner.style.display = "block";
      }

      if (!data.files || !data.files.length) {
        listWrap.innerHTML = `<p class="downloads-loading">This order has no files attached. Please contact support.</p>`;
        return;
      }

      listWrap.innerHTML = `
        <div class="download-group">
          <div class="download-group-head">
            <div>
              <span class="cat">Your files</span>
              <h3>${data.files.length} PDF${data.files.length !== 1 ? "s" : ""}</h3>
              <p>Links stay valid for about fifteen minutes. Reload this page for fresh ones.</p>
            </div>
          </div>
          <ul class="download-list">${serverDownloadListHTML(data.files)}</ul>
        </div>
        ${otherOrdersHTML(id)}`;

      wireOrderSwitch();
    } catch (err) {
      // A payment confirmed a second ago may not have landed yet.
      const notReady = err.status === 404;
      listWrap.innerHTML = `
        <div class="downloads-problem">
          <h3>${notReady ? "Your files are not ready yet" : "We could not load your files"}</h3>
          <p>${escapeAttr(err.detail || err.message)}</p>
          <button type="button" class="btn btn-primary" id="downloads-retry">Try again</button>
          <a class="btn btn-outline" href="${escapeAttr(CONFIG.SUPPORT_PAGE)}">Contact support</a>
          <p class="downloads-ref">Order reference: <b>${escapeAttr(id)}</b></p>
        </div>
        ${otherOrdersHTML(id)}`;

      document
        .getElementById("downloads-retry")
        .addEventListener("click", () => load(id));
      wireOrderSwitch();
    }
  }

  /* The signed URL already carries a filename and an attachment
     header, so a plain link downloads correctly. No blob fetch here:
     the file is on another origin. */
  function serverDownloadListHTML(files) {
    return files
      .map(
        (f) => `
        <li class="download-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
          <span class="download-name">${f.name}</span>
          <a class="btn btn-outline btn-sm" href="${escapeAttr(f.url)}" download="${escapeAttr(f.filename)}" rel="noopener">Download PDF</a>
        </li>`
      )
      .join("");
  }

  function otherOrdersHTML(currentId) {
    const others = getOrders().filter((o) => o.id !== currentId);
    if (!others.length) return "";
    return `
      <div class="other-orders">
        <h4>Earlier orders on this device</h4>
        <ul>
          ${others
            .map(
              (o) => `
            <li>
              <button type="button" data-order="${escapeAttr(o.id)}">
                ${escapeAttr(o.number || o.id)}
                <span>${(o.items || []).map((i) => i.name).join(", ") || "View files"}</span>
              </button>
            </li>`
            )
            .join("")}
        </ul>
      </div>`;
  }

  function wireOrderSwitch() {
    document.querySelectorAll("[data-order]").forEach((btn) => {
      btn.addEventListener("click", () => {
        location.href = "downloads.html?order=" + encodeURIComponent(btn.dataset.order);
      });
    });
  }
}

function renderLibraryNav() {
  const has = getOrders().length > 0;
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
  return `<button type="button" class="${cls}" data-claim="${escapeAttr(p.id)}">Buy now &middot; ${formatPrice(p.price)}</button>`;
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
        <p class="drawer-note">Secure payment &middot; instant download.</p>
        <a href="checkout.html" class="btn btn-primary btn-block">Checkout</a>
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

/* One product, one copy: tells the visitor which happened. */
function addToCartAndOpen(id, name) {
  if (addToCart(id)) {
    openCartDrawer("Added to cart");
  } else {
    openCartDrawer("Already in your cart");
    showToast(`"${name}" is already in your cart. One copy is all you need.`);
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

  document.title = `${p.name} | RK Aesthetics`;

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
        <span class="pay-note">Secure payment by Razorpay. UPI, card or netbanking.</span>
      </div>
      <div class="delivery-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        <div>
          <b>Downloads open the moment your payment clears.</b>
          <span>Pay by UPI, card or netbanking in Razorpay's secure window. This site never sees your card details.</span>
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

  const claimBtn = wrap.querySelector("[data-claim]");
  if (claimBtn) {
    const syncClaimButton = () => {
      claimBtn.innerHTML = inCart(p.id)
        ? "In your cart"
        : `Buy now &middot; ${formatPrice(p.price)}`;
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
   fixed amount, so the page says so plainly and nudges the bundle.
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

  const total = cartSubtotal();
  document.getElementById("checkout-subtotal").textContent = formatPrice(total);
  document.getElementById("checkout-total").textContent = formatPrice(total);

  const payBtn = document.querySelector('.checkout-form button[type="submit"]');
  if (payBtn) payBtn.textContent = `Pay ${formatPrice(total)}`;

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
        : "Enter a valid email. This is where your files are sent.",
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

    if (!paymentsEnabled()) {
      // Razorpay is not connected yet. Say so plainly rather than
      // pretending to take an order, and never hand a file over.
      showPaymentPending(customer);
      return;
    }

    startPayment(customer, submitBtn);
  });

  const submitBtn = form.querySelector('button[type="submit"]');

  /* Payment is not live yet. The details are kept on this device so
     the form fills itself in next time, and nothing else happens. */
  function showPaymentPending(customer) {
    const box = document.getElementById("payment-trouble");
    if (!box) {
      showToast("Payments open shortly. Please check back soon.");
      return;
    }
    box.classList.add("payment-pending");
    box.innerHTML = `
      <h3>Payments open in a few days</h3>
      <p>Card and UPI payment is being set up right now, so this order cannot be completed yet. Your cart is saved on this device, and ${escapeAttr(
        customer.email
      )} is the address we will write to when it goes live.</p>
      <a class="btn btn-primary" href="${escapeAttr(CONFIG.SUPPORT_PAGE)}">Ask to be told when it opens</a>
      <a class="btn btn-outline" href="shop.html">Keep browsing</a>`;
    box.style.display = "block";
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function startPayment(customer, button) {
    const label = button.textContent;
    button.disabled = true;

    try {
      const { order, verified } = await payAndCollect(customer, (msg) => {
        button.textContent = msg;
      });

      // Only the id is kept: the files come from the server each time.
      rememberOrder({
        id: order.order_id,
        number: order.order_number,
        date: new Date().toISOString(),
        total: order.amount / 100,
        customer,
        items: cartLines().map((l) => ({
          id: l.id,
          name: l.product.name,
          price: l.product.price
        }))
      });
      saveCart([]);

      location.href =
        "downloads.html?order=" +
        encodeURIComponent(verified.order_id || order.order_id);
    } catch (err) {
      button.disabled = false;
      button.textContent = label;

      if (err.dismissed) {
        showToast("Payment cancelled. Your cart is still here.");
        return;
      }
      if (err.paymentTaken) {
        // Money may have moved but we could not confirm it. Never
        // imply the payment failed.
        showPaymentTrouble(err);
        return;
      }
      showToast(err.message || "Could not start the payment. Please try again.");
    }
  }

  /* Paid, but we could not confirm it. Give them the reference and a
     way to reach a human rather than a dead end. */
  function showPaymentTrouble(err) {
    const box = document.getElementById("payment-trouble");
    if (!box) {
      showToast("Payment taken but not confirmed. Please contact support.");
      return;
    }
    box.innerHTML = `
      <h3>Your payment went through, but we could not confirm it</h3>
      <p>Nothing is lost. Send us the reference below and we will email your files straight away, usually within the hour.</p>
      <div class="trouble-refs">
        <div><span>Payment reference</span><b>${escapeAttr(err.paymentId || "unknown")}</b></div>
        <div><span>Order reference</span><b>${escapeAttr(err.orderId || "unknown")}</b></div>
      </div>
      <a class="btn btn-primary" href="${escapeAttr(CONFIG.SUPPORT_PAGE)}">Contact support</a>
      <button type="button" class="btn btn-outline" id="retry-files">Try loading my files again</button>`;
    box.style.display = "block";
    box.scrollIntoView({ behavior: "smooth", block: "center" });

    document.getElementById("retry-files").addEventListener("click", () => {
      location.href = "downloads.html?order=" + encodeURIComponent(err.orderId || "");
    });
  }
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
  initContactForm();
  initClaimButtons();
  ensureCartDrawer();
  renderPaidDownloads();
});
