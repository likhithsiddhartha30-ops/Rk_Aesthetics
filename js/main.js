/* =========================================================
   RK AESTHETICS — Site behavior

   Selling model: each product has its own Razorpay Payment Link.
   The buyer pays on Razorpay's hosted page and the files are emailed
   to them by an automation listening to Razorpay's webhook.

   The cart and checkout are a shopping convenience only: no money is
   handled here and no API keys exist in this project. Checkout hands
   the buyer to Razorpay, one hosted page per product.
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
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
}

/* ---------- buy button ----------
   Sends the buyer to that product's Razorpay Payment Link. Products
   without a link yet are shown as unavailable rather than dropping
   someone onto a dead page.
   -------------------------------- */
function buyButtonHTML(p, extraClass) {
  const link = getPaymentLink(p.id);
  const cls = "btn btn-primary" + (extraClass ? " " + extraClass : "");

  if (!link) {
    return `<button type="button" class="${cls}" data-buy-unavailable>Coming soon</button>`;
  }
  return `<a class="${cls}" href="${escapeAttr(link)}" data-buy="${escapeAttr(p.id)}">
      Buy now — ${formatPrice(p.price)}
    </a>`;
}

function initBuyButtons(root) {
  (root || document).querySelectorAll("[data-buy-unavailable]").forEach((btn) => {
    btn.addEventListener("click", () => {
      showToast("This one isn't on sale yet — check back shortly.");
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
        <p class="drawer-note">Paid on Razorpay · emailed straight after.</p>
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
        ${buyButtonHTML(p, "btn-lg")}
        <button type="button" class="btn btn-outline" id="add-to-cart">Add to Cart</button>
      </div>
      <div class="delivery-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg>
        <div>
          <b>Emailed to you straight after payment.</b>
          <span>You pay on Razorpay's secure page — UPI, card or netbanking — and the files land in your inbox within a couple of minutes.</span>
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

  initBuyButtons(wrap);

  const addBtn = document.getElementById("add-to-cart");
  function syncAddButton() {
    addBtn.textContent = inCart(p.id) ? "In your cart" : "Add to Cart";
  }
  syncAddButton();
  addBtn.addEventListener("click", () => addToCartAndOpen(p.id, p.name));
  document.addEventListener("cart:changed", syncAddButton);

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
  if (bundle) slot.innerHTML = buyButtonHTML(bundle, "btn-lg");
  initBuyButtons(slot);
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

/* Compares the cart against the bundle and says only what is true. */
function bundleNudgeHTML(lines) {
  const bundle = getProduct("executive-body-system");
  if (!bundle || lines.length < 2) return "";
  if (lines.some((l) => l.id === bundle.id)) return "";

  const subtotal = lines.reduce((sum, l) => sum + l.product.price, 0);
  const extra = bundle.price - subtotal;
  const others = 9 - lines.length;

  const pitch =
    extra <= 0
      ? `All nine systems are ${formatPrice(bundle.price)} — ${formatPrice(-extra)} less than the ${lines.length} in your cart, in one payment.`
      : `All nine systems are ${formatPrice(bundle.price)}. That is ${formatPrice(extra)} more than your ${lines.length}, for ${others} systems you would not otherwise get — and one payment instead of ${lines.length}.`;

  return `
    <div class="pay-nudge">
      <b>Worth a look before you pay</b>
      <p>${pitch}</p>
      <a class="link-under" href="product.html?id=executive-body-system">See the bundle</a>
    </div>`;
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

  const total = cartSubtotal();
  document.getElementById("checkout-subtotal").textContent = formatPrice(total);
  document.getElementById("checkout-total").textContent = formatPrice(total);
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

  /* ---- hand off to Razorpay ---- */
  const payList = document.getElementById("pay-list");

  function renderPayList() {
    payList.innerHTML = `
      <h3>Pay for each product</h3>
      <p class="pay-list-note">Each product has its own secure Razorpay page, so they are paid one at a time. Every payment sends its own delivery email, and opening them in a new tab keeps this list here.</p>
      ${lines
        .map(
          (l) => `
        <div class="pay-row">
          <div>
            <b>${l.product.name}</b>
            <span>${formatPrice(l.product.price)}</span>
          </div>
          <a class="btn btn-primary btn-sm" href="${escapeAttr(getPaymentLink(l.id))}" target="_blank" rel="noopener">Pay ${formatPrice(l.product.price)}</a>
        </div>`
        )
        .join("")}
      ${bundleNudgeHTML(lines)}`;
    payList.style.display = "block";
    payList.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

    localStorage.setItem(
      CUSTOMER_KEY,
      JSON.stringify({
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.replace(/[\s-]/g, ""),
        city: form.elements.city.value.trim(),
        state: form.elements.state.value.trim(),
        gstin: form.elements.gstin.value.trim().toUpperCase(),
        notes: form.elements.notes.value.trim()
      })
    );

    // Every product must actually be on sale before we send anyone off.
    const missing = lines.filter((l) => !getPaymentLink(l.id));
    if (missing.length) {
      showToast(`${missing[0].product.name} is not on sale yet — remove it to continue.`);
      return;
    }

    if (lines.length === 1) {
      location.href = getPaymentLink(lines[0].id);
      return;
    }
    renderPayList();
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
  initBuyButtons();
  ensureCartDrawer();
});
