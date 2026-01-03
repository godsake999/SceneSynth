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

// --- FALLBACK IMAGE SERVICE (Kept on Frontend for speed/reliability) ---
const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Using Flux fallback for image...");
  try {
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, 8k, highly detailed");
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;
    
    // Validate it loads
    const response = await fetch(url);
    if (!response.ok) throw new Error("Flux Failed");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (e) {
    return "https://placehold.co/720x1280/1e293b/cbd5e1?text=Image+Error";
  }
};

// --- CORE SERVICES ---

export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
  try {
    // Call Python Backend
    const result = await callBackend({
      action: 'story_plan',
      topic,
      style
    });
    return result as StoryResponse;
  } catch (e) {
    console.error("Story Plan Failed", e);
    // Basic Client-Side Fallback if backend dies
    return {
        title: topic,
        outroMessage: "Thanks for watching!",
        introImagePrompt: topic + " concept art",
        scenes: Array(5).fill(0).map((_, i) => ({ 
            storyLine: `Scene ${i+1} about ${topic}`, 
            imagePrompt: topic 
        }))
    };
  }
};

export const generateSceneImage = async (prompt: string, strategy: GenerationStrategy = 'smart'): Promise<GenerationResult<string>> => {
  // 1. Force Fallback Strategy
  if (strategy === 'force-fallback') {
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }

  // 2. Try Backend Gemini
  try {
    const result = await callBackend({
      action: 'scene_image',
      prompt
    });
    
    if (result.image_data) {
        return { data: result.image_data, source: 'gemini' };
    }
    throw new Error("No image data in response");

  } catch (e) {
    // 3. Auto-Fallback to Flux
    console.warn("Backend Image Gen failed, switching to Flux", e);
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }
};

export const generateSingleSceneText = async (topic: string, sceneIndex: number, context: string): Promise<{storyLine: string, imagePrompt: string}> => {
    return await callBackend({
        action: 'single_scene_json',
        prompt: `Write Scene ${sceneIndex} for a video about ${topic}. Context: ${context}. Return JSON.`
    });
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
    const result = await callBackend({
        action: 'text_only',
        prompt: `One short catchy title for a video about ${topic}. Text only.`
    });
    return result.text || topic;
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
    const result = await callBackend({
        action: 'text_only',
        prompt: `One short outro CTA for ${topic}. Text only.`
    });
    return result.text || "Thanks for watching!";
};

// --- TTS SERVICES (Delegates to your existing /api/tts endpoint) ---
// (Copy your generateSpeech function from the previous version here)
// It doesn't need to change because it already calls fetch('/api/tts')
export const generateSpeech = async (text: string, strategy: GenerationStrategy = 'smart'): Promise<GenerationResult<string>> => {
    // ... paste your existing generateSpeech logic here ...
    // Note: Since generateSpeech already calls /api/tts (which is python), 
    // it effectively is already "Option 2" compliant!
    
    // Just ensure callBackend isn't used here unless you merge tts.py into generate.py
    // (Keeping them separate files is fine and cleaner).
    
    // Simplified stub for context:
    try {
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: "en-US-ChristopherNeural" })
        });
        if(!response.ok) throw new Error("TTS Failed");
        const blob = await response.blob();
        return { data: URL.createObjectURL(blob), source: 'edge' };
    } catch(e) {
        // Fallback logic...
        return { data: "", source: 'fallback' };
    }
};