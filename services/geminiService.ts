
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryResponse, GenerationSource, GenerationStrategy } from "../types";

export interface GenerationResult<T> {
  data: T;
  source: GenerationSource;
}

// --- HELPERS ---

const extractBase64Data = (dataUrl: string) => {
  const parts = dataUrl.split(',');
  if (parts.length < 2) return { data: dataUrl, mimeType: 'image/png' };
  const mimeMatch = parts[0].match(/:(.*?);/);
  return {
    data: parts[1],
    mimeType: mimeMatch ? mimeMatch[1] : 'image/png'
  };
};

/**
 * Robustly attempts to convert a remote image URL to base64.
 * Useful for passing fallback images back to Gemini for context.
 */
const imageUrlToBase64 = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for base64 conversion"));
    img.src = url;
  });
};

const translateToMyanmar = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Translate the following text to Myanmar (Burmese). If the text is already in Myanmar, strictly return it as is. If it is English, translate it to natural spoken Myanmar. Return ONLY the translated text. Text: "${text}"`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    return response.text?.trim() || text;
  } catch (e) {
    console.warn("Translation failed, using original text", e);
    return text;
  }
};

// --- FALLBACK SERVICES ---

const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Generating Pollinations (Flux) fallback URL...");
  const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
  const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, vertical 9:16, masterpiece, hyper-realistic, 8k");
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${seed}`;
};

const IMAGEFX_SERVER_URL = 'http://localhost:5008';

const generateImageFXImage = async (prompt: string): Promise<string> => {
  console.warn("Generating ImageFX (Imagen 4) image...");
  const response = await fetch(`${IMAGEFX_SERVER_URL}/imagefx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `${prompt}, cinematic, vertical 9:16, hyper-realistic, 8k`,
      aspectRatio: 'IMAGE_ASPECT_RATIO_PORTRAIT'
    })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'ImageFX generation failed');
  }
  const data = await response.json();
  return data.image;
};

const generateGeminiTTS = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio returned from Gemini");
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const pcmBytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) pcmBytes[i] = binaryString.charCodeAt(i);
  const pcmBlob = new Blob([pcmBytes], { type: 'audio/pcm;rate=24000' });
  return URL.createObjectURL(pcmBlob);
};

const generateStreamElementsTTS = async (text: string, lang: 'en' | 'my'): Promise<string> => {
  // StreamElements often maps to Google TTS voices. 'my-MM-Standard-A' is a common code for Burmese.
  // 'en-US-Standard-C' is the default English voice we liked.
  const voice = lang === 'my' ? 'my-MM-Standard-A' : 'en-US-Standard-C';
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(text.trim().slice(0, 500))}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("StreamElements TTS API failed");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

const generateSoundOfTextTTS = async (text: string, lang: 'en' | 'my'): Promise<string> => {
  try {
    const createResponse = await fetch('https://api.soundoftext.com/sounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'Google',
        data: {
          text: text.slice(0, 200),
          voice: lang === 'my' ? 'my' : 'en-US'
        }
      })
    });
    if (!createResponse.ok) throw new Error(`SoT Init Error: ${createResponse.status}`);
    const createData = await createResponse.json();
    const id = createData.id;
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 500));
      const checkResponse = await fetch(`https://api.soundoftext.com/sounds/${id}`);
      const checkData = await checkResponse.json();
      if (checkData.status === 'Done') {
        const audioRes = await fetch(checkData.location);
        const blob = await audioRes.blob();
        return URL.createObjectURL(blob);
      }
      attempts++;
    }
    throw new Error("SoT timed out");
  } catch (e) {
    throw new Error("SoundOfText Failed");
  }
};

const generateEdgeTTS = async (text: string, lang: 'en' | 'my'): Promise<string> => {
  try {
    const TTS_SERVER_URL = 'https://scenesynth-1.onrender.com';

    const response = await fetch(`${TTS_SERVER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim().slice(0, 500), lang })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge-TTS error: ${response.status} - ${errorText}`);
    }

    console.log('[TTS] Response Content-Type:', response.headers.get('content-type'));
    console.log('[TTS] Response size:', response.headers.get('content-length'), 'bytes');

    // Response is raw MP3 bytes
    const arrayBuffer = await response.arrayBuffer();
    console.log('[TTS] Received', arrayBuffer.byteLength, 'bytes');

    if (arrayBuffer.byteLength === 0) {
      throw new Error('Received empty audio data');
    }

    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    console.log('[TTS] Created audio blob, size:', blob.size);

    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Edge-TTS failed:", e);
    throw e;
  }
};



// --- CORE SERVICES ---

export const generateStoryPlan = async (topic: string, style: string, sceneCount: number = 5, retryCount = 0): Promise<StoryResponse> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  const prompt = `Create a ${sceneCount}-scene YouTube Short plan. Topic: ${topic}. Style: ${style}. 
  Include a 'visualBible' field that defines a consistent character appearance and environmental lighting. 
  Also provide an introImagePrompt and an outroImagePrompt. Return JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        // Setting thinkingBudget to 0 often resolves transient RPC errors for structured JSON tasks
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            outroMessage: { type: Type.STRING },
            introImagePrompt: { type: Type.STRING },
            outroImagePrompt: { type: Type.STRING },
            visualBible: { type: Type.STRING },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  storyLine: { type: Type.STRING },
                  imagePrompt: { type: Type.STRING },
                }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text!) as StoryResponse;
  } catch (e) {
    if (retryCount < 1) {
      console.warn("Retrying story plan due to RPC failure...");
      return generateStoryPlan(topic, style, sceneCount, retryCount + 1);
    }
    console.error("Story Plan Error:", e);
    return {
      title: topic,
      outroMessage: "Thanks for watching!",
      visualBible: `Cinematic style, ${style}.`,
      introImagePrompt: `Title card for ${topic}`,
      outroImagePrompt: `Final scene for ${topic}`,
      scenes: Array(sceneCount).fill(0).map((_, i) => ({ storyLine: `Scene ${i + 1}`, imagePrompt: topic }))
    };
  }
};

export const generateSceneImage = async (
  prompt: string,
  strategy: GenerationStrategy = 'smart',
  visualBible?: string,
  previousImage?: string
): Promise<GenerationResult<string>> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  const compositePrompt = `GLOBAL VISUAL BIBLE: ${visualBible || 'Cinematic'}. SCENE: ${prompt}. TECHNICAL: 9:16 vertical, photorealistic, 8k.`;

  if (strategy === 'force-fallback') {
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }

  if (strategy === 'force-imagefx') {
    return { data: await generateImageFXImage(prompt), source: 'imagefx' };
  }

  try {
    const parts: any[] = [];
    if (previousImage) {
      try {
        let base64 = previousImage;
        if (!previousImage.startsWith('data:')) base64 = await imageUrlToBase64(previousImage);
        const { data, mimeType } = extractBase64Data(base64);
        parts.push({ inlineData: { data, mimeType } });
        parts.push({ text: "Maintain visual continuity from this previous frame." });
      } catch (e) { console.warn("Continuity context skipped."); }
    }
    parts.push({ text: compositePrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: { imageConfig: { aspectRatio: "9:16" } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return { data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, source: 'gemini' };
    }
    throw new Error("No image returned");
  } catch (e) {
    if (strategy === 'gemini-only') throw e;
    // Smart fallback: try ImageFX first, then Flux
    console.warn('Gemini image failed, trying ImageFX fallback...');
    try {
      return { data: await generateImageFXImage(prompt), source: 'imagefx' };
    } catch (imagefxErr) {
      console.warn('ImageFX also failed, falling back to Flux:', imagefxErr);
      return { data: await generateFluxImage(prompt), source: 'fallback' };
    }
  }
};

export const generateSpeech = async (
  text: string,
  strategy: GenerationStrategy = 'smart',
  language: 'en' | 'my' = 'en'
): Promise<GenerationResult<string>> => {
  if (!text.trim()) throw new Error("No text for speech.");

  // 1. Translation Step (if Myanmar is requested)
  // TEMPORARILY DISABLED: Gemini translation fails due to blocked API key
  let textToSpeak = text;
  // if (language === 'my') {
  //   textToSpeak = await translateToMyanmar(text);
  // }

  // 2. Generation Step
  // WORKAROUND: Skip Gemini entirely and use edge-tts directly
  console.log(`[TTS] Generating ${language} speech for:`, text.slice(0, 50));

  if (language === 'my') {
    // Myanmar: Use edge-tts as primary
    console.log('[TTS] Trying edge-tts for Myanmar...');
    try {
      const result = await generateEdgeTTS(textToSpeak, 'my');
      console.log('✅ [TTS] Edge-TTS succeeded!');
      return { data: result, source: 'edge' };
    }
    catch (edgeErr) {
      console.warn('❌ [TTS] Edge-TTS failed:', edgeErr);
      try {
        console.log('[TTS] Trying StreamElements fallback...');
        return { data: await generateStreamElementsTTS(textToSpeak, 'my'), source: 'streamelements' };
      }
      catch {
        console.log('[TTS] Trying SoundOfText last resort...');
        return { data: await generateSoundOfTextTTS(textToSpeak, 'my'), source: 'fallback' };
      }
    }
  }

  // English: Use edge-tts as primary
  console.log('[TTS] Trying edge-tts for English...');
  try {
    const result = await generateEdgeTTS(textToSpeak, 'en');
    console.log('✅ [TTS] Edge-TTS succeeded!');
    return { data: result, source: 'edge' };
  }
  catch (edgeErr) {
    console.warn('❌ [TTS] Edge-TTS failed:', edgeErr);
    try {
      console.log('[TTS] Trying StreamElements fallback...');
      return { data: await generateStreamElementsTTS(textToSpeak, 'en'), source: 'streamelements' };
    }
    catch {
      console.log('[TTS] Trying SoundOfText last resort...');
      return { data: await generateSoundOfTextTTS(textToSpeak, 'en'), source: 'fallback' };
    }
  }
};

export const generateSingleSceneText = async (topic: string, sceneIndex: number, context: string): Promise<{ storyLine: string, imagePrompt: string }> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Write Scene ${sceneIndex} for "${topic}". Context: ${context}. Return JSON.`,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storyLine: { type: Type.STRING },
            imagePrompt: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text!) as { storyLine: string, imagePrompt: string };
  } catch (e) {
    return { storyLine: `Scene ${sceneIndex} about ${topic}.`, imagePrompt: topic };
  }
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Catchy video title for ${topic}. Text only.`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    return response.text?.trim() || topic;
  } catch { return topic; }
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Outro for ${topic}. Text only.`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    return response.text?.trim() || "Thanks for watching!";
  } catch { return "Subscribe!"; }
};
