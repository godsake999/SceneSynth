# ImageFX Server Deployment to Render.com

## Prerequisites
- GitHub account
- Render.com account (free)
- Google account cookies from labs.google

## Step 1: Get Your Google Cookie

1. Open Chrome → go to **labs.google/fx/tools/image-fx**
2. Sign in to your Google account
3. Press **F12** → **Application** tab → **Cookies** → `labs.google`
4. Install [Cookie Editor extension](https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm)
5. Click the Cookie Editor icon → **Export** → **Header String**
6. Save this string — you'll paste it into Render

## Step 2: Deploy to Render

1. Push to GitHub:
   ```bash
   cd D:\WebProjects\SceneSynth
   git add server-imagefx/
   git commit -m "Add ImageFX server"
   git push
   ```

2. Create Web Service on Render:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repo: `godsake999/SceneSynth`
   - Fill in:
     - **Name**: `scenesynth-imagefx`
     - **Root Directory**: `server-imagefx`
     - **Runtime**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`

3. Add Environment Variable:
   - Go to **Environment** tab
   - Add: `GOOGLE_COOKIE` = (paste your cookie string)

4. Deploy → You'll get a URL like: `https://scenesynth-imagefx.onrender.com`

## Step 3: Update Frontend

In `services/geminiService.ts`, update:
```typescript
const IMAGEFX_SERVER_URL = 'https://scenesynth-imagefx.onrender.com';
```

## Cookie Refresh

When ImageFX stops working (auth errors):
1. Go to labs.google/fx/tools/image-fx in Chrome
2. Export cookies with Cookie Editor
3. Go to Render dashboard → Environment → update `GOOGLE_COOKIE`
4. Save → auto-redeploys in ~1-2 minutes
