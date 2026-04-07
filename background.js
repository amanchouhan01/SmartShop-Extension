const API_BASE = 'http://localhost:3001';
const memCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Keep service worker alive — critical fix
const keepAlive = () => setInterval(() => {
  chrome.runtime.getPlatformInfo(() => {});
}, 20000);
keepAlive();

let reqCount = 0, windowEnd = Date.now() + 60000;
function allowed() {
  const now = Date.now();
  if (now > windowEnd) { reqCount = 0; windowEnd = now + 60000; }
  if (reqCount >= 30) return false;
  reqCount++;
  return true;
}

async function fetchWithRetry(payload, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API_BASE}/v1/analyze-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`SmartShop attempt ${i + 1} failed:`, e.message);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('All retries failed');
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'FETCH_PRODUCT_INFO') return false;

  const p = msg.payload;
  const key = `${p.store}::${p.sku || p.name?.slice(0, 40)}`;

  const hit = memCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    console.log('[Background] Cache HIT for:', key);
    sendResponse({ data: hit.data });
    return true;
  }

  if (!allowed()) {
    console.log('[Background] Rate limit exceeded');
    sendResponse({ error: 'rate_limit' });
    return true;
  }

  console.log('[Background] Fetching product info for:', p.name);
  
  fetchWithRetry(p)
    .then(data => {
      // DEBUG LOGGING - Added this section
      console.log('[Background] Received data with offers:', data.offers?.length || 0);
      if (data.offers && data.offers.length > 0) {
        data.offers.forEach((offer, idx) => {
          console.log(`[Background] Offer ${idx}: ${offer.site} - URL: ${offer.url} - Price: ${offer.price}`);
        });
      } else {
        console.warn('[Background] No offers received in response');
      }
      
      memCache.set(key, { data, ts: Date.now() });
      sendResponse({ data });
    })
    .catch(err => {
      console.error('SmartShop fetch error:', err.message);
      sendResponse({ error: err.message });
    });

  return true;
});