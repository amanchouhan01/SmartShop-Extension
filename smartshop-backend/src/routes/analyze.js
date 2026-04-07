'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { getProductMeta } = require('../services/productMeta');
const { getCheaperOffers } = require('../services/priceComparison');
const { recordPrice, analysePrice } = require('../services/priceHistory');
const cache = require('../services/cache');

// ── Vision: identify product from image using Ollama (optimized) ──
const ollamaService = require('../../services/ollamaService');

console.log('[Analyze] Loading Ollama service...');

// Wait for service to be ready (non-blocking)
ollamaService.waitForAvailability(3000).then(ready => {
    console.log(`[Analyze] Ollama service ready: ${ready}`);
});

// ── Optimized vision with 3.5 second timeout ──
async function identifyProductFromImage(imageUrl, hintName) {
    if (!imageUrl) {
        return null;
    }

    // Quick cache check
    const hash = require('crypto').createHash('md5').update(imageUrl).digest('hex');
    const visionKey = `vision:${hash}`;
    const hit = await cache.get(visionKey);
    if (hit) {
        console.log('[Vision] ⚡ Cache hit');
        return hit;
    }

    // 3.5 second timeout - fail fast
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            console.log('[Vision] ⏱️ Timeout (3.5s), using fallback');
            resolve(null);
        }, 3500);
    });

    try {
        const result = await Promise.race([
            ollamaService.analyzeImage(imageUrl, hintName),
            timeoutPromise
        ]);

        if (result && result !== hintName && result.length > 3) {
            await cache.set(visionKey, result, 3600);
            console.log(`[Vision] ✅ "${result.substring(0, 50)}"`);
            return result;
        }
        return null;
    } catch (err) {
        console.log('[Vision] Skipped:', err.message);
        return null;
    }
}

// ── POST /v1/analyze-product ──
router.post('/analyze-product', async (req, res) => {
    const startTime = Date.now();
    const { name, sku, store, price, imageUrl, productUrl } = req.body;

    console.log(`\n📦 [${store}] ${name?.substring(0, 40) || 'no name'}`);

    if (!name && !imageUrl) {
        return res.status(400).json({ error: 'name or imageUrl required' });
    }

    const numericPrice = price
        ? parseFloat(String(price).replace(/[^0-9.]/g, '')) || null
        : null;

    // Non-blocking price recording
    if (numericPrice && store) {
        setImmediate(() => recordPrice(store, sku || null, name || '', numericPrice));
    }

    const cacheKey = `analyze:${store}:${sku || (name || imageUrl || '').slice(0, 40)}`;
    const cached = await cache.get(cacheKey);
    if (cached) {
        console.log('[Cache] HIT');
        const freshDeal = numericPrice
            ? analysePrice(store, sku || null, name || '', numericPrice)
            : cached.deal;
        return res.json({ ...cached, deal: freshDeal });
    }

    // Run vision and meta in parallel
    const [aiNameResult, metaResult] = await Promise.allSettled([
        identifyProductFromImage(imageUrl, name),
        getProductMeta({ name: name || '', sku }),
    ]);

    const aiName = aiNameResult.status === 'fulfilled' ? aiNameResult.value : null;
    const searchName = (aiName && aiName.length > (name || '').length) ? aiName : (name || aiName || '');

    if (aiName && aiName !== name) {
        console.log(`[AI] "${name}" → "${searchName}"`);
    }

    // Price comparison with AI-enhanced name
    const offersResult = await getCheaperOffers({ 
        name: searchName, 
        sku, 
        price, 
        store, 
        productUrl 
    });

    const deal = numericPrice
        ? analysePrice(store, sku || null, name || '', numericPrice)
        : { dealScore: 0, isDeal: false, message: 'Price unknown' };

    const result = {
        madeIn: metaResult.status === 'fulfilled' ? metaResult.value?.madeIn : null,
        mfgDate: metaResult.status === 'fulfilled' ? metaResult.value?.mfgDate : null,
        expiry: metaResult.status === 'fulfilled' ? metaResult.value?.expiry : null,
        offers: offersResult || [],
        deal,
        aiName,
    };

    const elapsed = Date.now() - startTime;
    console.log(`[Done] ${result.offers.length} offers in ${elapsed}ms${aiName ? ' ✨' : ''}`);

    if (result.offers?.length > 0) {
        await cache.set(cacheKey, result, 600);
    }

    res.json(result);
});

// Admin endpoints
router.get('/flush-cache', async (_req, res) => {
    await cache.flush();
    res.json({ ok: true });
});

router.get('/flush-history', (_req, res) => {
    require('../services/priceHistory').flushHistory();
    res.json({ ok: true });
});

router.get('/price-history', (req, res) => {
    const { store = '', name = '', sku = '' } = req.query;
    const history = require('../services/priceHistory').getPriceHistory(store, sku || null, name);
    if (!history) return res.status(404).json({ error: 'No history found' });
    res.json(history);
});

module.exports = router;