from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import edge_tts
import asyncio
import io

app = Flask(__name__)
CORS(app)

@app.route('/api/tts', methods=['POST'])
def tts_handler():
    data = request.get_json()
    text = data.get('text', '').strip()
    voice = data.get('voice', 'en-US-ChristopherNeural')

    if not text:
        return jsonify({"error": "No text provided"}), 400

    if len(text) > 5000:
        return jsonify({"error": "Text too long (max 5000 chars)"}), 400

    try:
        audio_buffer = io.BytesIO()

        async def generate_audio():
            communicate = edge_tts.Communicate(text, voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])

        # Run the async function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(generate_audio())
        loop.close()

        audio_buffer.seek(0)

        return send_file(
            audio_buffer,
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name="narration.mp3"
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500