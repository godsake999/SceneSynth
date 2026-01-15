# Edge-TTS Server for SceneSynth

## Deployment to Render.com

### Prerequisites
- GitHub account
- Render.com account (free)

### Step 1: Prepare Repository

Your `server/` folder is already set up! It contains:
- `tts_server.py` - Flask server (streaming mode)
- `requirements.txt` - Python dependencies

### Step 2: Deploy to Render

1. **Push to GitHub** (if not already):
   ```bash
   cd D:\WebProjects\SceneSynth
   git add server/
   git commit -m "Add edge-tts server for deployment"
   git push
   ```

2. **Create Web Service on Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repo: `godsake999/SceneSynth`
   - Fill in:
     - **Name**: `scenesynth-tts` (or your choice)
     - **Root Directory**: `server`
     - **Runtime**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `python tts_server.py`
     - **Instance Type**: `Free`

3. **Deploy**:
   - Click "Create Web Service"
   - Wait 2-3 minutes for deployment
   - You'll get a URL like: `https://scenesynth-tts.onrender.com`

### Step 3: Update Frontend

In `services/geminiService.ts`, change:
```typescript
const TTS_SERVER_URL = 'http://localhost:5006';
// to:
const TTS_SERVER_URL = 'https://scenesynth-tts.onrender.com';
```

### Step 4: Test

- Click "Voice It" in AI Studio
- First request after 15min idle = ~30s delay (cold start)
- Subsequent requests = 2-5 seconds

### Notes

- **Free Tier**: Sleeps after 15min inactivity, wakes in ~30s
- **Always-On**: Upgrade to $7/mo to eliminate cold starts
- **Logs**: View real-time logs in Render dashboard
- **Auto-Deploy**: Pushes to GitHub trigger automatic redeployment

### Troubleshooting

**If deployment fails:**
1. Check Render logs for errors
2. Ensure `requirements.txt` has all dependencies
3. Verify Python version (3.8+)

**If audio generation fails:**
1. Check Render logs for edge-tts errors
2. Test locally first: `http://localhost:5006/health`
3. Increase timeout in Render settings if needed
