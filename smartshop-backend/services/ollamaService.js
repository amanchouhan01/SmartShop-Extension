// services/ollamaService.js - OPTIMIZED for speed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Optional: Add sharp for image optimization (install with: npm install sharp)
let sharp;
try {
    sharp = require('sharp');
    console.log('[Ollama] Sharp loaded for image optimization');
} catch {
    console.log('[Ollama] Sharp not available, using raw images');
}

class OllamaService {
    constructor() {
        this.model = process.env.OLLAMA_VISION_MODEL || 'moondream'; // moondream is faster!
        this.apiUrl = 'http://localhost:11434/api/generate';
        this.isAvailable = false;
        this.cache = new Map();
        this.pendingRequests = new Map(); // Deduplicate simultaneous requests
        this.requestQueue = [];
        this.processing = false;
        
        // Don't block constructor
        this.checkAvailability().catch(console.error);
    }

    async checkAvailability() {
        try {
            const response = await fetch('http://localhost:11434/api/tags');
            if (response.ok) {
                const data = await response.json();
                const hasModel = data.models?.some(m => m.name.includes(this.model));
                if (hasModel) {
                    this.isAvailable = true;
                    console.log(`✅ Ollama model "${this.model}" is available (fast mode)`);
                    return true;
                }
            }
            this.isAvailable = false;
            console.warn('⚠️ Ollama not available');
            return false;
        } catch (error) {
            this.isAvailable = false;
            console.warn('⚠️ Ollama not available. Run: ollama serve');
            return false;
        }
    }

    async waitForAvailability(timeout = 5000) { // Reduced timeout
        const startTime = Date.now();
        while (!this.isAvailable && (Date.now() - startTime) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.checkAvailability();
        }
        return this.isAvailable;
    }

    async downloadAndOptimizeImage(imageUrl) {
        try {
            console.log(`[Download] Fetching: ${imageUrl.substring(0, 80)}...`);
            
            const response = await fetch(imageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            let buffer = await response.arrayBuffer();
            let originalSize = buffer.byteLength;
            
            // Optimize image if sharp is available
            if (sharp) {
                // Resize to max 400px and convert to WebP (much smaller)
                const optimized = await sharp(Buffer.from(buffer))
                    .resize(400, 400, { fit: 'inside' })
                    .webp({ quality: 65 })
                    .toBuffer();
                
                buffer = optimized;
                console.log(`[Download] Optimized: ${(originalSize / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB (${Math.round((1 - buffer.length/originalSize) * 100)}% reduction)`);
            }
            
            const tempPath = path.join(__dirname, '../temp', `${Date.now()}.webp`);
            const tempDir = path.dirname(tempPath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            fs.writeFileSync(tempPath, Buffer.from(buffer));
            return tempPath;
        } catch (error) {
            console.error('[Download] Failed:', error.message);
            throw error;
        }
    }

    // Queue system to prevent overwhelming Ollama
    async queueRequest(fn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ fn, resolve, reject });
            this.processQueue();
        });
    }

    async processQueue() {
        if (this.processing || this.requestQueue.length === 0) return;
        this.processing = true;

        const { fn, resolve, reject } = this.requestQueue.shift();
        try {
            const result = await fn();
            resolve(result);
        } catch (err) {
            reject(err);
        } finally {
            this.processing = false;
            // Small delay between requests
            setTimeout(() => this.processQueue(), 100);
        }
    }

    async analyzeImage(imageUrl, hintName = '') {
        if (!this.isAvailable || !imageUrl) {
            console.log('[Vision] Ollama not available or no image URL');
            return hintName || null;
        }

        // Generate hash for better caching
        const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
        const cacheKey = `vision:${hash}`;
        
        // Check memory cache first
        if (this.cache.has(cacheKey)) {
            console.log('[Vision] ⚡ Memory cache hit');
            return this.cache.get(cacheKey);
        }

        // Deduplicate simultaneous requests for same image
        if (this.pendingRequests.has(cacheKey)) {
            console.log('[Vision] ⚡ Waiting for pending request');
            return this.pendingRequests.get(cacheKey);
        }

        const promise = this.queueRequest(async () => {
            let tempPath = null;
            try {
                console.log('[Vision] Downloading & optimizing image...');
                const startTime = Date.now();
                
                tempPath = await this.downloadAndOptimizeImage(imageUrl);

                // Read optimized image
                const imageBuffer = fs.readFileSync(tempPath);
                const base64Image = imageBuffer.toString('base64');

                // Shorter prompt for faster processing
                const prompt = `Product from image. Return ONLY: brand model specs color. Max 10 words.
${hintName ? `Hint: ${hintName}` : ''}`;

                console.log('[Vision] Analyzing with Ollama...');
                
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.model,
                        prompt: prompt,
                        images: [base64Image],
                        stream: false,
                        options: {
                            temperature: 0.1,
                            num_predict: 60, // Reduced for faster response
                            num_ctx: 1024     // Smaller context = faster
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`API HTTP ${response.status}`);
                }

                const data = await response.json();
                let result = data.response?.trim();
                
                // Clean up result
                if (result && result.length > 50) {
                    result = result.substring(0, 50);
                }
                
                const elapsed = Date.now() - startTime;
                console.log(`[Vision] ⚡ Completed in ${elapsed}ms: "${result || 'none'}"`);

                if (result && result.length > 3) {
                    // Store in both caches
                    this.cache.set(cacheKey, result);
                    return result;
                }
                
                return hintName || null;

            } catch (err) {
                console.error('[Vision] Error:', err.message);
                return hintName || null;
            } finally {
                if (tempPath && fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            }
        });

        this.pendingRequests.set(cacheKey, promise);
        const result = await promise;
        this.pendingRequests.delete(cacheKey);
        
        return result;
    }

    async test() {
        await this.checkAvailability();
        console.log(`[Ollama] Model: ${this.model}, Available: ${this.isAvailable}`);
        return this.isAvailable;
    }
}

module.exports = new OllamaService();