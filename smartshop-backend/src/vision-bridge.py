# vision-bridge.py
import ollama
import sys
import json
import base64
from pathlib import Path

def analyze_image(image_path, prompt):
    try:
        # Read image as bytes
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        # Call Ollama with image
        response = ollama.chat(
            model='llava',
            messages=[{
                'role': 'user',
                'content': prompt,
                'images': [image_data]
            }]
        )
        return response['message']['content']
    except Exception as e:
        return json.dumps({'error': str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({'error': 'Missing arguments'}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    prompt = ' '.join(sys.argv[2:])
    result = analyze_image(image_path, prompt)
    print(json.dumps({'result': result}))