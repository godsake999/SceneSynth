import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryResponse, GenerationSource, GenerationStrategy } from "../types";

export interface GenerationResult<T> {
  data: T;
  source: GenerationSource;
}

// --- FALLBACK IMAGE SERVICE ---

const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Using Flux fallback for image...");
  try {
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, 8k, highly detailed");
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;
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

// --- MULTI-TIER TTS SERVICES ---

/**
 * Tier 1: Edge TTS (Vercel Serverless)
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
 * Tier 3: Gemini TTS (Final High-Quality Backup)
 */
const generateGeminiTTS = async (text: string): Promise<string> => {
  console.log("Tier 3: Attempting Gemini TTS SDK...");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  
  const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64) throw new Error("Gemini TTS Failed");
  
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/pcm;rate=24000' });
  return URL.createObjectURL(blob);
};

/**
 * Combined Logic: Primary (Edge) -> Fallback (SoT) -> Final (Gemini)
 */
export const generateSpeech = async (text: string, strategy: GenerationStrategy = 'smart'): Promise<GenerationResult<string>> => {
  // Step 1: Edge TTS (Free, Primary)
  try {
    const url = await generateEdgeTTS(text);
    return { data: url, source: 'edge' };
  } catch (err) {
    console.warn("Edge TTS unavailable, moving to Sound of Text...");
    
    // Step 2: Sound of Text (Free, Secondary)
    try {
      const url = await generateSoundOfTextTTS(text);
      return { data: url, source: 'fallback' };
    } catch (err2) {
      console.warn("Sound of Text failed, moving to Gemini TTS...");
      
      // Step 3: Gemini TTS (Paid/Quota, Final Backup)
      try {
        const url = await generateGeminiTTS(text);
        return { data: url, source: 'gemini' };
      } catch (err3) {
        throw new Error("All TTS engines failed.");
      }
    }
  }
};

// --- CORE STORY SERVICES ---

export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Create a 5-scene YouTube Short plan. Topic: ${topic}. Style: ${style}. Return JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            outroMessage: { type: Type.STRING },
            introImagePrompt: { type: Type.STRING },
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
    return {
        title: topic,
        outroMessage: "Thanks for watching!",
        scenes: Array(5).fill(0).map((_, i) => ({ storyLine: `Scene ${i+1} about ${topic}`, imagePrompt: topic }))
    };
  }
};

export const generateSceneImage = async (prompt: string, strategy: GenerationStrategy = 'smart'): Promise<GenerationResult<string>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const fullPrompt = `Cinematic scene: ${prompt}, vertical 9:16, high detail, 4k`;

  if (strategy === 'force-fallback') {
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', 
      contents: { parts: [{ text: fullPrompt }] },
      config: { imageConfig: { aspectRatio: "9:16" } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return { 
          data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          source: 'gemini' 
        };
      }
    }
    throw new Error("No image data");
  } catch (e) {
    return { data: await generateFluxImage(prompt), source: 'fallback' };
  }
};

export const generateSingleSceneText = async (topic: string, sceneIndex: number, context: string): Promise<{storyLine: string, imagePrompt: string}> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Write Scene ${sceneIndex} for a video about ${topic}. Context: ${context}. Return JSON.`,
        config: {
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
    return JSON.parse(response.text!) as {storyLine: string, imagePrompt: string};
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `One short catchy title for a video about ${topic}. Text only.`
    });
    return response.text?.trim() || topic;
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `One short outro CTA for ${topic}. Text only.`
    });
    return response.text?.trim() || "Thanks for watching!";
};