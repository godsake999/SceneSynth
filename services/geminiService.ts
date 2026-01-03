import { StoryResponse, GenerationSource, GenerationStrategy } from "../types";

export interface GenerationResult<T> {
  data: T;
  source: GenerationSource;
}

// --- HELPER: Call Python Backend ---
const callBackend = async (payload: any) => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Backend failed: ${response.statusText}`);
  }
  return await response.json();
};

// --- IMAGE SERVICE (Frontend Fallback + Backend Gemini) ---
const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Using Flux fallback for image...");
  try {
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, 8k, highly detailed");
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Flux Failed");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    return "https://placehold.co/720x1280/1e293b/cbd5e1?text=Image+Error";
  }
};

export const generateSceneImage = async (prompt: string, strategy: GenerationStrategy = 'smart'): Promise<GenerationResult<string>> => {
  if (strategy === 'force-fallback') {
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }
  try {
    const result = await callBackend({ action: 'scene_image', prompt });
    if (result.image_data) return { data: result.image_data, source: 'gemini' };
    throw new Error("No image data");
  } catch (e) {
    console.warn("Backend Image Gen failed, switching to Flux", e);
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }
};

// --- TTS SERVICES (The Fixed Tiers) ---

/**
 * Tier 1: Edge TTS (Your /api/tts.py)
 */
const generateEdgeTTS = async (text: string): Promise<string> => {
  console.log("Tier 1: Edge TTS");
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice: "en-US-ChristopherNeural" })
  });
  if (!response.ok) throw new Error("Edge TTS API Unavailable");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

/**
 * Tier 2: Sound of Text (Google Translate Client-Side)
 */
const generateSoundOfTextTTS = async (text: string): Promise<string> => {
  console.log("Tier 2: Sound of Text");
  const createResponse = await fetch('https://api.soundoftext.com/sounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ engine: 'Google', data: { text: text.slice(0, 200), voice: 'en-US' } })
  });
  if (!createResponse.ok) throw new Error("SoT Init Failed");
  const { id } = await createResponse.json();

  let attempts = 0;
  while (attempts < 10) { // Reduced wait time for faster failover
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
  throw new Error("SoT Timeout");
};

/**
 * Tier 3: Gemini TTS (Via your Backend)
 */
const generateGeminiTTS = async (text: string): Promise<string> => {
  console.log("Tier 3: Gemini TTS (Backend)");
  // We call the backend now, because frontend doesn't have the API KEY
  const result = await callBackend({ 
    action: 'tts_gemini', 
    text: text,
    voice: 'Kore' 
  });
  
  if (result.audio_data) {
     return result.audio_data; // This is a data:audio/mp3;base64 string
  }
  throw new Error("Backend Gemini TTS Failed");
};

// --- EXPORTED TTS FUNCTION ---
export const generateSpeech = async (text: string, strategy: GenerationStrategy = 'smart'): Promise<GenerationResult<string>> => {
  // Step 1: Edge TTS (Primary)
  try {
    const url = await generateEdgeTTS(text);
    return { data: url, source: 'edge' };
  } catch (err) {
    console.warn("Edge TTS failed, trying Tier 2...", err);
    
    // Step 2: Sound of Text (Fallback 1)
    try {
      const url = await generateSoundOfTextTTS(text);
      return { data: url, source: 'fallback' };
    } catch (err2) {
      console.warn("SoT failed, trying Tier 3...", err2);
      
      // Step 3: Gemini TTS (Fallback 2 - Backend)
      try {
        const url = await generateGeminiTTS(text);
        return { data: url, source: 'gemini' };
      } catch (err3) {
        console.error("All TTS engines failed.", err3);
        // Emergency Fallback: Return empty or placeholder if absolutely necessary
        throw new Error("All TTS systems offline.");
      }
    }
  }
};

// --- OTHER SERVICES (Story, Title, etc) ---
// These use the backend helper properly now
export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
    try {
        const result = await callBackend({ action: 'story_plan', topic, style });
        return result as StoryResponse;
    } catch (e) {
        return { title: topic, outroMessage: "Thanks!", introImagePrompt: topic, scenes: [] };
    }
};

export const generateSingleSceneText = async (topic: string, sceneIndex: number, context: string): Promise<{storyLine: string, imagePrompt: string}> => {
    return await callBackend({
        action: 'single_scene_json',
        prompt: `Write Scene ${sceneIndex} for a video about ${topic}. Context: ${context}. Return JSON.`
    });
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
    const result = await callBackend({ action: 'text_only', prompt: `Short title for ${topic}` });
    return result.text || topic;
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
    const result = await callBackend({ action: 'text_only', prompt: `Outro CTA for ${topic}` });
    return result.text || "Subscribe!";
};
