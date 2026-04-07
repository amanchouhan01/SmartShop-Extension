// test-vision-local.js
const ollamaService = require('./services/ollamaService');
const fs = require('fs');
const path = require('path');

async function testWithLocalImage() {
    console.log('🧪 Testing Ollama Vision with Local Image\n');
    
    // Check if Ollama is available
    const isAvailable = await ollamaService.test();
    if (!isAvailable) {
        console.log('❌ Ollama is not available');
        return;
    }
    
    // Create a simple test image using data URL
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    console.log(`📸 Testing with embedded test image`);
    console.log(`📝 Hint: iPhone 13\n`);
    
    // Note: You'll need to modify analyzeImage to handle base64 or save it to a file first
    const result = await ollamaService.analyzeImage(testImageBase64, 'iPhone 13');
    
    console.log(`Result: ${result || 'Failed'}`);
}

testWithLocalImage();