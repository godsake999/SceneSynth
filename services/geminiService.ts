import { StoryResponse, GenerationSource, GenerationStrategy } from "../types";

export interface GenerationResult<T> {
  data: T;
  source: GenerationSource;
}

// ===== API HELPER =====
const callGenerateAPI = async <T>(
  action: string, 
  params: Record<string, unknown>,
  timeoutMs: number = 55000  // Default 55s timeout for fetch
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }
    
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout - server took too long');
    }
    throw error;
  }
};

// ===== FLUX FALLBACK (Frontend-only, no backend needed) =====
const generateFluxImage = async (prompt: string): Promise<string> => {
  console.log("🎨 Using Flux (frontend) for image generation...");
  
  try {
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(
      cleanPrompt + ", cinematic, 8k, highly detailed, vertical composition"
    );
    const seed = Math.floor(Math.random() * 10000);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${seed}`;
    
    // Fetch the image
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Flux HTTP Error: ${response.status}`);
    
    const blob = await response.blob();
    
    // Convert to base64 data URL
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image blob"));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Flux fallback failed:", e);
    return "https://placehold.co/720x1280/1e293b/cbd5e1?text=Image+Generation+Failed";
  }
};

// ===== MULTI-TIER TTS SERVICES =====

/**
 * Tier 1: Edge TTS (via Vercel Python serverless)
 */
const generateEdgeTTS = async (text: string): Promise<string> => {
  console.log("🔊 Tier 1: Attempting Edge TTS...");
  
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
  console.log("🔊 Tier 2: Attempting Sound of Text...");
  
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

  // Poll for completion
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
 * Tier 3: Gemini TTS (via backend)
 */
const generateGeminiTTS = async (text: string): Promise<string> => {
  console.log("🔊 Tier 3: Attempting Gemini TTS...");
  
  const result = await callGenerateAPI<{
    success: boolean;
    audio?: string;
    mimeType?: string;
    error?: string;
  }>('generateGeminiTTS', { text });
  
  if (!result.success || !result.audio) {
    throw new Error(result.error || "Gemini TTS Failed");
  }
  
  // Convert base64 to blob URL
  const binary = atob(result.audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: result.mimeType || 'audio/pcm;rate=24000' });
  return URL.createObjectURL(blob);
};

/**
 * Combined TTS: Edge -> SoT -> Gemini
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
    console.warn("❌ Edge TTS failed:", err);
  }
  
  // Tier 2: Sound of Text
  try {
    const url = await generateSoundOfTextTTS(text);
    return { data: url, source: 'fallback' };
  } catch (err2) {
    console.warn("❌ Sound of Text failed:", err2);
  }
  
  // Tier 3: Gemini TTS
  try {
    const url = await generateGeminiTTS(text);
    return { data: url, source: 'gemini' };
  } catch (err3) {
    console.error("❌ All TTS engines failed:", err3);
    throw new Error("All TTS engines failed.");
  }
};

// ===== CORE STORY SERVICES =====

export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
  console.log("📝 Generating story plan...");
  
  try {
    const result = await callGenerateAPI<StoryResponse>('generateStoryPlan', { topic, style });
    console.log("✅ Story plan generated successfully");
    return result;
  } catch (e) {
    console.error("❌ Story plan generation failed:", e);
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

/**
 * Image Generation: Backend Gemini (with timeout) -> Frontend Flux fallback
 */
export const generateSceneImage = async (
  prompt: string, 
  strategy: GenerationStrategy = 'smart'
): Promise<GenerationResult<string>> => {
  
  // Force fallback - skip backend entirely
  if (strategy === 'force-fallback') {
    console.log("⚡ Force fallback: Using Flux directly");
    const data = await generateFluxImage(prompt);
    return { data, source: 'fallback' };
  }

  // Smart strategy: Try Gemini backend first, fallback to Flux on frontend
  console.log("🖼️ Attempting Gemini image generation via backend...");
  
  try {
    const result = await callGenerateAPI<{
      success: boolean;
      data?: string;
      error?: string;
      source: string;
      useFallback?: boolean;
    }>('generateSceneImage', { prompt }, 50000); // 50s fetch timeout
    
    // Gemini succeeded
    if (result.success && result.data) {
      console.log("✅ Gemini image generated successfully");
      return { data: result.data, source: 'gemini' };
    }
    
    // Backend returned fallback signal
    if (result.useFallback) {
      console.warn(`⚠️ Backend signaled fallback (${result.source}): ${result.error}`);
      const fallbackData = await generateFluxImage(prompt);
      return { data: fallbackData, source: 'fallback' };
    }
    
    throw new Error(result.error || "Unknown error from backend");
    
  } catch (e) {
    // Network error, timeout, or backend 500 - use frontend Flux fallback
    console.warn("⚠️ Backend image generation failed, using Flux fallback:", e);
    const fallbackData = await generateFluxImage(prompt);
    return { data: fallbackData, source: 'fallback' };
  }
};

/**
 * Parallel Image Generation for multiple scenes
 * Uses smart batching: attempts Gemini, falls back to Flux individually
 */
export const generateSceneImagesBatch = async (
  prompts: string[],
  onProgress?: (completed: number, total: number, source: GenerationSource) => void
): Promise<GenerationResult<string>[]> => {
  const results: GenerationResult<string>[] = [];
  
  for (let i = 0; i < prompts.length; i++) {
    const result = await generateSceneImage(prompts[i], 'smart');
    results.push(result);
    onProgress?.(i + 1, prompts.length, result.source);
  }
  
  return results;
};

/**
 * Fast parallel image generation using only Flux (for speed)
 */
export const generateSceneImagesFast = async (
  prompts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<GenerationResult<string>[]> => {
  console.log(`⚡ Fast mode: Generating ${prompts.length} images with Flux...`);
  
  const promises = prompts.map(async (prompt, index) => {
    const data = await generateFluxImage(prompt);
    onProgress?.(index + 1, prompts.length);
    return { data, source: 'fallback' as GenerationSource };
  });
  
  return Promise.all(promises);
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
    console.error("❌ Single scene text generation failed:", e);
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
    console.error("❌ Intro title generation failed:", e);
    return topic;
  }
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
  try {
    const result = await callGenerateAPI<{ message: string }>('generateOutroMessage', { topic });
    return result.message;
  } catch (e) {
    console.error("❌ Outro message generation failed:", e);
    return "Thanks for watching!";
  }
};