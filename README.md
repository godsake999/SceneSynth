<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-a db2-6e31a0763ed6" />
</div>

# SceneSynth - AI Story Video Generator

Create engaging YouTube Shorts with AI-powered story generation, image generation, and voice narration in both **English** and **Myanmar/Burmese**.

## Features ✨

- 🎬 **5-Scene Story Generation** (Gemini 3 Flash)
- 🖼️ **Character-Consistent Images** (Gemini 2.5 Flash Image + Flux fallback)
- 🎤 **Bilingual TTS** (English & Myanmar)
  - Primary: **Gemini TTS** (high quality)
  - Fallback: **Edge-TTS** (local, reliable)
  - Additional fallbacks: StreamElements, SoundOfText
- 📹 **Video Export** to YouTube Shorts format (9:16)
- ⚙️ **Visual Bible** for consistent character appearance

## New: Edge-TTS Integration 🆕

This version includes **edge-tts** as a high-quality fallback for when Gemini TTS hits rate limits. Benefits:
- ✅ Better voice quality than cloud alternatives
- ✅ No daily rate limits
- ✅ Supports both English (en-US-GuyNeural) and Myanmar (my-MM-ThihaNeural) male voices
- ✅ Runs locally for privacy and speed

## Setup

### Prerequisites
- Node.js (v18+)
- Python 3.8+

### 1. Install Frontend Dependencies
```bash
npm install
```

### 2. Set up Python TTS Server
```bash
cd server
python -m venv venv

# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure API Keys
Create `.env.local` in the project root:
```env
GEMINI_API_KEY=your_gemini_api_key_here
VITE_API_KEY=${GEMINI_API_KEY}
```

Get your Gemini API key from: https://aistudio.google.com/app/apikey

### 4. Run the Application

**Terminal 1** - Frontend:
```bash
npm run dev
```
Open http://localhost:3000

**Terminal 2** - TTS Server:
```bash
cd server
venv\Scripts\activate  # Windows
python tts_server.py
```
Server runs on http://localhost:5006

## Usage

1. Enter a story topic (e.g., "The Lion and the Mouse")
2. Choose a visual style (Cinematic, Animated, etc.)
3. Select language (English or Myanmar)
4. Click "Generate Story"
5. Edit scenes if needed
6. Generate images and voiceovers
7. Export as video!

## TTS Fallback Chain

```
Gemini TTS (best quality)
    ↓ (on failure/rate limit)
Edge-TTS (high quality, local)
    ↓ (on failure)
StreamElements (cloud API)
    ↓ (on failure)
SoundOfText (last resort)
```

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **AI:** Google Gemini (text, image, TTS)
- **TTS Fallback:** Python Flask + edge-tts
- **Video:** HTML5 Canvas rendering

## License

MIT

---

View original AI Studio app: https://ai.studio/apps/drive/12cMqT9NOTlHif3BFk5Ll5Sar22IKg3mb
