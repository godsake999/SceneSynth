
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryResponse } from "../types";

const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- FALLBACK SERVICES ---

// Fallback 1: Flux Model (via Pollinations.ai) for Images
const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Using Flux (Pollinations) fallback for image...");
  try {
    // Clean prompt and ensure params enforce 9:16
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, 8k, highly detailed");
    // Pollinations URL with exact dimensions for 9:16
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=720&height=1280&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000)}`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Pollinations Status: ${response.status}`);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Flux fallback failed:", e);
    // Return a solid placeholder if even fallback fails
    return "https://placehold.co/720x1280/1e293b/cbd5e1?text=Image+Generation+Error";
  }
};

// Fallback 2: SoundOfText API (Google TTS Proxy)
const generateSoundOfTextTTS = async (text: string): Promise<string> => {
  console.warn("Using SoundOfText fallback for audio...");
  
  try {
      const createResponse = await fetch('https://api.soundoftext.com/sounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              engine: 'Google', 
              data: { 
                  text: text.slice(0, 200), // API limit safety
                  voice: 'en-US' 
              } 
          })
      });

      if (!createResponse.ok) throw new Error(`SoT Init Error: ${createResponse.status}`);
      const createData = await createResponse.json();
      if (!createData.success) throw new Error("SoT creation failed");

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
          
          if (checkData.status === 'Error') {
              throw new Error("SoT processing returned Error status");
          }
          
          attempts++;
      }
      throw new Error("SoT timed out");

  } catch (e) {
      console.error("SoundOfText fallback failed:", e);
      return generateErrorTone(); 
  }
};

// Emergency Fallback: Simple Tone
const generateErrorTone = (): string => {
  const sampleRate = 24000;
  const numFrames = sampleRate * 1; 
  const buffer = new Float32Array(numFrames);
  
  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const freq = 440 * Math.exp(-3 * t); 
    buffer[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-5 * t);
  }

  const wavBuffer = encodeWAV(buffer, sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
};


// Helper for WAV encoding
const encodeWAV = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return view;
};

// Fallback 3: Mock Text Data (for story planning)
const getMockStoryPlan = (topic: string): StoryResponse => ({
  title: `Story: ${topic}`,
  outroMessage: "Thanks for watching!",
  introMusicPrompt: "Upbeat cinematic drums",
  scenes: Array(5).fill(null).map((_, i) => ({
    storyLine: `Scene ${i + 1} script regarding ${topic}.`,
    imagePrompt: `Cinematic shot of ${topic}, scene ${i + 1}`
  }))
});


// Robust Retry with Fallback Strategy
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  fallbackFn: () => Promise<T> | T,
  retries = 1,
  delayMs = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const isRetryable =
      error?.message?.includes('429') ||
      error?.message?.includes('503') ||
      error?.status === 429;

    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryWithBackoff(fn, fallbackFn, retries - 1, delayMs * 2);
    }
    
    console.warn("Primary API failed, switching to fallback.", error.message);
    return fallbackFn();
  }
};

// --- TEXT GENERATION ---

export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
  const ai = getAiClient();
  const prompt = `Create a 5-scene YouTube Short plan.
    Topic: ${topic}
    Style: ${style}
    
    Return JSON with:
    - title (string)
    - introMusicPrompt (string): Description of short intro music (e.g. "Dark cinematic drone" or "Upbeat techno")
    - outroMessage (string)
    - scenes (array of 5 objects with storyLine and imagePrompt)`;

  return retryWithBackoff(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            introMusicPrompt: { type: Type.STRING },
            outroMessage: { type: Type.STRING },
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
    
    const text = response.text;
    if (!text) throw new Error("No text returned");
    return JSON.parse(text) as StoryResponse;
  }, () => getMockStoryPlan(topic));
};

export const generateSingleSceneText = async (topic: string, sceneIndex: number, context: string): Promise<{storyLine: string, imagePrompt: string}> => {
    const ai = getAiClient();
    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Write Scene ${sceneIndex} for a YouTube Short about "${topic}". Context: ${context}. Return JSON with storyLine (max 15 words) and imagePrompt.`,
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
    }, () => ({
        storyLine: `Scene ${sceneIndex} script about ${topic}.`,
        imagePrompt: `Artistic view of ${topic}`
    }));
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
    const ai = getAiClient();
    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Generate a short catchy title for a video about ${topic}. Return JUST text.`
        });
        return response.text?.trim() || "Untitled";
    }, () => "My Story");
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
    const ai = getAiClient();
    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Generate a short outro message for ${topic}. Return JUST text.`
        });
        return response.text?.trim() || "Thanks for watching!";
    }, () => "Subscribe!");
};

// --- IMAGE GENERATION ---

export const generateSceneImage = async (prompt: string): Promise<string> => {
  const ai = getAiClient();
  const fullPrompt = `${prompt}, vertical 9:16 aspect ratio`;

  return retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: fullPrompt }] },
        config: { imageConfig: { aspectRatio: "9:16" } }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data");
  }, () => generateFluxImage(prompt));
};

// --- AUDIO GENERATION ---

export const generateSpeech = async (text: string): Promise<string> => {
  const ai = getAiClient();
  
  // PRIMARY: Gemini TTS
  try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: text }] },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio returned");

      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const pcmBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        pcmBytes[i] = binaryString.charCodeAt(i);
      }
      const pcmBlob = new Blob([pcmBytes], { type: 'audio/pcm;rate=24000' });
      return URL.createObjectURL(pcmBlob);

  } catch (geminiError) {
      console.warn("Gemini TTS failed. Using SoundOfText proxy fallback.", geminiError);
      return generateSoundOfTextTTS(text);
  }
};

// --- MUSIC GENERATION (PROCEDURAL AI) ---
export const generateIntroAudio = async (prompt: string): Promise<string> => {
    // Since real generative music APIs are rare/paid, we use an Algorithmic Composer.
    // This function creates a WAV file based on the 'mood' derived from the prompt.
    
    console.log("Generating procedural music for:", prompt);
    const sampleRate = 44100;
    const duration = 4.0; // 4 seconds intro
    const numFrames = sampleRate * duration;
    const buffer = new Float32Array(numFrames);
    
    // 1. Analyze Mood
    const p = prompt.toLowerCase();
    const isDark = p.includes('dark') || p.includes('horror') || p.includes('scary') || p.includes('cyberpunk');
    const isFast = p.includes('action') || p.includes('fast') || p.includes('upbeat') || p.includes('techno');
    
    // 2. Compose
    const tempo = isFast ? 8 : 4; // Notes per second
    const rootFreq = isDark ? 110.0 : 261.63; // A2 vs C4
    const scale = isDark 
        ? [0, 2, 3, 5, 7, 8, 10] // Minor
        : [0, 2, 4, 5, 7, 9, 11]; // Major
    
    for (let i = 0; i < numFrames; i++) {
        const t = i / sampleRate;
        const noteIdx = Math.floor(t * tempo);
        
        // Pseudo-random melody based on note index + prompt hash
        const seed = noteIdx * 42 + prompt.length;
        const scaleDegree = seed % scale.length;
        const semitones = scale[scaleDegree];
        const octave = (seed % 2) + 1;
        const freq = rootFreq * Math.pow(2, semitones/12) * (isDark ? 1 : octave * 0.5);

        // Synthesis (Sawtoothish for synth, Sine for calm)
        const osc = isDark 
            ? (Math.sin(2 * Math.PI * freq * t) > 0 ? 0.5 : -0.5) // Square-ish
            : Math.sin(2 * Math.PI * freq * t);
            
        // Envelope (Pluck)
        const noteTime = t * tempo - noteIdx;
        const envelope = Math.max(0, 1 - noteTime * 1.5);

        buffer[i] += osc * envelope * 0.5;

        // Add Delay line effect
        if (i > 5000) {
             buffer[i] += buffer[i - 5000] * 0.3;
        }
    }

    const wavBuffer = encodeWAV(buffer, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
};
