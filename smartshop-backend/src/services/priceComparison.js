'use strict';

/**
 * priceComparison.js v3 — Accurate, real-URL results only
 *
 * Key changes from v2:
 * 1. Every scraper returns a DIRECT product URL — not a search URL
 * 2. Similarity threshold is lowered for link-only stores (always show them)
 * 3. cleanName() preserves brand + model number — the most critical matching signal
 * 4. No more allOffers / filterMatchingOffers bugs
 * 5. Scrapers that can't get a real URL fall back to a search link clearly marked isLink:true
 */

const axios = require('axios');

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePrice(str) {
  if (str === null || str === undefined) return null;
  const num = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(num) || num <= 0 ? null : num;
}

function formatINR(num) {
  return '₹' + Math.round(num).toLocaleString('en-IN');
}

/**
 * Build a clean but COMPLETE search query.
 * Keep brand + model number intact — these are the most important matching signals.
 * Remove noise words that confuse scrapers.
 */
function buildQuery(raw) {
  if (!raw) return '';
  return raw
    .replace(/\|.*$/g, '')                          // strip pipe-separated suffixes
    .replace(/without offer|with offer/gi, '')       // strip offer noise
    .replace(/protect\+|applecare|extended warranty/gi, '') // strip warranty bundles
    .replace(/\(([^)]{1,30})\)/g, ' $1 ')           // unwrap short parens
    .replace(/[,[\]{}"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1)
    .slice(0, 8)   // max 8 tokens — enough for brand + model + key specs
    .join(' ');
}

/** Jaccard token similarity — fast, no ML needed, used only for filtering */
function similarity(a, b) {
  if (!a || !b) return 0;
  const tok = s => new Set(
    s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 1)
  );
  const ta = tok(a), tb = tok(b);
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
}

/** Build a link-only fallback offer (no price scraping, just a search URL) */
function searchLink(site, url, shipping = 'Tap to compare') {
  return {
    site, name: '', price: null,
    priceStr: 'Check price',
    url: url.startsWith('http') ? url : 'https://' + url,
    shipping, sim: 1, isLink: true,
  };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

// Minimum similarity to include a real result (not link-only)
// Lower = more results but more false positives
// 0.15 is good for short product queries where brand matches
const SIM_THRESHOLD = 0.15;

// ── SerpApi (best source — structured data, real URLs) ────────────────────────
async function serpApi(query, origName) {
  const key = process.env.SERPAPI_KEY;
  if (!key || key === 'your_key_here') return [];
  try {
    const { data } = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_shopping', q: query + ' india price',
        gl: 'in', hl: 'en', num: 20, api_key: key,
      },
      timeout: 8000,
    });
    return (data.shopping_results || [])
      .map(r => ({
        site: r.source,
        name: r.title || '',
        price: parsePrice(r.price),
        priceStr: r.price || '',
        url: r.link || '#',
        shipping: r.delivery || 'Check site',
        sim: similarity(origName, r.title || ''),
      }))
      .filter(r => r.price && r.sim >= SIM_THRESHOLD);
  } catch (e) {
    console.log('[SerpApi]', e.message);
    return [];
  }
}

// ── Amazon India ──────────────────────────────────────────────────────────────
async function amazon(query, origName) {
  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(query)}&sort=price-asc-rank`;
  const fb = searchLink('Amazon.in', searchUrl, 'Free with Prime');
  try {
    const { data } = await axios.get(searchUrl, {
      timeout: 9000,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN,en;q=0.9', Accept: 'text/html' },
    });

    const results = [];
    // Split by ASIN block
    for (const block of data.split('data-asin="').slice(1, 12)) {
      const asin  = block.match(/^([A-Z0-9]{10})/)?.[1];
      if (!asin) continue;

      // Price: look for a-price-whole
      const priceMatch = block.match(/class="a-price-whole"[^>]*>([\d,]+)/);
      const price = parsePrice(priceMatch?.[1]);
      if (!price) continue;

      // Name: look for a-size text elements
      const nameMatch = block.match(/class="a-size-[^"]*"[^>]*>([^<]{10,120})</);
      const name = nameMatch?.[1]?.trim() || '';

      const sim = similarity(origName, name);
      if (sim < SIM_THRESHOLD && name) continue;

      results.push({
        site: 'Amazon.in',
        name,
        price,
        priceStr: formatINR(price),
        url: `https://www.amazon.in/dp/${asin}`,  // direct product URL
        shipping: 'Free with Prime',
        sim,
      });
    }

    // Sort by similarity desc, take best 3
    results.sort((a, b) => b.sim - a.sim);
    return results.slice(0, 3).length ? results.slice(0, 3) : [fb];
  } catch (e) {
    console.log('[Amazon]', e.message);
    return [fb];
  }
}

// ── Flipkart ──────────────────────────────────────────────────────────────────
async function flipkart(query, origName) {
  const searchUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=price_asc`;
  const fb = searchLink('Flipkart', searchUrl, 'Free shipping');
  try {
    const { data } = await axios.get(searchUrl, {
      timeout: 9000,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-IN', Accept: 'text/html' },
    });

    const results = [];
    // Flipkart product URLs: /product-name/p/ITEMID
    const urlMatches = [...data.matchAll(/href="(\/[a-z0-9-]+\/p\/[a-z0-9]+[^"?]{0,60})"/gi)];
    for (const m of urlMatches.slice(0, 6)) {
      const urlPath = m[1];
      const fullUrl = 'https://www.flipkart.com' + urlPath;

      // Look for price near this URL in the HTML
      const region = data.substring(Math.max(0, m.index - 800), m.index + 200);
      const priceMatch = region.match(/₹\s*([\d,]+)/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : null;
      if (!price) continue;

      // Try to extract name from URL slug
      const slug = urlPath.split('/')[1]?.replace(/-/g, ' ') || '';
      const sim = similarity(origName, slug);

      results.push({
        site: 'Flipkart',
        name: slug,
        price,
        priceStr: formatINR(price),
        url: fullUrl,
        shipping: 'Free shipping',
        sim: Math.max(sim, 0.2), // give Flipkart benefit of doubt on sim
      });
    }

    results.sort((a, b) => a.price - b.price);
    return results.slice(0, 3).length ? results.slice(0, 3) : [fb];
  } catch (e) {
    console.log('[Flipkart]', e.message);
    return [fb];
  }
}

// ── Croma ─────────────────────────────────────────────────────────────────────
async function croma(query, origName) {
  const fb = searchLink('Croma', `https://www.croma.com/search/?q=${encodeURIComponent(query)}`, 'Free above ₹1000');
  try {
    const { data } = await axios.get(
      `https://api.croma.com/searchservices/v1/search?q=${encodeURIComponent(query)}&currentPage=0&pageSize=5&sort=priceAsc`,
      { timeout: 6000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const products = data?.products || data?.searchResults?.products || [];
    const results = products.slice(0, 4).map(p => {
      const price = parsePrice(p?.price?.value || p?.discountedPrice || p?.mrpPrice);
      const name  = p?.name || p?.productTitle || '';
      const slug  = p?.url || p?.slug || '';
      if (!price || !name) return null;
      const url = slug ? (slug.startsWith('http') ? slug : 'https://www.croma.com' + slug) : fb.url;
      return { site: 'Croma', name, price, priceStr: formatINR(price), url, shipping: 'Free above ₹1000', sim: similarity(origName, name) };
    }).filter(r => r && r.sim >= SIM_THRESHOLD);
    return results.length ? results : [fb];
  } catch { return [fb]; }
}

// ── Reliance Digital ──────────────────────────────────────────────────────────
async function relianceDigital(query, origName) {
  const fb = searchLink('Reliance Digital', `https://www.reliancedigital.in/search?q=${encodeURIComponent(query)}`, 'Free delivery');
  try {
    const { data } = await axios.get(
      `https://www.reliancedigital.in/rildigitalws/v2/rrldigital/cms/pagedata?searchTerm=${encodeURIComponent(query)}&pageSize=5&pageNumber=0&sortBy=price-asc`,
      { timeout: 6000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const products = data?.products?.PaginationModel?.productLists || [];
    const results = products.slice(0, 4).map(p => {
      const price = parsePrice(p?.prices?.price || p?.price);
      const name  = p?.name || p?.productTitle || '';
      const url   = p?.productUrl ? 'https://www.reliancedigital.in' + p.productUrl : fb.url;
      if (!price || !name) return null;
      return { site: 'Reliance Digital', name, price, priceStr: formatINR(price), url, shipping: 'Free delivery', sim: similarity(origName, name) };
    }).filter(r => r && r.sim >= SIM_THRESHOLD);
    return results.length ? results : [fb];
  } catch { return [fb]; }
}

// ── TataCliq ──────────────────────────────────────────────────────────────────
async function tatacliq(query, origName) {
  const fb = searchLink('TataCliq', `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(query)}`, 'Free shipping');
  try {
    const { data } = await axios.get(
      `https://api.tatacliq.com/moglilite/d0search/v2/search?searchText=${encodeURIComponent(query)}&pageSize=5&inStockOnly=true&channel=WEB`,
      { timeout: 6000, headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    const products = data?.searchData?.data?.productList || [];
    const results = products.slice(0, 4).map(p => {
      const price = parsePrice(p?.priceInfo?.sellingPrice || p?.priceInfo?.mrp);
      const name  = p?.productName || p?.brandName || '';
      const url   = p?.productURL ? 'https://www.tatacliq.com' + p.productURL : fb.url;
      if (!price || !name) return null;
      return { site: 'TataCliq', name, price, priceStr: formatINR(price), url, shipping: 'Free shipping', sim: similarity(origName, name) };
    }).filter(r => r && r.sim >= SIM_THRESHOLD);
    return results.length ? results : [fb];
  } catch { return [fb]; }
}

// ── Vijay Sales ───────────────────────────────────────────────────────────────
async function vijaySales(query, origName) {
  const fb = searchLink('Vijay Sales', `https://www.vijaysales.com/search/${encodeURIComponent(query)}`, '₹99 delivery');
  try {
    const { data } = await axios.get(
      `https://www.vijaysales.com/search/${encodeURIComponent(query)}`,
      { timeout: 6000, headers: { 'User-Agent': UA } }
    );
    const priceRe = /₹\s*([\d,]+)/g;
    const nameRe  = /class="[^"]*(?:product[^"]*name|name[^"]*product)[^"]*"[^>]*>([^<]{5,120})</gi;
    const urlRe   = /href="(\/[^"?#]{10,100})"/g;
    const prices  = [...data.matchAll(priceRe)].map(m => parsePrice(m[1])).filter(Boolean);
    const names   = [...data.matchAll(nameRe)].map(m => m[1].trim());
    const urls    = [...data.matchAll(urlRe)].map(m => 'https://www.vijaysales.com' + m[1]);
    const results = [];
    for (let i = 0; i < Math.min(prices.length, names.length, 4); i++) {
      if (!prices[i]) continue;
      const sim = similarity(origName, names[i] || '');
      if (sim < SIM_THRESHOLD) continue;
      results.push({ site: 'Vijay Sales', name: names[i] || '', price: prices[i], priceStr: formatINR(prices[i]), url: urls[i] || fb.url, shipping: '₹99 delivery', sim });
    }
    return results.length ? results : [fb];
  } catch { return [fb]; }
}

// ── Link-only stores (always show — user can verify manually) ─────────────────
function snapdeal(q) { return [searchLink('Snapdeal', `https://www.snapdeal.com/search?keyword=${encodeURIComponent(q)}&sort=plrty`)]; }
function meesho(q)   { return [searchLink('Meesho',   `https://www.meesho.com/search?q=${encodeURIComponent(q)}`, 'Free delivery')]; }
function nykaa(q)    { return [searchLink('Nykaa',    `https://www.nykaa.com/search/result/?q=${encodeURIComponent(q)}`, 'Free above ₹499')]; }
function jiomart(q)  { return [searchLink('JioMart',  `https://www.jiomart.com/catalogsearch/result/?q=${encodeURIComponent(q)}`, 'Free delivery')]; }

// ── Dedupe: one best offer per site ──────────────────────────────────────────
function dedupe(offers) {
  const map = new Map();
  for (const o of offers) {
    const ex = map.get(o.site);
    if (!ex) { map.set(o.site, o); continue; }
    if (!ex.price && o.price) { map.set(o.site, o); continue; }
    if (o.price && ex.price && o.price < ex.price) map.set(o.site, o);
  }
  return [...map.values()];
}

// ── Platform trust for weighted ranking ──────────────────────────────────────
const TRUST = { 'Amazon.in': 1.0, 'Flipkart': 1.0, 'Croma': 0.95, 'Reliance Digital': 0.95, 'TataCliq': 0.90, 'Vijay Sales': 0.88 };

function shippingCost(label = '') {
  if ((label || '').toLowerCase().includes('free')) return 0;
  const m = label.match(/₹\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 99;
}

function weightedScore(o, currentPrice) {
  const ep = (o.price || currentPrice || 0) + shippingCost(o.shipping);
  const priceScore = currentPrice ? ep / currentPrice : 1;
  const shipScore  = Math.min(shippingCost(o.shipping) / 500, 1);
  const trust      = TRUST[o.site] || 0.70;
  return 0.65 * priceScore + 0.20 * shipScore + 0.15 * (1 - trust);
}

// ── Build offer card ──────────────────────────────────────────────────────────
function buildOffer(o, currentPrice) {
  let badge = o.shipping || 'Check site';
  let isCheaper = false, savingsPct = 0;
  if (o.price && currentPrice) {
    const saved = currentPrice - o.price;
    const pct   = Math.round((saved / currentPrice) * 100);
    if (pct >= 1)       { badge = `Save ${formatINR(saved)} (${pct}% off)`; isCheaper = true; savingsPct = pct; }
    else if (pct <= -1) { badge = `${Math.abs(pct)}% costlier`; }
    else                { badge = 'Same price'; }
  }
  const score = weightedScore(o, currentPrice);
  return {
    site: o.site,
    price: o.priceStr || 'Check price',
    url: o.url,
    shipping: badge,
    isCheaper,
    isLink: o.isLink || false,
    savingsPct,
    _score: score,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function getCheaperOffers({ name, price, store, productUrl }) {
  const currentPrice = parsePrice(price);
  const query = buildQuery(name);

  console.log(`\n[SmartShop] ═══════════════════════════════`);
  console.log(`[SmartShop] Name    : "${name}"`);
  console.log(`[SmartShop] Query   : "${query}"`);
  console.log(`[SmartShop] Price   : ${currentPrice ? formatINR(currentPrice) : 'unknown'} | Store: ${store}`);

  if (!query || query.length < 3) {
    console.log('[SmartShop] Query too short, skipping');
    return [];
  }

  const tasks = [serpApi(query, name)];
  if (store !== 'flipkart.com')       tasks.push(flipkart(query, name));
  if (store !== 'amazon.in')          tasks.push(amazon(query, name));
  if (store !== 'croma.com')          tasks.push(croma(query, name));
  if (store !== 'reliancedigital.in') tasks.push(relianceDigital(query, name));
  if (store !== 'tatacliq.com')       tasks.push(tatacliq(query, name));
  if (store !== 'vijaysales.com')     tasks.push(vijaySales(query, name));
  // Always add link-only stores — user can verify
  if (store !== 'snapdeal.com') tasks.push(Promise.resolve(snapdeal(query)));
  if (store !== 'meesho.com')   tasks.push(Promise.resolve(meesho(query)));
  if (store !== 'nykaa.com')    tasks.push(Promise.resolve(nykaa(query)));
  if (store !== 'jiomart.com')  tasks.push(Promise.resolve(jiomart(query)));

  const settled = await Promise.allSettled(tasks);
  const raw     = settled.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  console.log(`[SmartShop] Raw: ${raw.length} results`);
  raw.forEach(o => console.log(`  ${o.site.padEnd(20)} ${String(o.priceStr || '').padEnd(12)} sim=${(o.sim || 0).toFixed(2)} url=${o.url?.slice(0, 60)}`));

  const deduped = dedupe(raw);
  const cards   = deduped.map(o => buildOffer(o, currentPrice));

  // Sort: real cheaper offers first (by weighted score), links last
  cards.sort((a, b) => {
    if (a.isLink && !b.isLink) return 1;
    if (!a.isLink && b.isLink) return -1;
    return a._score - b._score;
  });

  const final = cards.slice(0, 6).map(({ _score, ...rest }) => rest);
  console.log(`[SmartShop] Returning ${final.length} offers`);
  final.forEach(o => console.log(`  ${o.isCheaper ? '✓' : o.isLink ? '→' : '='} ${o.site.padEnd(20)} ${o.price} → ${o.url?.slice(0, 70)}`));

  return final;
}

module.exports = { getCheaperOffers };