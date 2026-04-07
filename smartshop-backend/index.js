// index.js - Add at the VERY TOP before any other requires
// Suppress GLib warnings on Windows
if (process.platform === 'win32') {
    process.env.GLIB_VERSION = '2.0';
    process.env.GDK_PIXBUF_MODULE_FILE = '';
}

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const analyzeRoute = require('./src/routes/analyze');

// ... rest of your code


const app = express();
const PORT = process.env.PORT || 3001;

// Import Ollama service for warmup
const ollamaService = require('./services/ollamaService');

// Middleware
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET'],
}));

app.use(express.json({ limit: '10mb' })); // Increased limit for images
app.use('/v1', analyzeRoute);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ollamaReady: ollamaService.isAvailable
  });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 SmartShop backend running at http://localhost:${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health`);
  console.log(`🔍 Vision: POST http://localhost:${PORT}/v1/analyze-product`);
  
  // Warm up services
  try {
    const { warmUp } = require('./src/services/aiSimilarity');
    await warmUp();  // downloads model on first run (~25MB)
    console.log('✅ AI Similarity model loaded');
  } catch (err) {
    console.log('⚠️ AI Similarity warmup skipped:', err.message);
  }
  
  // Warm up Ollama
  setTimeout(async () => {
    const available = await ollamaService.waitForAvailability(5000);
    if (available) {
      console.log('✅ Ollama vision model ready');
    } else {
      console.log('⚠️ Ollama not available. Run: ollama serve');
    }
  }, 2000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});