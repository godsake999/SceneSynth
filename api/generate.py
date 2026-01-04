from flask import Flask, request, jsonify
import os
import json
import concurrent.futures
from functools import wraps

from google import genai
from google.genai import types

app = Flask(__name__)

# Initialize Gemini client
client = genai.Client(api_key=os.environ.get("API_KEY"))

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
        
        if action == 'generateStoryPlan':
            result = generate_story_plan(
                body.get('topic', ''), 
                body.get('style', '')
            )
        elif action == 'generateSceneImage':
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
        else:
            return jsonify({"error": f"Unknown action: {action}"}), 400
        
        return jsonify(result)
    
    except Exception as e:
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
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
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
    full_prompt = f"Cinematic scene: {prompt}, vertical 9:16, high detail, 4k"
    
    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-04-17",
        contents=full_prompt,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
        )
    )
    
    if response.candidates and response.candidates[0].content.parts:
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                image_data = part.inline_data.data
                mime_type = part.inline_data.mime_type
                return {
                    "success": True,
                    "data": f"data:{mime_type};base64,{image_data}",
                    "source": "gemini",
                    "useFallback": False
                }
    
    raise ValueError("No image data in response")


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
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
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
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f"One short catchy title for a video about {topic}. Text only."
        )
        title = response.text.strip() if response.text else topic
        return {"title": title}
    except Exception as e:
        return {"title": topic}


# ===== OUTRO MESSAGE =====
def generate_outro_message(topic: str) -> dict:
    try:
        response = client.models.generate_content(
            model="gemini-3-flash-preview",
            contents=f"One short outro CTA for {topic}. Text only."
        )
        message = response.text.strip() if response.text else "Thanks for watching!"
        return {"message": message}
    except Exception as e:
        return {"message": "Thanks for watching!"}


# ===== GEMINI TTS =====
def generate_gemini_tts(text: str) -> dict:
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-tts",
            contents=text,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Kore"
                        )
                    )
                )
            )
        )
        
        if response.candidates and response.candidates[0].content.parts:
            audio_data = response.candidates[0].content.parts[0].inline_data.data
            mime_type = response.candidates[0].content.parts[0].inline_data.mime_type
            return {
                "success": True,
                "audio": audio_data,
                "mimeType": mime_type or "audio/pcm;rate=24000",
                "source": "gemini"
            }
        
        raise ValueError("No audio data in response")
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "source": "failed"
        }