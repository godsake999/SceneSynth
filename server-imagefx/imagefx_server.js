import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = process.env.PORT || 5008;
const GOOGLE_COOKIE = process.env.GOOGLE_COOKIE || '';

// Lazy-load ImageFX to handle import errors gracefully
let ImageFX, Prompt;

async function loadImageFX() {
    if (!ImageFX) {
        const mod = await import('@rohitaryal/imagefx-api');
        ImageFX = mod.ImageFX;
        Prompt = mod.Prompt;
    }
}

// --- Health Check ---
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        hasCookie: !!GOOGLE_COOKIE,
        cookieLength: GOOGLE_COOKIE.length
    });
});

// --- Generate Image ---
app.post('/imagefx', async (req, res) => {
    const startTime = Date.now();
    console.log('[ImageFX] Received generation request');

    try {
        if (!GOOGLE_COOKIE) {
            return res.status(500).json({
                error: 'GOOGLE_COOKIE environment variable not set. Please add your Google account cookies.'
            });
        }

        const { prompt, aspectRatio, model } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'No prompt provided' });
        }

        console.log(`[ImageFX] Prompt: "${prompt.substring(0, 80)}..."`);
        console.log(`[ImageFX] Model: ${model || 'IMAGEN_3_5'}, Aspect: ${aspectRatio || 'PORTRAIT'}`);

        await loadImageFX();

        const fx = new ImageFX(GOOGLE_COOKIE);

        // Build the prompt object
        const promptObj = new Prompt({
            prompt: prompt,
            generationModel: model || 'IMAGEN_3_5',
            aspectRatio: aspectRatio || 'IMAGE_ASPECT_RATIO_PORTRAIT',
            numberOfImages: 1
        });

        // Generate the image
        const images = await fx.generateImage(promptObj);

        if (!images || images.length === 0) {
            throw new Error('No images returned from ImageFX');
        }

        // Get the first image
        const image = images[0];

        // The image object has encodedImage (base64) property
        const base64Data = image.encodedImage;

        if (!base64Data) {
            throw new Error('Generated image has no encoded data');
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[ImageFX] Success! Generated in ${elapsed}s`);

        res.json({
            image: `data:image/png;base64,${base64Data}`,
            model: model || 'IMAGEN_4',
            elapsed: parseFloat(elapsed)
        });

    } catch (err) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.error(`[ImageFX] Error after ${elapsed}s:`, err.message || err);

        // Detect cookie expiration
        const isCookieError = err.message?.includes('auth') ||
            err.message?.includes('cookie') ||
            err.message?.includes('401') ||
            err.message?.includes('403');

        res.status(500).json({
            error: err.message || 'Image generation failed',
            isCookieError,
            hint: isCookieError
                ? 'Your Google cookie may have expired. Please refresh it from your browser.'
                : 'Check server logs for details.'
        });
    }
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('ImageFX Server for SceneSynth (Imagen 4)');
    console.log('='.repeat(60));
    console.log(`Port: ${PORT}`);
    console.log(`Cookie: ${GOOGLE_COOKIE ? `Set (${GOOGLE_COOKIE.length} chars)` : '❌ NOT SET'}`);
    console.log(`Endpoint: POST http://localhost:${PORT}/imagefx`);
    console.log('='.repeat(60));
});
