"""
Combined Flask server for local development
Runs both generate and tts endpoints
"""
from api.generate import app as generate_app
from api.tts import tts_handler
from flask import request
import os

# Use the generate app as the main app
app = generate_app

# Add TTS route to the main app
@app.route('/api/tts', methods=['POST'])
@app.route('/tts', methods=['POST'])
def tts_route():
    return tts_handler()

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 SceneSynth Backend Server Starting...")
    print("=" * 60)
    print(f"📍 Server will run on: http://127.0.0.1:5328")
    print(f"🔑 API_KEY loaded: {'✅ Yes' if os.environ.get('API_KEY') else '❌ NO - Set in .env!'}")
    print("=" * 60)
    print()
    
    app.run(
        host='127.0.0.1',
        port=5328,
        debug=True,
        use_reloader=True
    )
