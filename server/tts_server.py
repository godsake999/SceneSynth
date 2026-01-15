from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import os
import uuid
import subprocess
import sys
import tempfile

app = Flask(__name__)
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

if __name__ == "__main__":
    print("="*60)
    print("Edge-TTS Server for SceneSynth (Streaming Mode)")
    print("="*60)
    print(f"Python: {sys.executable}")
    print(f"Voices: {VOICES}")
    print("Starting server on http://localhost:5006")
    print("="*60)
    app.run(host='0.0.0.0', port=5006, debug=True)
