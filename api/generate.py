from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import concurrent.futures
from functools import wraps
import base64
import urllib.request

# Load .env for local development only
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not needed on Vercel

from google import genai
from google.genai import types

app = Flask(__name__)
CORS(app)
print("🚀 SceneSynth API: generate.py loaded")

# Lazy client initialization to prevent startup issues
_client = None
def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("API_KEY")
        if not api_key:
            print("⚠️ WARNING: API_KEY not found in environment")
        _client = genai.Client(api_key=api_key)
    return _client

# Timeout for image generation (seconds) - keep under Vercel's 60s limit
IMAGE_GENERATION_TIMEOUT = 45


def with_timeout(timeout_seconds):
    """Decorator to add timeout to functions"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(func, *args, **kwargs)
                try:
                    return future.result(timeout=timeout_seconds)
                except concurrent.futures.TimeoutError:
                    raise TimeoutError(f"Operation timed out after {timeout_seconds}s")
        return wrapper
    return decorator


@app.route('/api/generate', methods=['POST'])
def generate_handler():
    try:
        body = request.get_json()
        action = body.get('action')
        
        print(f"🔵 Received request: action='{action}'")
        print(f"   Body keys: {list(body.keys())}")
        
        if action == 'generateStoryPlan':
            result = generate_story_plan(
                body.get('topic', ''), 
                body.get('style', '')
            )
        elif action == 'generateSceneImage':
            print(f"   → Generating image for prompt: {body.get('prompt', '')[:50]}...")
            result = generate_scene_image_with_timeout(body.get('prompt', ''))
        elif action == 'generateSingleSceneText':
            result = generate_single_scene_text(
                body.get('topic', ''),
                body.get('sceneIndex', 0),
                body.get('context', '')
            )
        elif action == 'generateIntroTitle':
            result = generate_intro_title(
                body.get('topic', ''),
                body.get('style', '')
            )
        elif action == 'generateOutroMessage':
            result = generate_outro_message(body.get('topic', ''))
        elif action == 'generateGeminiTTS':
            result = generate_gemini_tts(body.get('text', ''))
        elif action == 'proxyFlux':
            print(f"   → Proxying Flux image: {body.get('url', '')[:50]}...")
            result = proxy_flux(body.get('url', ''))
        elif action == 'proxySoT':
            result = proxy_sot(body.get('url', ''))
        else:
            print(f"   ❌ Unknown action: {action}")
            return jsonify({"error": f"Unknown action: {action}"}), 400
        
        print(f"   ✅ Response ready (success={result.get('success', 'N/A')})")
        return jsonify(result)
    
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "success": False}), 500


# ===== STORY PLAN GENERATION =====
def generate_story_plan(topic: str, style: str) -> dict:
    prompt = f"Create a 5-scene YouTube Short plan. Topic: {topic}. Style: {style}. Return JSON."
    
    schema = types.Schema(
        type=types.Type.OBJECT,
        properties={
            "title": types.Schema(type=types.Type.STRING),
            "outroMessage": types.Schema(type=types.Type.STRING),
            "introImagePrompt": types.Schema(type=types.Type.STRING),
            "scenes": types.Schema(
                type=types.Type.ARRAY,
                items=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "storyLine": types.Schema(type=types.Type.STRING),
                        "imagePrompt": types.Schema(type=types.Type.STRING),
                    },
                    required=["storyLine", "imagePrompt"]
                )
            )
        },
        required=["title", "outroMessage", "scenes"]
    )
    
    try:
        response = get_client().models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema
            )
        )
        return json.loads(response.text)
    except Exception as e:
        return {
            "title": topic,
            "outroMessage": "Thanks for watching!",
            "introImagePrompt": topic,
            "scenes": [
                {"storyLine": f"Scene {i+1} about {topic}", "imagePrompt": topic}
                for i in range(5)
            ]
        }


# ===== IMAGE GENERATION (with timeout) =====
def generate_scene_image_with_timeout(prompt: str) -> dict:
    """Wrapper that catches timeout and returns fallback signal"""
    try:
        return _generate_scene_image_internal(prompt)
    except TimeoutError as e:
        return {
            "success": False,
            "error": str(e),
            "source": "timeout",
            "useFallback": True
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "source": "error",
            "useFallback": True
        }


@with_timeout(IMAGE_GENERATION_TIMEOUT)
def _generate_scene_image_internal(prompt: str) -> dict:
    """Actual Gemini image generation with timeout decorator"""
    full_prompt = f"Generate a high-quality cinematic image: {prompt}. Vertical 9:16 aspect ratio, professional photography, 4k quality."
    
    try:
        print(f"   🎨 Trying Gemini image generation with gemini-2.5-flash-image...")
        
        # Use the specialized IMAGE generation model
        response = get_client().models.generate_content(
            model="gemini-2.5-flash-image",
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
            )
        )
        
        # Parse the binary image data from inline_data
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    image_data = part.inline_data.data
                    mime_type = part.inline_data.mime_type
                    print(f"   ✅ Gemini generated image: {len(image_data)} bytes, {mime_type}")
                    return {
                        "success": True,
                        "data": f"data:{mime_type};base64,{image_data}",
                        "source": "gemini",
                        "useFallback": False
                    }
        
        # No image data found
        print(f"   ⚠️ No image data in Gemini response")
        return {
            "success": False,
            "error": "No image data in Gemini response",
            "source": "gemini_empty",
            "useFallback": True
        }
        
    except Exception as e:
        error_msg = str(e)
        print(f"   ❌ Gemini image generation error: {error_msg}")
        return {
            "success": False,
            "error": f"Gemini error: {error_msg}",
            "source": "gemini_error",
            "useFallback": True
        }


# ===== SINGLE SCENE TEXT =====
def generate_single_scene_text(topic: str, scene_index: int, context: str) -> dict:
    schema = types.Schema(
        type=types.Type.OBJECT,
        properties={
            "storyLine": types.Schema(type=types.Type.STRING),
            "imagePrompt": types.Schema(type=types.Type.STRING),
        },
        required=["storyLine", "imagePrompt"]
    )
    
    try:
        response = get_client().models.generate_content(
            model="gemini-1.5-flash",
            contents=f"Write Scene {scene_index} for a video about {topic}. Context: {context}. Return JSON.",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema
            )
        )
        return json.loads(response.text)
    except Exception as e:
        return {
            "storyLine": f"Scene {scene_index} about {topic}",
            "imagePrompt": topic
        }


# ===== INTRO TITLE =====
def generate_intro_title(topic: str, style: str) -> dict:
    try:
        response = get_client().models.generate_content(
            model="gemini-1.5-flash",
            contents=f"One short catchy title for a video about {topic}. Text only."
        )
        title = response.text.strip() if response.text else topic
        return {"title": title}
    except Exception as e:
        return {"title": topic}


# ===== OUTRO MESSAGE =====
def generate_outro_message(topic: str) -> dict:
    try:
        response = get_client().models.generate_content(
            model="gemini-1.5-flash",
            contents=f"One short outro CTA for {topic}. Text only."
        )
        message = response.text.strip() if response.text else "Thanks for watching!"
        return {"message": message}
    except Exception as e:
        return {"message": "Thanks for watching!"}


# ===== GEMINI TTS =====
def generate_gemini_tts(text: str) -> dict:
    model_name = "gemini-2.5-flash-preview-tts"  # Use the specialized TTS model
    
    try:
        print(f"   🔊 Generating Audio with {model_name}...")
        
        response = get_client().models.generate_content(
            model=model_name,
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],  # Explicitly request AUDIO
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Kore" 
                        )
                    )
                )
            )
        )

        # 🛑 CRITICAL: Do NOT access response.text here. 
        # It will try to decode the audio bytes as a string and crash.

        # Correctly find the binary part
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    # part.inline_data.data is RAW BYTES (e.g., 0xe1, 0xff...)
                    # We must base64 encode it BEFORE decoding to string
                    raw_bytes = part.inline_data.data
                    mime_type = part.inline_data.mime_type or "audio/mp3"
                    b64_data = base64.b64encode(raw_bytes).decode('utf-8')
                    
                    print(f"   ✅ Gemini generated audio: {len(raw_bytes)} bytes, {mime_type}")
                    return {
                        "success": True,
                        "audio": b64_data,
                        "mimeType": mime_type,
                        "source": "gemini"
                    }

        print("   ⚠️ No inline_data (binary audio) found in response parts.")
        return {"success": False, "error": "No audio data returned", "source": "failed"}

    except Exception as e:
        error_msg = str(e)
        print(f"   ❌ Gemini TTS Error: {error_msg}")
        return {"success": False, "error": error_msg, "source": "failed"}

# ===== PROXY HELPERS (To avoid CORS) =====
def proxy_flux(url: str) -> dict:
    try:
        print(f"   📥 Fetching from Pollinations: {url[:80]}...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            mime_type = response.info().get_content_type()
            print(f"   📦 Downloaded {len(data)} bytes, mime_type={mime_type}")
            
            base64_data = base64.b64encode(data).decode('utf-8')
            result_data = f"data:{mime_type};base64,{base64_data}"
            
            print(f"   ✅ Returning base64 data (length={len(result_data)})")
            return {
                "success": True,
                "data": result_data
            }
    except Exception as e:
        print(f"   ❌ Proxy error: {e}")
        return {"success": False, "error": str(e)}

def proxy_sot(url: str) -> dict:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = response.read()
            base64_data = base64.b64encode(data).decode('utf-8')
            return {
                "success": True,
                "data": base64_data
            }
    except Exception as e:
        return {"success": False, "error": str(e)}