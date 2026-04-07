const axios = require('axios');

// Free API — great for food, cosmetics, medicine barcodes
async function fromOpenFoodFacts(barcode) {
  try {
    const { data } = await axios.get(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
      { timeout: 4000 }
    );
    if (data.status !== 1) return null;
    const p = data.product;
    return {
      madeIn: p.countries_en || null,
      mfgDate: null,
      expiry: p.expiration_date || null,
    };
  } catch {
    return null;
  }
}

// Free barcode lookup API for electronics / general items
async function fromUpcItemDb(barcode) {
  try {
    const { data } = await axios.get(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
      { timeout: 4000 }
    );
    const item = data.items?.[0];
    if (!item) return null;
    return { madeIn: null, mfgDate: null, expiry: null };
  } catch {
    return null;
  }
}

async function getProductMeta({ name, sku }) {
  if (sku) {
    const food = await fromOpenFoodFacts(sku);
    if (food) return food;
    const upc = await fromUpcItemDb(sku);
    if (upc) return upc;
  }
  // No barcode available — return null (tooltip will hide those rows)
  return null;
}

module.exports = { getProductMeta };