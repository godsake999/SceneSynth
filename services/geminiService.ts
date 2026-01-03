import { StoryResponse, GenerationSource, GenerationStrategy } from "../types";

export interface GenerationResult<T> {
  data: T;
  source: GenerationSource;
}

// ===== API HELPER =====
const callGenerateAPI = async <T>(action: string, params: Record<string, unknown>): Promise<T> => {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params })
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }
  
  return response.json();
};

// ===== FALLBACK IMAGE SERVICE =====
const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Using Flux fallback for image...");
  try {
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, 8k, highly detailed");
    const seed = Math.floor(Math.random() * 1000);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${seed}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("Flux Failed");
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return "https://placehold.co/720x1280/1e293b/cbd5e1?text=Image+Error";
  }
};

// ===== MULTI-TIER TTS SERVICES =====

/**
 * Tier 1: Edge TTS (via Vercel Python serverless)
 */
const generateEdgeTTS = async (text: string): Promise<string> => {
  console.log("Tier 1: Attempting Edge TTS via /api/tts...");
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      text, 
      voice: "en-US-ChristopherNeural" 
    })
  });

  if (!response.ok) throw new Error("Edge TTS API Unavailable");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

/**
 * Tier 2: Sound of Text (Google Translate)
 */
const generateSoundOfTextTTS = async (text: string): Promise<string> => {
  console.log("Tier 2: Attempting Sound of Text (Google Translate)...");
  const createResponse = await fetch('https://api.soundoftext.com/sounds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      engine: 'Google', 
      data: { text: text.slice(0, 200), voice: 'en-US' } 
    })
  });

  if (!createResponse.ok) throw new Error("SoT Init Failed");
  const createData = await createResponse.json();
  const id = createData.id;

  let attempts = 0;
  while (attempts < 15) {
    await new Promise(r => setTimeout(r, 600));
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
 * Tier 3: Gemini TTS (via backend API)
 */
const generateGeminiTTS = async (text: string): Promise<string> => {
  console.log("Tier 3: Attempting Gemini TTS via /api/generate...");
  
  const result = await callGenerateAPI<{
    success: boolean;
    audio?: string;
    mimeType?: string;
    error?: string;
  }>('generateGeminiTTS', { text });
  
  if (!result.success || !result.audio) {
    throw new Error(result.error || "Gemini TTS Failed");
  }
  
  const binary = atob(result.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: result.mimeType || 'audio/pcm;rate=24000' });
  return URL.createObjectURL(blob);
};

/**
 * Combined TTS Logic: Edge -> SoT -> Gemini
 */
export const generateSpeech = async (
  text: string, 
  strategy: GenerationStrategy = 'smart'
): Promise<GenerationResult<string>> => {
  // Tier 1: Edge TTS
  try {
    const url = await generateEdgeTTS(text);
    return { data: url, source: 'edge' };
  } catch (err) {
    console.warn("Edge TTS unavailable, trying Sound of Text...", err);
  }
  
  // Tier 2: Sound of Text
  try {
    const url = await generateSoundOfTextTTS(text);
    return { data: url, source: 'fallback' };
  } catch (err2) {
    console.warn("Sound of Text failed, trying Gemini TTS...", err2);
  }
  
  // Tier 3: Gemini TTS
  try {
    const url = await generateGeminiTTS(text);
    return { data: url, source: 'gemini' };
  } catch (err3) {
    console.error("All TTS engines failed:", err3);
    throw new Error("All TTS engines failed.");
  }
};

// ===== CORE STORY SERVICES =====

export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
  try {
    const result = await callGenerateAPI<StoryResponse>('generateStoryPlan', { topic, style });
    return result;
  } catch (e) {
    console.error("Story plan generation failed:", e);
    return {
      title: topic,
      outroMessage: "Thanks for watching!",
      scenes: Array(5).fill(0).map((_, i) => ({ 
        storyLine: `Scene ${i + 1} about ${topic}`, 
        imagePrompt: topic 
      }))
    };
  }
};

export const generateSceneImage = async (
  prompt: string, 
  strategy: GenerationStrategy = 'smart'
): Promise<GenerationResult<string>> => {
  
  // Force fallback strategy
  if (strategy === 'force-fallback') {
    const data = await generateFluxImage(prompt);
    return { data, source: 'fallback' };
  }

  // Try Gemini first, fallback to Flux
  try {
    const result = await callGenerateAPI<{
      success: boolean;
      data?: string;
      error?: string;
      source: string;
    }>('generateSceneImage', { prompt });
    
    if (result.success && result.data) {
      return { data: result.data, source: 'gemini' };
    }
    
    // Gemini failed, use fallback
    console.warn("Gemini image failed, using Flux fallback...");
    const fallbackData = await generateFluxImage(prompt);
    return { data: fallbackData, source: 'fallback' };
    
  } catch (e) {
    console.error("Image generation error:", e);
    const fallbackData = await generateFluxImage(prompt);
    return { data: fallbackData, source: 'fallback' };
  }
};

export const generateSingleSceneText = async (
  topic: string, 
  sceneIndex: number, 
  context: string
): Promise<{ storyLine: string; imagePrompt: string }> => {
  try {
    const result = await callGenerateAPI<{ storyLine: string; imagePrompt: string }>(
      'generateSingleSceneText', 
      { topic, sceneIndex, context }
    );
    return result;
  } catch (e) {
    console.error("Single scene text generation failed:", e);
    return {
      storyLine: `Scene ${sceneIndex} about ${topic}`,
      imagePrompt: topic
    };
  }
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
  try {
    const result = await callGenerateAPI<{ title: string }>('generateIntroTitle', { topic, style });
    return result.title;
  } catch (e) {
    console.error("Intro title generation failed:", e);
    return topic;
  }
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
  try {
    const result = await callGenerateAPI<{ message: string }>('generateOutroMessage', { topic });
    return result.message;
  } catch (e) {
    console.error("Outro message generation failed:", e);
    return "Thanks for watching!";
  }
};