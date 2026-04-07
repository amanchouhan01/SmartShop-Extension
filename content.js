// content.js — SmartShop India v3.0 — Vision + Link powered price comparison

const STORE_CONFIGS = {
  'amazon.in': {
    productCard: '[data-component-type="s-search-result"], .s-result-item[data-asin]',
    name: 'h2 span, .a-size-medium, .a-size-base-plus',
    price: '.a-price .a-offscreen, .a-color-price',
    image: 'img.s-image, img[data-image-index]',
    link: 'h2 a, a.a-link-normal[href*="/dp/"]',
    getSku: (card) => card.dataset.asin || card.closest('[data-asin]')?.dataset.asin || '',
    detailName: '#productTitle',
    detailPrice: '.a-price .a-offscreen, .apexPriceToPay .a-offscreen, #priceblock_ourprice',
    detailImage: '#landingImage, #imgBlkFront, #main-image',
    detailSku: () => { const m = location.pathname.match(/\/dp\/([A-Z0-9]{10})/); return m ? m[1] : ''; },
  },
  'flipkart.com': {
    productCard: '._1AtVbE, ._13oc-S, .tUxRFH, .DOjaWF, .cPHDOP',
    name: '._4rR01T, .s1Q9rs, .IRpwTa, .WKTcLC, .KzDlHZ',
    price: '._30jeq3, ._1_WHN1, .Nx9bqj, ._16Jk6d',
    image: 'img._396cs4, img._2r_T1I, img[class*="product"]',
    link: 'a._1fQZEK, a.IRpwTa, a[href*="/p/"]',
    getSku: () => '',
    detailName: '.B_NuCI, h1.yhB1nd, ._35KyD6',
    detailPrice: '._30jeq3, ._16Jk6d, ._25b18c ._30jeq3',
    detailImage: 'img._396cs4, img._2r_T1I, .CXW8mj img',
    detailSku: () => '',
  },
  'myntra.com': {
    productCard: '.product-base, li.product-imageSlider',
    name: '.product-brand, .product-product',
    price: '.product-price strong',
    image: 'img.img-responsive, .product-imageSlider img',
    link: 'a.product-base, a[href*="/buy"]',
    getSku: () => '',
    detailName: 'h1.pdp-name, .pdp-title, h1.title-name',
    detailPrice: '.pdp-price strong, .pdp-mrp strong',
    detailImage: 'img.image-grid-image, .image-grid-col img',
    detailSku: () => { const m = location.pathname.match(/(\d{7,})/); return m ? m[1] : ''; },
  },
  'meesho.com': {
    productCard: 'div[class*="ProductList__GridCol"], div[class*="NewProductCard"], div[class*="ProductCard"]',
    name: 'p[class*="ProductTitle"], h5, p[class*="productName"]',
    price: 'h5[class*="NewPrice"], p[class*="price"], h5[class*="price"]',
    image: 'img[class*="NewProductCard"], img[class*="product"]',
    link: 'a[href*="/product"]',
    getSku: () => '',
    detailName: 'span[class*="ProductTitle"], h1, p[class*="name"]',
    detailPrice: 'h4[class*="price"], span[class*="price"]',
    detailImage: 'img[class*="carousel"], img[class*="product"]',
    detailSku: () => '',
  },
  'nykaa.com': {
    productCard: '.productWrapper, div[class*="productCard"], div[class*="product-list"] > div',
    name: '.css-xrzmfa, .productName, p[class*="productName"]',
    price: 'span[class*="price"], .css-111z9ua, span[class*="Price"]',
    image: 'img[class*="product"], img[class*="css"]',
    link: 'a[href*="/p/"]',
    getSku: () => '',
    detailName: 'h1[class*="productName"], .css-1gc4x7i',
    detailPrice: 'span[class*="price"], div[class*="price"]',
    detailImage: 'img[class*="product"], .pdp-img img',
    detailSku: () => '',
  },
  'snapdeal.com': {
    productCard: '.product-tuple-listing, .product-item',
    name: '.product-title, p.product-title',
    price: '.product-price, .payBlkBig',
    image: 'img.product-image, img[class*="product"]',
    link: 'a.dp-widget-link, a[href*="/product"]',
    getSku: () => '',
    detailName: 'h1.pdp-e-i-head, .pdName',
    detailPrice: '.payBlkBig, .pdp-final-price',
    detailImage: 'img#landingImage, img.cloudzoom',
    detailSku: () => '',
  },
  'ajio.com': {
    productCard: '.item, .rilrtl-products-list__item',
    name: '.nameCls, .brand, h2.nameCls',
    price: '.price strong, .trail, span[class*="price"]',
    image: 'img.rilrtl-lazy-img, img[class*="rilrtl"]',
    link: 'a[href*="/p/"]',
    getSku: () => '',
    detailName: 'h1.prod-name, .prod-brand',
    detailPrice: '.prod-sp, span[class*="prod-sp"]',
    detailImage: 'img.rilrtl-lazy-img, .product-img img',
    detailSku: () => '',
  },
  'tatacliq.com': {
    productCard: '.ProductModule__product-grid-item, li[class*="product"]',
    name: '.ProductModule__product-title, p[class*="title"]',
    price: '.ProductModule__price, span[class*="price"]',
    image: 'img[class*="ProductModule"], img[class*="product"]',
    link: 'a[href*="/p-"]',
    getSku: () => '',
    detailName: 'h1[class*="ProductDetailsMainCard"], h1[class*="title"]',
    detailPrice: 'span[class*="price"], p[class*="price"]',
    detailImage: 'img[class*="ProductImage"], .product-img img',
    detailSku: () => '',
  },
  'croma.com': {
    productCard: 'li.product-item, .product-list-item',
    name: 'h3.product-title, .product-name, a.product-title',
    price: 'span.amount, .pdpPrice, span[class*="price"]',
    image: 'img.product-img, img[class*="product"]',
    link: 'a.product-title, a[href*="/p/"]',
    getSku: () => '',
    detailName: 'h1.pdp-title, h1[class*="product-title"]',
    detailPrice: 'span.amount, .pdpPrice',
    detailImage: 'img#product-image, .pdp-img img',
    detailSku: () => '',
  },
  'reliancedigital.in': {
    productCard: 'div[class*="product"], li[class*="product"]',
    name: 'p[class*="name"], .sp__name, h2[class*="name"]',
    price: 'span[class*="price"], .sp__price',
    image: 'img[class*="product"], img[class*="Product"]',
    link: 'a[href*="/p/"]',
    getSku: () => '',
    detailName: 'h1[class*="pdp"], p[class*="name"]',
    detailPrice: 'span[class*="price"]',
    detailImage: 'img[class*="product"], .pdp-img img',
    detailSku: () => '',
  },
  'jiomart.com': {
    productCard: '.plp-card-wrapper, div[class*="product-item"]',
    name: '.plp-card-details-name, p[class*="name"]',
    price: '.plp-card-details-price, span[class*="price"]',
    image: 'img[class*="plp"], img[class*="product"]',
    link: 'a[href*="/p/"]',
    getSku: () => '',
    detailName: 'h1[class*="product-name"], h1[class*="pdp"]',
    detailPrice: 'span[class*="price"], div[class*="price"]',
    detailImage: 'img[class*="product"], .pdp-img img',
    detailSku: () => '',
  },
  'bigbasket.com': {
    productCard: 'li[class*="product-item"], div[class*="SKUDeck"]',
    name: 'span[class*="product-desc"], div[class*="Description"]',
    price: 'span[class*="discounted"], div[class*="discounted-price"]',
    image: 'img[class*="product"], img[class*="SKU"]',
    link: 'a[href*="/pd/"]',
    getSku: () => '',
    detailName: 'h1[class*="product-head"], h1[class*="Heading"]',
    detailPrice: 'span[class*="discounted"], div[class*="price"]',
    detailImage: 'img[class*="product"], .product-img img',
    detailSku: () => '',
  },
  'purplle.com': {
    productCard: 'div[class*="product-card"], div[class*="item"]',
    name: 'p[class*="product-name"], div[class*="name"]',
    price: 'span[class*="price"], div[class*="price"]',
    image: 'img[class*="product"], img[class*="item"]',
    link: 'a[href*="/p/"]',
    getSku: () => '',
    detailName: 'h1[class*="product-name"]',
    detailPrice: 'span[class*="sp"], span[class*="price"]',
    detailImage: 'img[class*="product"], .product-img img',
    detailSku: () => '',
  },
};

// ── Store detection ───────────────────────────────────────────────────────────
function getStoreConfig() {
  const host = location.hostname.replace('www.', '');
  for (const [domain, config] of Object.entries(STORE_CONFIGS)) {
    if (host.includes(domain)) return { domain, config };
  }
  return null;
}

function getFirst(root, selectors) {
  for (const sel of selectors.split(',').map(s => s.trim())) {
    try {
      const el = root.querySelector(sel);
      if (el?.innerText?.trim()) return el.innerText.trim();
    } catch { }
  }
  return '';
}

// ── Extract best image URL from card ─────────────────────────────────────────
function getImageSrc(root, selectors) {
  const sels = (selectors || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const sel of sels) {
    try {
      const img = root.querySelector(sel);
      if (!img) continue;
      // Try multiple attributes — sites use different lazy-load strategies
      const candidates = [
        img.dataset.src,
        img.dataset.srcset?.split(' ')[0],
        img.dataset.lazySrc,
        img.dataset.originalSrc,
        img.getAttribute('src'),
      ].filter(Boolean);
      for (const src of candidates) {
        if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('blank') && !src.includes('data:image/gif')) {
          // Prefer higher-res: remove size constraints in URL params
          return src.replace(/_SX\d+_|_SY\d+_|_AC_UL\d+_/g, '_SX500_');
        }
      }
    } catch { }
  }
  return '';
}

// ── Extract real product URL from card ───────────────────────────────────────
function getProductLink(card, selectors) {
  const sels = (selectors || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const sel of sels) {
    try {
      const el = card.querySelector(sel);
      const href = el?.href || el?.getAttribute('href') || '';
      if (href && !href.includes('javascript') && href !== '#') {
        return href.startsWith('http') ? href : location.origin + href;
      }
    } catch { }
  }
  // Fallback: any anchor inside card
  for (const a of card.querySelectorAll('a[href]')) {
    const href = a.href || '';
    if (href && href.startsWith('http') && !href.includes('javascript')) return href;
  }
  return location.href;
}

// ── Detect detail page ────────────────────────────────────────────────────────
function isDetailPage(domain) {
  const p = location.pathname;
  if (domain.includes('amazon.in'))        return /\/dp\/[A-Z0-9]{10}/.test(p);
  if (domain.includes('flipkart.com'))     return /\/p\/[a-zA-Z0-9]+/.test(p);
  if (domain.includes('myntra.com'))       return /\/\d+\/buy/.test(p);
  if (domain.includes('ajio.com'))         return /\/p\//.test(p);
  if (domain.includes('nykaa.com'))        return /-p-/.test(p);
  if (domain.includes('snapdeal.com'))     return /\/product\//.test(p);
  if (domain.includes('tatacliq.com'))     return /\/p-/.test(p);
  if (domain.includes('croma.com'))        return /\/p\/\d+/.test(p);
  if (domain.includes('meesho.com'))       return /\/product\//.test(p);
  if (domain.includes('reliancedigital'))  return /\/p\//.test(p);
  if (domain.includes('jiomart.com'))      return /\/p\//.test(p);
  if (domain.includes('bigbasket.com'))    return /\/pd\//.test(p);
  if (domain.includes('purplle.com'))      return /\/p\//.test(p);
  if (domain.includes('firstcry.com'))     return /-pid-/.test(p);
  return false;
}

function extractDetailData(domain, config) {
  return {
    name:       getFirst(document, config.detailName),
    price:      getFirst(document, config.detailPrice),
    sku:        typeof config.detailSku === 'function' ? config.detailSku() : '',
    imageUrl:   getImageSrc(document, config.detailImage || ''),
    productUrl: location.href,
    store:      domain,
  };
}

function extractCardData(card, config, domain) {
  return {
    name:       getFirst(card, config.name),
    price:      getFirst(card, config.price),
    sku:        config.getSku(card),
    imageUrl:   getImageSrc(card, config.image || ''),
    productUrl: getProductLink(card, config.link || ''),
    store:      domain,
  };
}

// ── Safe message sender ───────────────────────────────────────────────────────
function safeSend(payload, callback) {
  if (!chrome?.runtime?.id) { callback({ error: 'context_invalid' }); return; }
  try {
    chrome.runtime.sendMessage({ type: 'FETCH_PRODUCT_INFO', payload }, (res) => {
      if (chrome.runtime.lastError) {
        setTimeout(() => {
          try { chrome.runtime.sendMessage({ type: 'FETCH_PRODUCT_INFO', payload }, callback); }
          catch { callback({ error: 'retry_failed' }); }
        }, 400);
        return;
      }
      callback(res || { error: 'no_response' });
    });
  } catch (e) { callback({ error: e.message }); }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
let tooltip = null, hideTimer = null, hoverTimer = null;

function createTooltip(x, y) {
  removeTooltip();
  tooltip = document.createElement('div');
  tooltip.id = 'smartshop-tooltip';
  tooltip.innerHTML = `
    <div class="ss-header">
      <span class="ss-logo">SmartShop</span>
      <button class="ss-close">✕</button>
    </div>
    <div class="ss-loading">Scanning product…</div>`;
  const tipW = 320, tipH = 240;
  const left = (x + tipW + 20 > window.innerWidth) ? x - tipW - 10 : x + 14;
  const top  = (y + tipH + 20 > window.innerHeight) ? y - tipH - 10 : y + 18;
  tooltip.style.cssText = `left:${Math.max(8, left)}px;top:${Math.max(8, top)}px;`;
  document.body.appendChild(tooltip);
  tooltip.querySelector('.ss-close').addEventListener('click', removeTooltip);
  tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  tooltip.addEventListener('mouseleave', scheduleHide);
}

function fillTooltip(info) {
  if (!tooltip) return;

  const offers = info.offers || [];

  // Deal alert banner
  const deal = info.deal;
  let dealBanner = '';
  if (deal?.isDeal) {
    dealBanner = `<div class="ss-deal-alert">🔥 ${escapeHtml(deal.message)}</div>`;
  } else if (deal?.observations >= 3 && deal?.avgPrice) {
    const note = deal.pctBelowAvg > 0 ? ` · ${deal.pctBelowAvg}% below avg` : (deal.pctBelowAvg < -5 ? ` · ${Math.abs(deal.pctBelowAvg)}% above avg` : '');
    dealBanner = `<div class="ss-price-note">Avg: ₹${deal.avgPrice.toLocaleString('en-IN')}${note}</div>`;
  }

  // AI-identified name banner
  const aiNameBanner = info.aiName
    ? `<div class="ss-ai-name">🔍 ${escapeHtml(info.aiName)}</div>`
    : '';

  // Meta rows
  const metaRows = [
    info.madeIn  ? `<div class="ss-row"><span class="ss-label">Made in</span><span>${escapeHtml(info.madeIn)}</span></div>` : '',
    info.mfgDate ? `<div class="ss-row"><span class="ss-label">Mfg</span><span>${escapeHtml(info.mfgDate)}</span></div>` : '',
    info.expiry  ? `<div class="ss-row"><span class="ss-label">Expiry</span><span>${escapeHtml(info.expiry)}</span></div>` : '',
  ].filter(Boolean).join('');

  // Offer cards — every card is a real anchor tag
  const offerCards = offers.slice(0, 5).map(o => {
    const shipping = o.shipping || '';
    let badgeClass = 'ss-badge-link';
    if (o.isCheaper)                    badgeClass = 'ss-badge-cheaper';
    else if (shipping.includes('costlier')) badgeClass = 'ss-badge-costlier';
    else if (shipping.includes('Same'))  badgeClass = 'ss-badge-same';
    else if (!o.isLink)                  badgeClass = 'ss-badge-same';

    const priceHTML = (o.price && o.price !== 'Check price')
      ? `<span class="ss-price">${escapeHtml(o.price)}</span>`
      : `<span class="ss-price-unknown">Tap to check</span>`;

    const safeUrl = (o.url && o.url !== '#') ? escapeHtml(o.url) : '';

    return `<a class="ss-offer" href="${safeUrl}" target="_blank" rel="noopener noreferrer" data-url="${safeUrl}">
      <div class="ss-offer-row">
        <span class="ss-site">${escapeHtml(o.site)}</span>${priceHTML}
      </div>
      <div><span class="${badgeClass}">${escapeHtml(shipping)}</span></div>
    </a>`;
  }).join('');

  const hasCheaper = offers.some(o => o.isCheaper);
  const hasRealData = offers.some(o => o.price && o.price !== 'Check price' && !o.isLink);
  let sectionTitle = 'Compare on other stores';
  if (hasCheaper) sectionTitle = '✓ Cheaper options found';
  else if (hasRealData) sectionTitle = 'Prices on other stores';

  const header = tooltip.querySelector('.ss-header');
  while (tooltip.lastChild !== header) tooltip.removeChild(tooltip.lastChild);

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    ${dealBanner}${aiNameBanner}
    ${metaRows ? `<div class="ss-meta">${metaRows}</div>` : ''}
    ${offerCards
      ? `<div class="ss-section-title">${sectionTitle}</div><div class="ss-offers">${offerCards}</div>`
      : `<div class="ss-empty">No comparison data found.</div>`}`;
  tooltip.appendChild(wrap);

  // Reliable click handler on every offer card
  tooltip.querySelectorAll('.ss-offer').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = card.dataset.url || card.getAttribute('href') || '';
      if (url && url !== '#') {
        console.log('[SmartShop] Opening:', url);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });
}

function showError(msg) {
  if (!tooltip) return;
  const header = tooltip.querySelector('.ss-header');
  while (tooltip.lastChild !== header) tooltip.removeChild(tooltip.lastChild);
  const d = document.createElement('div');
  d.className = 'ss-empty';
  d.textContent = msg;
  tooltip.appendChild(d);
}

function removeTooltip() {
  clearTimeout(hideTimer); clearTimeout(hoverTimer);
  tooltip?.remove(); tooltip = null;
}

function scheduleHide() {
  hideTimer = setTimeout(removeTooltip, 600);
}

function triggerTooltip(data, x, y) {
  if (!data.name && !data.imageUrl) return;
  if (data.name && data.name.length < 3 && !data.imageUrl) return;
  createTooltip(x, y);
  safeSend(data, (res) => {
    if (res?.data) fillTooltip(res.data);
    else if (res?.error === 'context_invalid') showError('Reload page to re-activate SmartShop.');
    else showError('Could not reach SmartShop server. Is it running?');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  const result = getStoreConfig();
  if (!result) return;
  const { domain, config } = result;
  console.log(`[SmartShop] Active on ${domain}`);

  if (isDetailPage(domain)) {
    let shown = false;
    document.addEventListener('mousemove', (e) => {
      if (shown) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        const data = extractDetailData(domain, config);
        if (!data.name && !data.imageUrl) return;
        shown = true;
        triggerTooltip(data, e.clientX, e.clientY);
        setTimeout(() => { shown = false; }, 6000);
      }, 900);
    });
    return;
  }

  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest(config.productCard);
    if (!card) return;
    clearTimeout(hoverTimer); clearTimeout(hideTimer);
    hoverTimer = setTimeout(() => {
      const data = extractCardData(card, config, domain);
      triggerTooltip(data, e.clientX, e.clientY);
    }, 500);
  }, true);

  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest(config.productCard);
    if (card && !card.contains(e.relatedTarget)) {
      clearTimeout(hoverTimer); scheduleHide();
    }
  }, true);
}

init();