from flask import Flask, request, send_file
import edge_tts
import asyncio
import io

app = Flask(__name__)

@app.route('/api/tts', methods=['POST'])
def tts_handler():
    data = request.get_json()
    text = data.get('text')
    voice = data.get('voice', 'en-US-ChristopherNeural')

    if not text:
        return {"error": "No text provided"}, 400

    # Create a memory buffer to hold the audio
    audio_buffer = io.BytesIO()

    async def generate_audio():
        communicate = edge_tts.Communicate(text, voice)
        # Stream chunks into the buffer instead of saving to file
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.write(chunk["data"])

    # Run the async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(generate_audio())

    # Rewind buffer to the beginning so it can be read
    audio_buffer.seek(0)

    # Send the audio back to React
    return send_file(
        audio_buffer,
        mimetype="audio/mpeg",
        as_attachment=False,
        download_name="narration.mp3"
    )
