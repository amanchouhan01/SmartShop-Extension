'use strict';

/**
 * priceHistory.js
 * ───────────────
 * Lightweight price-history tracker and anomaly detector.
 *
 * Storage strategy: flat JSON file on disk (no extra infra needed).
 * Each product gets a rolling window of the last MAX_HISTORY_ENTRIES
 * price observations. We persist asynchronously so write latency never
 * blocks a response.
 *
 * Anomaly detection: Z-score compared against the product's own history.
 *   dealScore  > 0  → product is cheaper than usual  (max +100)
 *   dealScore  < 0  → product is more expensive       (min -100)
 *   dealScore  = 0  → no history or price is average
 *
 * "Deal Alert" fires when the current price is DEAL_THRESHOLD % or more
 * below the rolling average (configurable via env DEAL_THRESHOLD_PCT).
 */

const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const HISTORY_FILE        = path.join(__dirname, '..','..', 'data', 'priceHistory.js');
const MAX_HISTORY_ENTRIES = 30;      // rolling window per product
const DEAL_THRESHOLD_PCT  = parseFloat(process.env.DEAL_THRESHOLD_PCT || '15');
const MIN_OBSERVATIONS    = 3;       // need at least this many points to flag a deal

// ── In-memory store (loaded once at startup) ──────────────────────────────────
let _store = {};   // { [productKey]: { prices: number[], updatedAt: string } }
let _dirty = false;
let _writeTimer = null;

function ensureDataDir() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStore() {
  try {
    ensureDataDir();
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
      _store = JSON.parse(raw);
      console.log(`[PriceHistory] Loaded ${Object.keys(_store).length} product records`);
    }
  } catch (err) {
    console.warn('[PriceHistory] Could not load history file, starting fresh:', err.message);
    _store = {};
  }
}

/** Debounced async write — batches rapid updates into one disk write */
function scheduleSave() {
  _dirty = true;
  if (_writeTimer) return;
  _writeTimer = setTimeout(() => {
    _writeTimer = null;
    if (!_dirty) return;
    _dirty = false;
    try {
      ensureDataDir();
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(_store, null, 2), 'utf8');
    } catch (err) {
      console.error('[PriceHistory] Write error:', err.message);
    }
  }, 2000); // coalesce writes within a 2-second window
}

// Load at module import time
loadStore();

// ── Statistics helpers ────────────────────────────────────────────────────────
function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr, avg) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * Z-score of `value` relative to the price history array.
 * Returns null if there are too few observations.
 */
function zScore(value, priceArr) {
  if (priceArr.length < MIN_OBSERVATIONS) return null;
  const avg = mean(priceArr);
  const sd  = stddev(priceArr, avg);
  if (sd === 0) return 0; // all prices identical
  return (value - avg) / sd;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a stable key for a product.
 * Prefer SKU; fall back to a normalised slice of the name.
 */
function productKey(store, sku, name) {
  const nameSlug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
  return sku ? `${store}::sku::${sku}` : `${store}::name::${nameSlug}`;
}

/**
 * Record a price observation for a product.
 * Call this on every successful /analyze-product response.
 *
 * @param {string} store  — e.g. 'amazon.in'
 * @param {string|null} sku
 * @param {string} name
 * @param {number} price  — numeric INR price
 */
function recordPrice(store, sku, name, price) {
  if (!price || isNaN(price) || price <= 0) return;

  const key = productKey(store, sku, name);
  if (!_store[key]) _store[key] = { prices: [], updatedAt: null };

  const entry = _store[key];
  entry.prices.push(price);

  // Rolling window — drop oldest observations beyond the limit
  if (entry.prices.length > MAX_HISTORY_ENTRIES) {
    entry.prices = entry.prices.slice(-MAX_HISTORY_ENTRIES);
  }
  entry.updatedAt = new Date().toISOString();

  scheduleSave();
}

/**
 * Analyse the current price against history.
 *
 * @returns {object} {
 *   dealScore:   number (-100 → +100),  positive = cheaper than usual
 *   isDeal:      boolean,               true when price is ≥ DEAL_THRESHOLD_PCT below avg
 *   avgPrice:    number|null,           rolling average in INR
 *   minPrice:    number|null,           historical minimum
 *   observations: number,              how many data points we have
 *   message:     string                human-readable summary
 * }
 */
function analysePrice(store, sku, name, currentPrice) {
  const empty = { dealScore: 0, isDeal: false, avgPrice: null, minPrice: null, observations: 0, message: 'No price history yet' };

  if (!currentPrice || isNaN(currentPrice)) return empty;

  const key   = productKey(store, sku, name);
  const entry = _store[key];
  if (!entry || entry.prices.length < MIN_OBSERVATIONS) {
    return { ...empty, observations: entry?.prices?.length || 0 };
  }

  const prices = entry.prices;
  const avg    = mean(prices);
  const minP   = Math.min(...prices);
  const z      = zScore(currentPrice, prices);

  // Convert Z-score to a -100 → +100 scale
  // Z < 0 means price is below average (good deal) → positive dealScore
  const rawScore = z !== null ? Math.max(-3, Math.min(3, -z)) / 3 * 100 : 0;
  const dealScore = Math.round(rawScore);

  // Percentage below the rolling average
  const pctBelowAvg = avg > 0 ? ((avg - currentPrice) / avg) * 100 : 0;
  const isDeal = pctBelowAvg >= DEAL_THRESHOLD_PCT;

  let message;
  if (isDeal) {
    message = `🔥 ${Math.round(pctBelowAvg)}% below average — great deal!`;
  } else if (pctBelowAvg >= 5) {
    message = `${Math.round(pctBelowAvg)}% below average`;
  } else if (pctBelowAvg <= -10) {
    message = `${Math.round(-pctBelowAvg)}% above average — consider waiting`;
  } else if (currentPrice === minP) {
    message = 'Lowest price we have seen!';
  } else {
    message = `Average price: ₹${Math.round(avg).toLocaleString('en-IN')}`;
  }

  return {
    dealScore,
    isDeal,
    avgPrice:     Math.round(avg),
    minPrice:     minP,
    observations: prices.length,
    pctBelowAvg:  Math.round(pctBelowAvg),
    message,
  };
}

/**
 * Return the raw price history for a product (useful for debugging / charts).
 */
function getPriceHistory(store, sku, name) {
  const key = productKey(store, sku, name);
  return _store[key] || null;
}

/**
 * Flush all history from memory and disk (useful for testing).
 */
function flushHistory() {
  _store = {};
  try {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, '{}', 'utf8');
  } catch (err) {
    console.error('[PriceHistory] Flush error:', err.message);
  }
  console.log('[PriceHistory] Flushed');
}

module.exports = { recordPrice, analysePrice, getPriceHistory, flushHistory, productKey };