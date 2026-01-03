from flask import Flask, request, jsonify
from google import genai
from google.genai import types
import os
import json

app = Flask(__name__)

# Initialize client with Server-Side Key (from Vercel Env Vars)
# Note: In Vercel, this automatically reads "API_KEY" or "GEMINI_API_KEY"
client = genai.Client(api_key=os.environ.get("API_KEY"))

@app.route('/api/generate', methods=['POST'])
def generate_handler():
    try:
        data = request.get_json()
        action = data.get('action')
        
        if not action:
            return jsonify({"error": "No action provided"}), 400

        # --- ACTION 1: Generate Story Plan ---
        if action == 'story_plan':
            topic = data.get('topic')
            style = data.get('style')
            prompt = f"Create a 5-scene YouTube Short plan. Topic: {topic}. Style: {style}. Return JSON."
            
            response = client.models.generate_content(
                model="gemini-2.0-flash", # or gemini-1.5-flash / gemini-3-flash-preview depending on availability
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "title": {"type": "STRING"},
                            "outroMessage": {"type": "STRING"},
                            "introImagePrompt": {"type": "STRING"},
                            "scenes": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "storyLine": {"type": "STRING"},
                                        "imagePrompt": {"type": "STRING"}
                                    }
                                }
                            }
                        }
                    }
                )
            )
            return jsonify(json.loads(response.text))

        # --- ACTION 2: Generate Scene Image ---
        elif action == 'scene_image':
            prompt = data.get('prompt')
            full_prompt = f"Cinematic scene: {prompt}, vertical 9:16, high detail, 4k"
            
            response = client.models.generate_content(
                model='gemini-2.0-flash', # Use a model that supports image generation
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="image/jpeg",
                    # Add specific image generation params if supported by the specific model version
                )
            )
            
            # Use the bytes directly if available, or base64 from the response
            # Note: The Python SDK return structure for images varies by model version.
            # This is a generic handler for the generated image bytes.
            if response.bytes:
                 import base64
                 b64_string = base64.b64encode(response.bytes).decode('utf-8')
                 return jsonify({"image_data": f"data:image/jpeg;base64,{b64_string}"})
            
            # Fallback for structured response
            return jsonify({"error": "No image generated"}), 500

        # --- ACTION 3: Generate Single Text Elements (Title/Outro/Single Scene) ---
        elif action == 'text_only':
            prompt = data.get('prompt')
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt
            )
            return jsonify({"text": response.text.strip()})

        # --- ACTION 4: JSON Text (Single Scene) ---
        elif action == 'single_scene_json':
            prompt = data.get('prompt')
            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema={
                        "type": "OBJECT",
                        "properties": {
                            "storyLine": {"type": "STRING"},
                            "imagePrompt": {"type": "STRING"}
                        }
                    }
                )
            )
            return jsonify(json.loads(response.text))
# --- ACTION 5: Gemini TTS (Tier 3 Fallback) ---
        elif action == 'tts_gemini':
            text = data.get('text')
            voice_name = data.get('voice', 'Kore') # Default Gemini voice
            
            # Using the new Google GenAI SDK for Python
            # Note: The model name for TTS is often 'models/gemini-2.0-flash-exp' or specific TTS endpoints
            # For safety, let's use the standard generate_content if the model supports audio, 
            # OR use the specific speech endpoint if available in your SDK version.
            
            # Since Python SDK implementation for TTS varies by version, 
            # here is the standard request structure:
            response = client.models.generate_content(
                model='gemini-2.5-flash-tts', # Ensure you use a model that supports speech generation
                contents=text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=voice_name
                            )
                        )
                    )
                )
            )
            
            # Extract audio bytes
            # The structure depends on the response, usually inside parts
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    import base64
                    # Return as Base64 JSON so frontend can play it
                    b64_data = base64.b64encode(part.inline_data.data).decode('utf-8')
                    return jsonify({"audio_data": f"data:audio/mp3;base64,{b64_data}"})
            
            return jsonify({"error": "No audio generated"}), 500
        return jsonify({"error": "Invalid action"}), 400

    except Exception as e:
        print(f"Backend Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

