from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import os
import uuid
import subprocess
import sys
import tempfile
import requests

# Load environment variables from .env.local file
from dotenv import load_dotenv
load_dotenv('.env.local')
load_dotenv()  # Also try .env as fallback

app = Flask(__name__)

# Freesound API Configuration
FREESOUND_API_KEY = os.environ.get('FREESOUND_API_KEY', '')
FREESOUND_BASE_URL = 'https://freesound.org/apiv2'

# Hugging Face API Configuration
HF_API_TOKEN = os.environ.get('HF_API_TOKEN', '')
HF_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell'
HF_API_URL = f'https://api-inference.huggingface.co/models/{HF_IMAGE_MODEL}'

CORS(app)

VOICES = {
    "en": "en-US-GuyNeural",
    "my": "my-MM-ThihaNeural"
}

def generate_voice_cli(text, voice, output_path):
    # Use python -m edge_tts to ensure we use the venv installation
    cmd = [
        sys.executable, '-m', 'edge_tts',
        "--text", text,
        "--voice", voice,
        "--write-media", output_path
    ]
    
    # Try with retries
    max_retries = 3
    last_error = ""
    for attempt in range(max_retries):
        try:
            print(f"[TTS] Attempt {attempt + 1} for: {text[:30]}...")
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                file_size = os.path.getsize(output_path)
                print(f"[TTS] Success! File size: {file_size} bytes")
                return True
            else:
                last_error = "File was not created or empty"
        except subprocess.CalledProcessError as e:
            last_error = e.stderr or str(e)
            print(f"[TTS] CLI Error: {last_error}")
        except subprocess.TimeoutExpired:
            last_error = "Timeout"
            print(f"[TTS] Timeout on attempt {attempt + 1}")
            
    raise Exception(f"Voice generation failed after {max_retries} attempts. Last error: {last_error}")

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200

@app.route("/tts", methods=["POST"])
def tts():
    print("[TTS] Received TTS request")
    temp_path = None
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400
            
        text = data.get("text")
        lang = data.get("lang", "en")
        
        if not text:
            return jsonify({"error": "No text provided"}), 400
        
        if lang not in VOICES:
            return jsonify({"error": f"Unsupported language: {lang}"}), 400

        voice = VOICES[lang]
        filename = f"{uuid.uuid4()}.mp3"
        temp_path = os.path.join(tempfile.gettempdir(), filename)

        print(f"[TTS] Generating {lang} voice to: {temp_path}")
        generate_voice_cli(text, voice, temp_path)

        # Read the file and return as streaming response
        with open(temp_path, 'rb') as f:
            audio_data = f.read()
        
        print(f"[TTS] Streaming {len(audio_data)} bytes")
        
        # Return MP3 with proper headers
        response = Response(audio_data, mimetype='audio/mpeg')
        response.headers['Content-Disposition'] = f'inline; filename="{filename}"'
        response.headers['Content-Length'] = len(audio_data)
        
        return response
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TTS] Server Error: {error_trace}")
        return jsonify({"error": str(e), "trace": error_trace}), 500
    finally:
        # Clean up temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print(f"[TTS] Cleaned up temp file: {temp_path}")
            except Exception as e:
                print(f"[TTS] Failed to clean up: {e}")

# ============== FREESOUND AUDIO ENDPOINTS ==============

@app.route("/audio/search", methods=["GET"])
def search_audio():
    """Search Freesound for sounds by query"""
    query = request.args.get('q', '')
    filter_type = request.args.get('filter', '')  # 'sfx' or 'music'
    page = request.args.get('page', '1')
    
    if not query:
        return jsonify({"error": "No search query provided"}), 400
    
    if not FREESOUND_API_KEY:
        return jsonify({"error": "Freesound API key not configured"}), 500
    
    try:
        # Build search params
        params = {
            'query': query,
            'token': FREESOUND_API_KEY,
            'fields': 'id,name,duration,previews,tags,description',
            'page_size': 15,
            'page': page
        }
        
        # Add duration filter for SFX (short) vs Music (long)
        if filter_type == 'sfx':
            params['filter'] = 'duration:[0 TO 10]'  # Under 10 seconds
        elif filter_type == 'music':
            params['filter'] = 'duration:[30 TO 300]'  # 30s to 5min
        
        print(f"[AUDIO] Searching Freesound: {query} (filter: {filter_type})")
        response = requests.get(f"{FREESOUND_BASE_URL}/search/text/", params=params, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        results = []
        
        for sound in data.get('results', []):
            previews = sound.get('previews', {})
            results.append({
                'id': sound['id'],
                'name': sound['name'],
                'duration': round(sound.get('duration', 0), 2),
                'previewUrl': previews.get('preview-hq-mp3') or previews.get('preview-lq-mp3', ''),
                'tags': sound.get('tags', [])[:5]
            })
        
        print(f"[AUDIO] Found {len(results)} results")
        return jsonify({
            'results': results,
            'count': data.get('count', 0),
            'next': data.get('next'),
            'previous': data.get('previous')
        })
        
    except requests.RequestException as e:
        print(f"[AUDIO] Freesound API error: {e}")
        return jsonify({"error": f"Freesound API error: {str(e)}"}), 500

@app.route("/audio/stream/<int:sound_id>", methods=["GET"])
def stream_audio(sound_id):
    """Stream audio preview from Freesound by sound ID"""
    if not FREESOUND_API_KEY:
        return jsonify({"error": "Freesound API key not configured"}), 500
    
    try:
        # First, get the sound details to find preview URL
        print(f"[AUDIO] Fetching sound {sound_id} details")
        response = requests.get(
            f"{FREESOUND_BASE_URL}/sounds/{sound_id}/",
            params={'token': FREESOUND_API_KEY, 'fields': 'id,name,previews'},
            timeout=10
        )
        response.raise_for_status()
        
        sound_data = response.json()
        previews = sound_data.get('previews', {})
        preview_url = previews.get('preview-hq-mp3') or previews.get('preview-lq-mp3')
        
        if not preview_url:
            return jsonify({"error": "No preview available for this sound"}), 404
        
        # Stream the preview MP3
        print(f"[AUDIO] Streaming from: {preview_url}")
        audio_response = requests.get(preview_url, stream=True, timeout=30)
        audio_response.raise_for_status()
        
        # Return as streaming response
        return Response(
            audio_response.iter_content(chunk_size=8192),
            mimetype='audio/mpeg',
            headers={
                'Content-Disposition': f'inline; filename="sound_{sound_id}.mp3"',
                'Cache-Control': 'public, max-age=86400'  # Cache for 24 hours
            }
        )
        
    except requests.RequestException as e:
        print(f"[AUDIO] Stream error: {e}")
        return jsonify({"error": f"Failed to stream audio: {str(e)}"}), 500

@app.route("/audio/fetch", methods=["GET"])
def fetch_audio_by_query():
    """Search Freesound by query and stream the top result - for Gemini-generated queries"""
    query = request.args.get('q', '')
    audio_type = request.args.get('type', 'sfx')  # 'sfx' or 'music'
    
    if not query:
        return jsonify({"error": "No search query provided"}), 400
    
    if not FREESOUND_API_KEY:
        return jsonify({"error": "Freesound API key not configured"}), 500
    
    try:
        # Build search params
        params = {
            'query': query,
            'token': FREESOUND_API_KEY,
            'fields': 'id,name,duration,previews',
            'page_size': 1,  # Just get top result
            'sort': 'rating_desc'  # Best rated first
        }
        
        # Add duration filter
        if audio_type == 'sfx':
            params['filter'] = 'duration:[0 TO 15]'  # Under 15 seconds for SFX
        elif audio_type == 'music':
            params['filter'] = 'duration:[20 TO 300]'  # 20s to 5min for music
        
        print(f"[AUDIO] Fetching by query: '{query}' (type: {audio_type})")
        response = requests.get(f"{FREESOUND_BASE_URL}/search/text/", params=params, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        results = data.get('results', [])
        
        if not results:
            return jsonify({"error": f"No sounds found for query: {query}"}), 404
        
        # Get the top result
        sound = results[0]
        previews = sound.get('previews', {})
        preview_url = previews.get('preview-hq-mp3') or previews.get('preview-lq-mp3')
        
        if not preview_url:
            return jsonify({"error": "No preview available for this sound"}), 404
        
        print(f"[AUDIO] Found: {sound['name']} (ID: {sound['id']}, duration: {sound.get('duration', 0):.1f}s)")
        print(f"[AUDIO] Streaming from: {preview_url}")
        
        # Stream the preview MP3
        audio_response = requests.get(preview_url, stream=True, timeout=30)
        audio_response.raise_for_status()
        
        return Response(
            audio_response.iter_content(chunk_size=8192),
            mimetype='audio/mpeg',
            headers={
                'Content-Disposition': f'inline; filename="{query.replace(" ", "_")}.mp3"',
                'X-Sound-Id': str(sound['id']),
                'X-Sound-Name': sound['name'],
                'X-Sound-Duration': str(sound.get('duration', 0)),
                'Cache-Control': 'public, max-age=86400'
            }
        )
        
    except requests.RequestException as e:
        print(f"[AUDIO] Fetch error: {e}")
        return jsonify({"error": f"Failed to fetch audio: {str(e)}"}), 500

# ============== IMAGE GENERATION ENDPOINTS ==============

@app.route("/image/generate", methods=["POST"])
def generate_image():
    """Generate image using Playground v2.5 via Hugging Face Inference API"""
    if not HF_API_TOKEN:
        return jsonify({"error": "Hugging Face API token not configured"}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400
        
        prompt = data.get('prompt', '')
        if not prompt:
            return jsonify({"error": "No prompt provided"}), 400
        
        # Optional parameters
        negative_prompt = data.get('negative_prompt', 'blurry, low quality, distorted, deformed')
        width = data.get('width', 1024)
        height = data.get('height', 1024)
        
        print(f"[IMAGE] Generating: {prompt[:50]}...")
        
        # Call Hugging Face Inference API
        headers = {
            'Authorization': f'Bearer {HF_API_TOKEN}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'inputs': prompt,
            'parameters': {
                'negative_prompt': negative_prompt,
                'width': width,
                'height': height,
                'num_inference_steps': 30,
                'guidance_scale': 7.5
            }
        }
        
        response = requests.post(HF_API_URL, headers=headers, json=payload, timeout=120)
        
        # Check for model loading (503)
        if response.status_code == 503:
            error_data = response.json()
            estimated_time = error_data.get('estimated_time', 60)
            print(f"[IMAGE] Model loading, estimated time: {estimated_time}s")
            return jsonify({
                "error": "Model is loading",
                "estimated_time": estimated_time,
                "retry": True
            }), 503
        
        response.raise_for_status()
        
        # Response is raw image bytes
        image_bytes = response.content
        print(f"[IMAGE] Generated {len(image_bytes)} bytes")
        
        # Return as base64 for easy frontend consumption
        import base64
        image_base64 = base64.b64encode(image_bytes).decode('utf-8')
        
        return jsonify({
            "image": f"data:image/png;base64,{image_base64}",
            "prompt": prompt,
            "model": HF_IMAGE_MODEL
        })
        
    except requests.RequestException as e:
        print(f"[IMAGE] Generation error: {e}")
        return jsonify({"error": f"Image generation failed: {str(e)}"}), 500
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[IMAGE] Server Error: {error_trace}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("="*60)
    print("SceneSynth Media Server (TTS + Audio + Image)")
    print("="*60)
    print(f"Python: {sys.executable}")
    print(f"TTS Voices: {VOICES}")
    print(f"Freesound API: {'Configured' if FREESOUND_API_KEY else 'NOT CONFIGURED'}")
    print(f"HuggingFace API: {'Configured' if HF_API_TOKEN else 'NOT CONFIGURED'}")
    print("Starting server on http://localhost:5006")
    print("="*60)
    app.run(host='0.0.0.0', port=5006, debug=True)
