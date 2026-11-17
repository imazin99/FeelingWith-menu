'use strict';

(async function initMenu() {
  const heroSection = document.getElementById('hero-section');
  const brandLogo = document.getElementById('brand-logo');
  const brandName = document.getElementById('brand-name');
  const brandTagline = document.getElementById('brand-tagline');
  const heroViewMenuBtn = document.getElementById('hero-view-menu');
  const heroSpinBtn = document.getElementById('hero-spin-wheel');

  const topSellersSection = document.getElementById('top-sellers-section');
  const topSellersRoot = document.getElementById('top-sellers-root');
  const categoryCardsRoot = document.getElementById('category-cards');
  const categoryNav = document.getElementById('category-nav');
  const menuRoot = document.getElementById('menu-root');
  const searchInput = document.getElementById('menu-search');
  const searchClearBtn = document.getElementById('menu-search-clear');

  const wheelRoot = document.getElementById('wheel-root');
  const quickViewRoot = document.getElementById('quick-view-root');
  const footerContact = document.getElementById('footer-contact');
  const footerSocial = document.getElementById('footer-social');

  let allCategories = [];
  let allProducts = [];
  let searchQuery = '';
  let brandSettings = {};

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Scroll-reveal (category cards, the wheel frame, section titles): a
  // single shared IntersectionObserver toggles .reveal-visible as each
  // element enters the viewport. Elements only ever get the hidden
  // .reveal starting state when motion isn't reduced (see
  // wireScrollReveal below), so there's nothing to disable separately
  // for prefers-reduced-motion — the hidden state is simply never
  // applied.
  let revealObserver = null;
  function wireScrollReveal(elements) {
    if (prefersReducedMotion()) return; // leave elements in their normal, already-visible state
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('reveal-visible');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
    }
    elements.forEach((el) => {
      if (!el) return;
      el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }

  menuRoot.innerHTML = '<div class="menu-state">Loading menu…</div>';

  let settingsRes;
  let categoriesRes;
  let productsRes;
  let topSellersRes;
  try {
    [settingsRes, categoriesRes, productsRes, topSellersRes] = await Promise.all([
      MenuApi.getSettings(),
      MenuApi.getCategories(),
      MenuApi.getProducts(),
      // A separate, already-filtered/sorted call — never derived from
      // allProducts here, so this page never has to guess at "top
      // seller" status on its own. Failure here must not break the rest
      // of the page (see the catch below): the Top Sellers section is an
      // enhancement, not core menu functionality.
      MenuApi.getTopSellers().catch(() => ({ products: [] })),
    ]);
  } catch (err) {
    renderError(err);
    return;
  }

  allCategories = categoriesRes.categories || [];
  allProducts = productsRes.products || [];

  applyBranding(settingsRes.settings || {});
  renderTopSellers(topSellersRes.products || []);
  renderCategoryCards(allCategories, allProducts);
  renderMenu(allCategories, allProducts);
  renderWheel(allProducts);
  wireHeroActions();
  wireSearch();
  wireScrollReveal(document.querySelectorAll('.section-title'));

  // ---------------- Branding ----------------

  function applyBranding(settings) {
    brandSettings = settings || {};
    document.title = settings.cafeName ? `${settings.cafeName} — Menu` : 'Menu';
    // Respect the backend's language/direction contract only — no
    // translation system is introduced, per the brief (section 5).
    document.documentElement.lang = settings.language || 'en';
    document.documentElement.dir = settings.isRtl ? 'rtl' : 'ltr';

    brandName.textContent = settings.cafeName || 'Feeling With';
    if (settings.tagline) {
      brandTagline.textContent = settings.tagline;
      brandTagline.hidden = false;
    }
    if (settings.logoUrl) {
      brandLogo.src = settings.logoUrl;
      brandLogo.hidden = false;
    }

    const contact = settings.contact || {};
    const contactParts = [];
    if (contact.phone) contactParts.push(`<span>${escapeHtml(contact.phone)}</span>`);
    if (contact.email) contactParts.push(`<span>${escapeHtml(contact.email)}</span>`);
    if (contact.address) contactParts.push(`<span>${escapeHtml(contact.address)}</span>`);
    footerContact.innerHTML = contactParts.join('');

    const social = settings.socialLinks || {};
    const socialEntries = [
      social.instagram ? { label: 'Instagram', url: social.instagram } : null,
      social.facebook ? { label: 'Facebook', url: social.facebook } : null,
      social.tiktok ? { label: 'TikTok', url: social.tiktok } : null,
      social.website ? { label: 'Website', url: social.website } : null,
    ].filter(Boolean);
    footerSocial.innerHTML = socialEntries
      .map(
        (s) =>
          `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`
      )
      .join('');
  }

  // ---------------- Hero actions ----------------

  function wireHeroActions() {
    heroViewMenuBtn.addEventListener('click', () => {
      document.getElementById('menu-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    heroSpinBtn.addEventListener('click', () => {
      document.getElementById('wheel-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ---------------- Top Sellers ----------------
  //
  // Manually-curated (owner-approved enhancement): `products` here is
  // already the server's final, filtered/sorted Top Sellers list — this
  // function only renders it. Nothing here computes, estimates, or
  // implies a sales/popularity ranking; the section and badge copy say
  // "Top Sellers" / "Best Seller" as a curated label only.
  function renderTopSellers(products) {
    if (!products || products.length === 0) {
      topSellersSection.hidden = true;
      return;
    }
    topSellersSection.hidden = false;

    topSellersRoot.innerHTML = `
      <div class="top-sellers-track">
        ${products.map(topSellerCardHtml).join('')}
      </div>
    `;

    const cardEls = Array.from(topSellersRoot.querySelectorAll('.product-card'));
    cardEls.forEach((card) => {
      card.addEventListener('click', () => {
        const product = products.find((p) => p.id === card.dataset.id);
        if (product) openQuickView(product);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
    wireScrollReveal([topSellersSection.querySelector('.section-title'), topSellersRoot]);
  }

  function topSellerCardHtml(p) {
    const unavailable = !p.isAvailable;
    return `
      <article class="product-card top-seller-card ${unavailable ? 'is-unavailable' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(p.name)}">
        <div class="product-image-wrap">
          ${
            p.imageUrl
              ? `<img class="product-image" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" loading="lazy" />`
              : '<div class="product-image-placeholder">No image</div>'
          }
          <span class="badge-bestseller"><span class="badge-bestseller-star" aria-hidden="true">&#9733;</span> Best Seller</span>
          ${unavailable ? '<span class="badge-soldout">Sold Out</span>' : ''}
        </div>
        <div class="product-body">
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          ${priceSummaryHtml(p)}
        </div>
      </article>
    `;
  }

  // ---------------- Category cards ----------------

  // Owner-approved enhancement: each category now manages its own image
  // independently (admin dashboard, Category edit form) rather than
  // borrowing whichever product happens to have one. If a category has no
  // image of its own, fall back to an elegant monogram tile (below) —
  // never silently reuse a product's image.
  function renderCategoryCards(categories, products) {
    if (categories.length === 0) {
      categoryCardsRoot.innerHTML = '<p class="menu-section-empty">No categories available right now.</p>';
      return;
    }
    categoryCardsRoot.innerHTML = categories
      .map((c) => {
        const img = c.imageUrl || null;
        const itemCount = products.filter((p) => p.categoryId === c.id).length;
        return `
          <button type="button" class="category-card" data-target="cat-${c.id}">
            <span class="category-card-media" ${img ? `style="background-image:url('${escapeHtml(img)}')"` : ''}>
              ${img ? '' : '<span class="category-card-media-fallback">' + escapeHtml(c.name.charAt(0).toUpperCase()) + '</span>'}
            </span>
            <span class="category-card-body">
              <span class="category-card-name">${escapeHtml(c.name)}</span>
              <span class="category-card-count">${itemCount} item${itemCount === 1 ? '' : 's'}</span>
            </span>
          </button>
        `;
      })
      .join('');

    const cardEls = Array.from(categoryCardsRoot.querySelectorAll('.category-card'));
    cardEls.forEach((btn, i) => {
      // A small stagger so cards entering together don't all pop in at
      // once; harmless when reduced-motion skips the reveal entirely,
      // since the transition-delay then has nothing to delay.
      btn.style.transitionDelay = `${Math.min(i, 7) * 45}ms`;
      btn.addEventListener('click', () => {
        document.getElementById('menu-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Scroll to the specific section once the browser has had a beat
        // to lay out the now-visible menu section.
        requestAnimationFrame(() => {
          const target = document.getElementById(btn.dataset.target);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    });
    wireScrollReveal(cardEls);
  }

  // ---------------- Search ----------------

  function wireSearch() {
    const handleInput = debounce(() => {
      searchQuery = searchInput.value.trim().toLowerCase();
      searchClearBtn.hidden = searchQuery === '';
      renderMenu(allCategories, allProducts);
    }, 150);
    searchInput.addEventListener('input', handleInput);
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClearBtn.hidden = true;
      renderMenu(allCategories, allProducts);
      searchInput.focus();
    });
  }

  function matchesSearch(product) {
    if (!searchQuery) return true;
    const haystack = `${product.name} ${product.description || ''}`.toLowerCase();
    return haystack.includes(searchQuery);
  }

  // ---------------- Menu sections / product grid ----------------

  function renderMenu(categories, products) {
    if (categories.length === 0) {
      categoryNav.innerHTML = '';
      menuRoot.innerHTML = '<div class="menu-state">The menu is not available right now. Please check back soon.</div>';
      return;
    }

    const filtered = products.filter(matchesSearch);

    const byCategory = new Map(categories.map((c) => [c.id, []]));
    filtered.forEach((p) => {
      const list = byCategory.get(p.categoryId);
      if (list) list.push(p);
    });

    const categoriesWithItems = categories.filter((c) => (byCategory.get(c.id) || []).length > 0);

    categoryNav.innerHTML = categories
      .map((c) => `<button type="button" class="cat-pill" data-target="cat-${c.id}">${escapeHtml(c.name)}</button>`)
      .join('');
    categoryNav.querySelectorAll('.cat-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    if (searchQuery && categoriesWithItems.length === 0) {
      menuRoot.innerHTML = `
        <div class="menu-state">
          <p>No menu items match "${escapeHtml(searchQuery)}".</p>
          <button type="button" class="retry-btn" id="search-no-results-clear">Clear Search</button>
        </div>
      `;
      const clearBtn = document.getElementById('search-no-results-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          searchInput.value = '';
          searchQuery = '';
          searchClearBtn.hidden = true;
          renderMenu(allCategories, allProducts);
        });
      }
      return;
    }

    menuRoot.innerHTML = categories
      .map((c) => {
        const items = byCategory.get(c.id) || [];
        if (searchQuery && items.length === 0) return ''; // hide empty sections while searching
        return `
          <section class="menu-section" id="cat-${c.id}">
            <h2 class="menu-section-title">${escapeHtml(c.name)}</h2>
            ${
              items.length === 0
                ? '<p class="menu-section-empty">No items in this category yet.</p>'
                : `<div class="product-grid">${items.map(productCardHtml).join('')}</div>`
            }
          </section>
        `;
      })
      .join('');

    menuRoot.querySelectorAll('.product-card').forEach((card) => {
      card.addEventListener('click', () => {
        const product = allProducts.find((p) => p.id === card.dataset.id);
        if (product) openQuickView(product);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
  }

  function priceSummaryHtml(p) {
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
    // Brief: "Never assume a product has a fixed price if it uses
    // variants" — each variant keeps its own price; the top-level `price`
    // is only used when there are no variants at all.
    if (hasVariants) {
      const fromPrice = Math.min(...p.variants.map((v) => v.price));
      return `<div class="fixed-price">From ${Money.formatEgp(fromPrice)}</div>`;
    }
    return `<div class="fixed-price">${Money.formatEgp(p.price)}</div>`;
  }

  function productCardHtml(p) {
    const unavailable = !p.isAvailable;
    return `
      <article class="product-card ${unavailable ? 'is-unavailable' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(p.name)}">
        <div class="product-image-wrap">
          ${
            p.imageUrl
              ? `<img class="product-image" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" loading="lazy" />`
              : '<div class="product-image-placeholder">No image</div>'
          }
          ${unavailable ? '<span class="badge-soldout">Sold Out</span>' : ''}
        </div>
        <div class="product-body">
          <h3 class="product-name">${escapeHtml(p.name)}</h3>
          ${priceSummaryHtml(p)}
        </div>
      </article>
    `;
  }

  // ---------------- Quick View modal ----------------

  function openQuickView(p) {
    const unavailable = !p.isAvailable;
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;

    const priceHtml = hasVariants
      ? `<ul class="variant-list">${p.variants
          .map(
            (v) => `<li class="${v.isAvailable ? '' : 'is-unavailable-row'}">
              <span>${escapeHtml(v.name)}</span>
              <span>${Money.formatEgp(v.price)}${v.isAvailable ? '' : ' <em>(Unavailable)</em>'}</span>
            </li>`
          )
          .join('')}</ul>`
      : `<div class="fixed-price">${Money.formatEgp(p.price)}</div>`;

    const addOnsHtml =
      Array.isArray(p.addOns) && p.addOns.length > 0
        ? `<div class="addon-list">
            <span class="addon-label">Add-ons</span>
            <ul>
              ${p.addOns
                .map(
                  (a) => `<li class="${a.isAvailable ? '' : 'is-unavailable-row'}">
                    <span>${escapeHtml(a.name)}</span>
                    <span>${Money.formatEgp(a.price)}${a.isAvailable ? '' : ' <em>(Unavailable)</em>'}</span>
                  </li>`
                )
                .join('')}
            </ul>
          </div>`
        : '';

    quickViewRoot.innerHTML = `
      <div class="qv-overlay" id="qv-overlay">
        <div class="qv-modal" role="dialog" aria-modal="true" aria-labelledby="qv-title">
          <button type="button" class="qv-close" id="qv-close" aria-label="Close">&times;</button>
          <div class="qv-image-wrap">
            ${
              p.imageUrl
                ? `<img class="qv-image" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" />`
                : '<div class="product-image-placeholder qv-image">No image</div>'
            }
            ${unavailable ? '<span class="badge-soldout">Sold Out</span>' : ''}
          </div>
          <div class="qv-body">
            <h3 id="qv-title" class="qv-name">${escapeHtml(p.name)}</h3>
            ${p.description ? `<p class="qv-desc">${escapeHtml(p.description)}</p>` : ''}
            ${priceHtml}
            ${addOnsHtml}
          </div>
        </div>
      </div>
    `;

    const overlay = document.getElementById('qv-overlay');
    const closeBtn = document.getElementById('qv-close');

    function close() {
      quickViewRoot.innerHTML = '';
      document.removeEventListener('keydown', onKeydown);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onKeydown);
    closeBtn.focus();
  }

  // Exposed so the wheel's result panel can open the same Quick View.
  window.__openQuickView = openQuickView;

  // ---------------- Error state ----------------

  function renderError(err) {
    categoryCardsRoot.innerHTML = '';
    categoryNav.innerHTML = '';
    heroSection.querySelector('.hero-actions').style.display = 'none';
    menuRoot.innerHTML = `
      <div class="menu-state menu-state-error">
        <p>We could not load the menu right now.</p>
        <p class="menu-error-detail">${escapeHtml(err.message)}</p>
        <button type="button" class="retry-btn" id="menu-retry-btn">Try Again</button>
      </div>
    `;
    const retryBtn = document.getElementById('menu-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
  }

  // ==================== Recommendation Wheel ====================

  function renderWheel(products) {
    // Eligibility (brief section 4): visible, non-archived, AVAILABLE
    // products only. The products array here already excludes hidden/
    // archived products and products in hidden/archived categories (the
    // public API's own filtering, confirmed by reading
    // publicMenuController.js) — the only extra filter needed on top of
    // that is isAvailable. No add-ons as entries; no duplicates possible
    // since each product id is unique.
    const eligible = products.filter((p) => p.isAvailable);

    if (eligible.length === 0) {
      wheelRoot.innerHTML = '<div class="menu-state">Nothing to spin right now — check back once more items are on the menu!</div>';
      return;
    }

    const logoUrl = brandSettings.logoUrl || '';
    wheelRoot.innerHTML = `
      <div class="wheel-stage reveal">
        <div class="wheel-pointer" aria-hidden="true"></div>
        <div class="wheel-frame">
          <div class="wheel-bolts" id="wheel-bolts" aria-hidden="true"></div>
          <div class="wheel-backing">
            <div class="wheel-canvas-mask">
              <canvas id="wheel-canvas" width="320" height="320" class="wheel-canvas"></canvas>
            </div>
          </div>
          <div class="wheel-hub" aria-hidden="true">
            ${
              logoUrl
                ? `<img class="wheel-hub-logo" src="${escapeHtml(logoUrl)}" alt="" />`
                : `<span class="wheel-hub-fallback">${escapeHtml((brandSettings.cafeName || 'FW').charAt(0).toUpperCase())}</span>`
            }
          </div>
        </div>
      </div>
      ${eligible.length === 1 ? '<p class="wheel-note">Only one item is available to spin for right now.</p>' : ''}
      <button type="button" class="hero-btn hero-btn-primary wheel-spin-btn" id="wheel-spin-btn">Spin the Wheel</button>
      <div id="wheel-result" class="wheel-result" hidden></div>
    `;

    const canvas = document.getElementById('wheel-canvas');
    const ctx = canvas.getContext('2d');
    const spinBtn = document.getElementById('wheel-spin-btn');
    const resultPanel = document.getElementById('wheel-result');
    const stageEl = wheelRoot.querySelector('.wheel-stage');
    const pointerEl = wheelRoot.querySelector('.wheel-pointer');

    // Final palette for the wheel specifically (brief's Round D
    // palette): segments alternate Primary Burgundy and Warm Cream,
    // with gold dividers; text color flips per-segment for contrast.
    const SEGMENT_DARK = '#260707'; // Primary Burgundy
    const SEGMENT_LIGHT = '#f8f3ea'; // Warm Cream
    const DIVIDER_GOLD = '#d9a441';
    const TEXT_ON_DARK = '#f1d28a'; // Light Gold, on burgundy segments
    const TEXT_ON_LIGHT = '#260707'; // Primary Burgundy, on cream segments
    const anglePerSegment = (Math.PI * 2) / eligible.length;

    renderBolts();
    drawWheel();
    wireScrollReveal([stageEl]);

    let currentRotationDeg = 0;
    let spinning = false;

    spinBtn.addEventListener('click', () => {
      if (spinning) return; // prevent repeated clicks while spinning
      spinning = true;
      spinBtn.disabled = true;
      resultPanel.hidden = true;

      const chosenIndex = WheelMath.pickRandomIndex(eligible.length);
      const chosen = eligible[chosenIndex];

      const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const extraSpins = reducedMotion ? 0 : 6;

      // Shared, independently unit-tested math (public/js/wheelMath.js,
      // tests/unit/wheelMath.test.js) — the amount of rotation to ADD to
      // the wheel's current total rotation so the chosen segment's
      // center lands exactly under the fixed top pointer. This is a
      // genuine computation from the chosen index, not a cosmetic
      // animation unrelated to the result.
      const newRotationDeg = WheelMath.computeSpinRotation({
        currentRotationDeg,
        chosenIndex,
        segmentCount: eligible.length,
        extraSpins,
      });

      // A slightly punchier start with a long, smooth glide into the
      // stop (rather than a near-linear middle) — purely a feel
      // refinement; the landing angle itself (newRotationDeg, computed
      // above from the chosen index) is completely unaffected, so the
      // winner is always exactly whichever segment sits under the
      // pointer when the wheel stops.
      canvas.style.transition = reducedMotion ? 'transform 0.05s linear' : 'transform 4.4s cubic-bezier(0.08, 0.72, 0.1, 1)';
      canvas.style.transform = `rotate(${newRotationDeg}deg)`;
      pointerEl?.classList.remove('wheel-pointer-land');

      const onDone = () => {
        canvas.removeEventListener('transitionend', onDone);
        // Normalize back to an equivalent small angle so the rotation
        // value never grows without bound across many spins — purely a
        // housekeeping snap, applied with no transition, so it is
        // visually identical to where the wheel already is.
        currentRotationDeg = newRotationDeg % 360;
        canvas.style.transition = 'none';
        canvas.style.transform = `rotate(${currentRotationDeg}deg)`;
        void canvas.offsetHeight; // force reflow so the next transition re-applies
        spinning = false;
        spinBtn.disabled = false;
        // A brief, purely cosmetic "landing" pulse on the fixed pointer —
        // never applied under reduced motion, and never something the
        // winner (already decided above) depends on.
        if (!reducedMotion && pointerEl) {
          pointerEl.classList.add('wheel-pointer-land');
          pointerEl.addEventListener('animationend', () => pointerEl.classList.remove('wheel-pointer-land'), { once: true });
        }
        showResult(chosen);
      };
      canvas.addEventListener('transitionend', onDone);
    });

    // Fixed-count decorative bolts/studs around the gold frame, matching
    // the reference image's structural detail (not its colors). Count
    // and radius are fixed — independent of how many products there
    // are — so this never needs to change with the data.
    function renderBolts() {
      const boltsRoot = document.getElementById('wheel-bolts');
      if (!boltsRoot) return;
      const BOLT_COUNT = 12;
      const RADIUS_PCT = 6.5; // distance from center, as % of the frame box
      let html = '';
      for (let i = 0; i < BOLT_COUNT; i++) {
        const angle = (i / BOLT_COUNT) * Math.PI * 2;
        const leftPct = 50 + (50 - RADIUS_PCT) * Math.sin(angle);
        const topPct = 50 - (50 - RADIUS_PCT) * Math.cos(angle);
        html += `<span class="wheel-bolt" style="left:${leftPct}%;top:${topPct}%"></span>`;
      }
      boltsRoot.innerHTML = html;
    }

    function drawWheel() {
      const size = canvas.width;
      const radius = size / 2;
      ctx.clearRect(0, 0, size, size);

      // Fewer eligible products means each segment is visually much
      // bigger — a slightly bolder label suits that better than the same
      // small text used for a crowded 10-segment wheel. The actual
      // amount of a name that fits is computed per-label below with
      // ctx.measureText (never a fixed character count): the constraint
      // is the fixed radial gap between the rim and the center hub
      // (innerBound), which does not grow with fewer segments, so a
      // bigger font would otherwise risk the text running into the hub.
      const count = eligible.length;
      const fontPx = count <= 3 ? 14 : count <= 6 ? 13 : 12;
      const innerBound = radius * 0.34;

      eligible.forEach((p, i) => {
        const start = -Math.PI / 2 + i * anglePerSegment;
        const end = start + anglePerSegment;
        const isDark = i % 2 === 0; // alternate Burgundy / Warm Cream
        ctx.beginPath();
        ctx.moveTo(radius, radius);
        ctx.arc(radius, radius, radius - 4, start, end);
        ctx.closePath();
        ctx.fillStyle = isDark ? SEGMENT_DARK : SEGMENT_LIGHT;
        ctx.fill();
        ctx.strokeStyle = DIVIDER_GOLD;
        ctx.lineWidth = 2;
        ctx.stroke();

        // A thin accent arc partway out each segment — mainly so a
        // 2-or-3-segment wheel (huge, otherwise near-featureless wedges)
        // reads as a deliberately-designed ring rather than a couple of
        // flat color blocks. Subtle: a single hairline, not a pattern.
        ctx.beginPath();
        ctx.arc(radius, radius, radius * 0.62, start + 0.03, end - 0.03);
        ctx.strokeStyle = isDark ? 'rgba(241, 210, 138, 0.35)' : 'rgba(38, 7, 7, 0.16)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label, rotated to sit along the segment's own radius, with
        // text color chosen for contrast against that segment's fill.
        // Canvas angle 0 = east, increasing clockwise (y-down): a label
        // whose rotation falls in the circle's left half (normalized
        // angle between 90° and 270°) would otherwise render mirrored/
        // upside-down to the viewer, so that half gets an extra 180°
        // flip (and its anchor mirrored to match) to stay upright and
        // readable, while still ending at the same point near the rim.
        const angle = start + anglePerSegment / 2;
        const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const flipped = normalized > Math.PI / 2 && normalized < Math.PI * 1.5;
        ctx.save();
        ctx.translate(radius, radius);
        ctx.rotate(flipped ? angle + Math.PI : angle);
        ctx.textAlign = flipped ? 'left' : 'right';
        ctx.fillStyle = isDark ? TEXT_ON_DARK : TEXT_ON_LIGHT;
        ctx.font = `600 ${fontPx}px "Segoe UI", Tahoma, sans-serif`;
        const edgeX = radius - 14;
        const maxTextWidth = edgeX - innerBound;
        let label = p.name;
        if (ctx.measureText(label).width > maxTextWidth) {
          while (label.length > 2 && ctx.measureText(`${label}…`).width > maxTextWidth) {
            label = label.slice(0, -1);
          }
          label = `${label.trimEnd()}…`;
        }
        ctx.fillText(label, flipped ? -edgeX : edgeX, flipped ? -4 : 4);
        ctx.restore();
      });
    }

    function showResult(p) {
      const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
      const priceHtml = hasVariants
        ? `<div class="fixed-price">From ${Money.formatEgp(Math.min(...p.variants.map((v) => v.price)))}</div>`
        : `<div class="fixed-price">${Money.formatEgp(p.price)}</div>`;

      resultPanel.innerHTML = `
        <div class="wheel-result-card">
          <div class="product-image-wrap wheel-result-image">
            ${
              p.imageUrl
                ? `<img class="product-image" src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" />`
                : '<div class="product-image-placeholder">No image</div>'
            }
          </div>
          <div class="product-body">
            <h3 class="product-name">${escapeHtml(p.name)}</h3>
            ${p.description ? `<p class="product-desc wheel-result-desc">${escapeHtml(p.description)}</p>` : ''}
            ${priceHtml}
          </div>
          <div class="wheel-result-actions">
            <button type="button" class="hero-btn hero-btn-secondary" id="wheel-view-details">View Details</button>
            <button type="button" class="hero-btn hero-btn-primary" id="wheel-spin-again">Spin Again</button>
          </div>
        </div>
      `;
      resultPanel.hidden = false;
      // A tasteful reveal animation on the result card itself — never
      // applied under prefers-reduced-motion, so there is no motion to
      // suppress rather than relying on the CSS media query alone.
      const card = resultPanel.querySelector('.wheel-result-card');
      if (card && !prefersReducedMotion()) {
        card.classList.add('wheel-result-reveal');
      }
      resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      document.getElementById('wheel-view-details').addEventListener('click', () => window.__openQuickView(p));
      document.getElementById('wheel-spin-again').addEventListener('click', () => spinBtn.click());
    }
  }
})();
