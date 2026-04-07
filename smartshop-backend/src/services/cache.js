const memStore = new Map();
console.log('Using in-memory cache (Redis disabled)');

async function get(key) {
  const hit = memStore.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    memStore.delete(key);
    return null;
  }
  return hit.val;
}

async function set(key, value, ttlSeconds = 600) {
  memStore.set(key, {
    val: value,
    exp: Date.now() + ttlSeconds * 1000,
  });
}

async function flush() {
  memStore.clear();
  console.log('In-memory cache flushed');
}

module.exports = { get, set, flush };