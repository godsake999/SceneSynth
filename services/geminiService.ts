
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { StoryResponse } from "../types";

// --- FALLBACK SERVICES ---

const generateFluxImage = async (prompt: string): Promise<string> => {
  console.warn("Using Flux (Pollinations) fallback for image...");
  try {
    const cleanPrompt = prompt.replace(/[^\w\s,]/gi, '');
    const encodedPrompt = encodeURIComponent(cleanPrompt + ", cinematic, 8k, highly detailed");
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
    return "https://placehold.co/720x1280/1e293b/cbd5e1?text=Image+Generation+Error";
  }
};

const generateSoundOfTextTTS = async (text: string): Promise<string> => {
  try {
      const createResponse = await fetch('https://api.soundoftext.com/sounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              engine: 'Google', 
              data: { 
                  text: text.slice(0, 200),
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
          if (checkData.status === 'Error') throw new Error("SoT processing Error");
          attempts++;
      }
      throw new Error("SoT timed out");
  } catch (e) {
      return generateErrorTone(); 
  }
};

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

const encodeWAV = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (v: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      v.setUint8(offset + i, string.charCodeAt(i));
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

const getMockStoryPlan = (topic: string): StoryResponse => ({
  title: `Story: ${topic}`,
  outroMessage: "Thanks for watching!",
  scenes: Array(5).fill(null).map((_, i) => ({
    storyLine: `Scene ${i + 1} script regarding ${topic}.`,
    imagePrompt: `Cinematic shot of ${topic}, scene ${i + 1}`
  }))
});

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  fallbackFn: () => Promise<T> | T,
  retries = 1,
  delayMs = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error?.message?.includes('429') || error?.status === 429)) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return retryWithBackoff(fn, fallbackFn, retries - 1, delayMs * 2);
    }
    return fallbackFn();
  }
};

// --- CORE SERVICES ---

export const generateStoryPlan = async (topic: string, style: string): Promise<StoryResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Create a 5-scene YouTube Short plan. Topic: ${topic}. Style: ${style}. Return JSON.`;

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
  }, () => getMockStoryPlan(topic));
};

export const generateSceneImage = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const fullPrompt = `Cinematic scene: ${prompt}, vertical, highly detailed, photorealistic, 4k`;

  return retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image', 
        contents: { parts: [{ text: fullPrompt }] },
        config: { 
          imageConfig: { 
            aspectRatio: "9:16"
          } 
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data returned from Gemini");
  }, () => generateFluxImage(prompt));
};

export const generateSpeech = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
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
      if (!base64Audio) throw new Error("No audio returned");
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const pcmBytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) pcmBytes[i] = binaryString.charCodeAt(i);
      const pcmBlob = new Blob([pcmBytes], { type: 'audio/pcm;rate=24000' });
      return URL.createObjectURL(pcmBlob);
  } catch (e) {
      console.warn("Gemini TTS failed, falling back to SoundOfText...", e);
      return generateSoundOfTextTTS(text);
  }
};

export const generateSingleSceneText = async (topic: string, sceneIndex: number, context: string): Promise<{storyLine: string, imagePrompt: string}> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Write Scene ${sceneIndex} for a YouTube Short about "${topic}". Context: ${context}. Return JSON with storyLine and imagePrompt.`,
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
    }, () => ({ storyLine: `Scene ${sceneIndex} script about ${topic}.`, imagePrompt: `Artistic view of ${topic}` }));
};

export const generateIntroTitle = async (topic: string, style: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Generate a short catchy title for a video about ${topic}. Return JUST text.`
        });
        return response.text?.trim() || "Untitled";
    }, () => "My Story");
};

export const generateOutroMessage = async (topic: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    return retryWithBackoff(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Generate a short outro message for ${topic}. Return JUST text.`
        });
        return response.text?.trim() || "Thanks for watching!";
    }, () => "Subscribe!");
};
