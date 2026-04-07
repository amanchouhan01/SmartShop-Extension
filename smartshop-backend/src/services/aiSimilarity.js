'use strict';
/**
 * aiSimilarity.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in AI-powered similarity function for SmartShop backend.
 *
 * Uses @xenova/transformers (pure JavaScript, no Python needed in production).
 * Falls back to fast token-overlap similarity if the model fails to load.
 *
 * Usage:
 *   const { aiSimilarity, batchSimilarity, warmUp } = require('./aiSimilarity');
 *
 *   // Single pair
 *   const score = await aiSimilarity("Samsung Galaxy A35 8GB", "Samsung A35 5G 8/128");
 *   // score: 0.0 – 1.0  (>0.5 = same product)
 *
 *   // Batch (50+ products vs one query)
 *   const scores = await batchSimilarity("Samsung A35", ["Samsung A35 5G", "iPhone 15", ...]);
 *
 * Install:
 *   npm install @xenova/transformers
 *
 * First run downloads the model (~25MB) to .model_cache/.
 */

const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const MODEL_NAME   = 'Xenova/paraphrase-MiniLM-L6-v2';  // 25MB, fast
const CACHE_DIR    = path.join(__dirname, '..', '.model_cache');
const MATCH_THRESHOLD = 0.50;  // cosine similarity threshold
const EMBEDDING_CACHE_SIZE = 2000;  // LRU cache for embeddings

// ── State ─────────────────────────────────────────────────────────────────────
let _pipeline   = null;   // @xenova/transformers pipeline
let _loading    = null;   // Promise<pipeline> — prevents double-load
let _modelReady = false;

// LRU embedding cache — avoids re-encoding the same product text
class LRUCache {
  constructor(maxSize) {
    this.max  = maxSize;
    this.map  = new Map();  // text → Float32Array
  }
  get(key) {
    if (!this.map.has(key)) return null;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);   // move to end (most recently used)
    return val;
  }
  set(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, val);
  }
}

const embCache = new LRUCache(EMBEDDING_CACHE_SIZE);

// ── Indian e-commerce text normalisation ─────────────────────────────────────
const BRAND_MAP = {
  'mi': 'xiaomi', 'redmi': 'xiaomi', 'poco': 'xiaomi',
  'real me': 'realme', 'one plus': 'oneplus', '1+': 'oneplus',
  'b0at': 'boat', 'j b l': 'jbl', 'l g': 'lg',
  'samung': 'samsung', 'samsng': 'samsung',
};

const UNIT_MAP = [
  [/\b1000\s*g\b/gi, '1kg'], [/\b500\s*g\b/gi, '500g'],
  [/\b1000\s*ml\b/gi, '1l'], [/\b1\s*litre?\b/gi, '1l'],
  [/\bcolour\b/gi, 'color'], [/\bgrey\b/gi, 'gray'],
];

const NOISE = /\b(without|offer|sale|diwali|holi|festival|special|edition|combo|pack|new|latest|best|top|wala|hai|ka|ki)\b/gi;

function normalise(text) {
  let s = (text || '').toLowerCase()
    .replace(/[()[\]{}"',|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [alias, canon] of Object.entries(BRAND_MAP)) {
    s = s.replace(new RegExp(`\\b${alias}\\b`, 'g'), canon);
  }
  for (const [re, rep] of UNIT_MAP) s = s.replace(re, rep);
  s = s.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ── Baseline: fast token overlap (always available, no model needed) ──────────
function tokenSimilarity(a, b) {
  const tok = s => new Set(
    normalise(s).split(' ').filter(w => w.length > 1)
  );
  const ta = tok(a), tb = tok(b);
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.max(ta.size, tb.size);
}

// ── Cosine similarity of two Float32Arrays ────────────────────────────────────
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ── Load model (lazy, singleton) ──────────────────────────────────────────────
async function loadModel() {
  if (_modelReady) return _pipeline;
  if (_loading)   return _loading;

  _loading = (async () => {
    try {
      const { pipeline, env } = await import('@xenova/transformers');
      env.cacheDir = CACHE_DIR;
      env.allowRemoteModels = true;

      console.log('[aiSimilarity] Loading model (first run downloads ~25MB)…');
      const start = Date.now();
      _pipeline   = await pipeline('feature-extraction', MODEL_NAME, {
        quantized: true,   // use INT8 quantised model — 3x smaller, ~same accuracy
      });
      _modelReady = true;
      console.log(`[aiSimilarity] Model ready in ${Date.now() - start}ms`);
      return _pipeline;
    } catch (err) {
      console.warn('[aiSimilarity] Model load failed, using token similarity fallback:', err.message);
      _modelReady = false;
      _pipeline   = null;
      return null;
    }
  })();

  return _loading;
}

// ── Encode text → embedding ──────────────────────────────────────────────────
async function encode(text) {
  const key = normalise(text).slice(0, 100);
  const cached = embCache.get(key);
  if (cached) return cached;

  const pipe = await loadModel();
  if (!pipe) return null;

  try {
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    // output.data is Float32Array
    const emb = output.data instanceof Float32Array
      ? output.data
      : new Float32Array(output.data);
    embCache.set(key, emb);
    return emb;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compare two product texts.
 * Returns a score 0–1 (>= MATCH_THRESHOLD means same product).
 *
 * @param {string} textA
 * @param {string} textB
 * @returns {Promise<number>}
 */
async function aiSimilarity(textA, textB) {
  const [ea, eb] = await Promise.all([encode(textA), encode(textB)]);

  if (!ea || !eb) {
    // AI model unavailable — fall back to token overlap
    return tokenSimilarity(textA, textB);
  }

  const score = cosine(ea, eb);

  // Hybrid: blend AI score with token similarity for robustness
  const tSim  = tokenSimilarity(textA, textB);
  return 0.75 * score + 0.25 * tSim;
}

/**
 * Compare one query against many candidates in one batch.
 * Much faster than calling aiSimilarity() N times.
 *
 * @param {string}   query
 * @param {string[]} candidates
 * @returns {Promise<Array<{text: string, score: number, isMatch: boolean}>>}
 */
async function batchSimilarity(query, candidates) {
  const pipe = await loadModel();

  if (!pipe) {
    // Pure token fallback
    return candidates.map(c => ({
      text:    c,
      score:   tokenSimilarity(query, c),
      isMatch: tokenSimilarity(query, c) >= MATCH_THRESHOLD,
    }));
  }

  // Encode query
  const qEmb = await encode(query);

  // Encode all candidates in one forward pass
  const uncached = candidates.filter(c => !embCache.get(normalise(c).slice(0, 100)));
  if (uncached.length > 0) {
    try {
      const outputs = await pipe(uncached, { pooling: 'mean', normalize: true, batch_size: 32 });
      const embs = Array.isArray(outputs) ? outputs : [outputs];
      embs.forEach((out, i) => {
        const key = normalise(uncached[i]).slice(0, 100);
        const emb = out.data instanceof Float32Array ? out.data : new Float32Array(out.data);
        embCache.set(key, emb);
      });
    } catch (err) {
      console.warn('[aiSimilarity] Batch encode error:', err.message);
    }
  }

  return candidates.map(c => {
    const cEmb = embCache.get(normalise(c).slice(0, 100));
    if (!qEmb || !cEmb) {
      const s = tokenSimilarity(query, c);
      return { text: c, score: s, isMatch: s >= MATCH_THRESHOLD };
    }
    const aiScore    = cosine(qEmb, cEmb);
    const tokenScore = tokenSimilarity(query, c);
    const score      = 0.75 * aiScore + 0.25 * tokenScore;
    return { text: c, score: Math.round(score * 1000) / 1000, isMatch: score >= MATCH_THRESHOLD };
  });
}

/**
 * Warm up the model on server start.
 * Call this in index.js so the first real request isn't slow.
 */
async function warmUp() {
  console.log('[aiSimilarity] Warming up model…');
  await aiSimilarity('Samsung Galaxy A35 5G', 'Samsung A35 5G 8GB 128GB');
  console.log('[aiSimilarity] Warm-up complete');
}

/**
 * Check if a candidate is the same product as the query.
 * Convenience wrapper.
 */
async function isSameProduct(query, candidate, threshold = MATCH_THRESHOLD) {
  const score = await aiSimilarity(query, candidate);
  return { score, isMatch: score >= threshold };
}

/**
 * Filter a list of offers to only those matching the query product.
 * Use this in priceComparison.js to validate scraped results.
 */
async function filterMatchingOffers(queryName, offers) {
  if (!offers || offers.length === 0) return offers;

  const candidates = offers.map(o => o.name || o.site || '');
  const results    = await batchSimilarity(queryName, candidates);

  return offers.filter((offer, i) => {
    const r = results[i];
    // Accept if AI says it's a match, OR if there's no name to compare (link-only)
    return r.isMatch || !offer.name;
  });
}

module.exports = {
  aiSimilarity,
  batchSimilarity,
  isSameProduct,
  filterMatchingOffers,
  warmUp,
  tokenSimilarity,   // export baseline too for testing
  MATCH_THRESHOLD,
};