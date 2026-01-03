
import { Scene } from "../types";

interface VideoGeneratorOptions {
  scenes: Scene[];
  intro?: {
    imageUrl: string;
    title: string;
    musicUrl?: string; // Added musicUrl support
  };
  outro?: {
    audioUrl: string;
    message: string;
  };
  onProgress?: (progress: number) => void;
}

export const generateSequentialVideo = async ({
  scenes,
  intro,
  outro,
  onProgress
}: VideoGeneratorOptions): Promise<string> => {
  
  const validScenes = scenes.filter(s => s.imageUrl && s.audioUrl);
  if (validScenes.length === 0) throw new Error("No valid scenes to generate video");

  await document.fonts.ready;

  const width = 720;
  const height = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = audioContext.createMediaStreamDestination();
  
  const tracks = dest.stream.getAudioTracks();
  if (!tracks || tracks.length === 0) {
      throw new Error("Could not initialize audio stream destination.");
  }
  const audioTrack = tracks[0];

  const stream = canvas.captureStream(30);
  stream.addTrack(audioTrack);

  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 3000000 
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  // Background Music Setup
  const bgmNodes = createAmbientBackgroundTrack(audioContext, dest);
  bgmNodes.gain.gain.value = 0; 
  bgmNodes.start();
  
  // MIXING LOGIC: 
  // If there is intro music, delay BGM fade-in so the intro stinger stands out.
  // Otherwise, fade in BGM immediately.
  const hasIntroMusic = !!intro?.musicUrl;
  const bgmFadeStart = audioContext.currentTime + (hasIntroMusic ? 3.0 : 0.5);
  bgmNodes.gain.gain.setValueAtTime(0, audioContext.currentTime);
  bgmNodes.gain.gain.linearRampToValueAtTime(0.10, bgmFadeStart + 2.0); 

  try {
    // Load all assets
    const loadedAssets = await Promise.all(validScenes.map(async (scene) => {
        const img = await loadImage(scene.imageUrl!);
        const ab = await loadAudioUniversal(scene.audioUrl!, audioContext);
        return { scene, img, audioBuffer: ab };
    }));

    let introImg: HTMLImageElement | null = null;
    let introMusicBuffer: AudioBuffer | null = null;

    if (intro) {
      introImg = await loadImage(intro.imageUrl);
      if (intro.musicUrl) {
          introMusicBuffer = await loadAudioUniversal(intro.musicUrl, audioContext);
      }
    }

    let outroBuffer: AudioBuffer | null = null;
    if (outro) {
      outroBuffer = await loadAudioUniversal(outro.audioUrl, audioContext);
    }

    // Play Intro
    if (intro && introImg) {
       await playIntroSegment(
           ctx, 
           dest, 
           audioContext, 
           introImg, 
           intro.title, 
           width, 
           height, 
           introMusicBuffer
       );
    }

    // Play Scenes
    for (let i = 0; i < loadedAssets.length; i++) {
        const { scene, img, audioBuffer } = loadedAssets[i];
        if (onProgress) onProgress(i / loadedAssets.length);

        await playSceneSegment(
            ctx, 
            dest, 
            audioContext, 
            img, 
            audioBuffer, 
            scene.storyLine, 
            width, 
            height
        );
    }

    // Play Outro
    if (outro && outroBuffer) {
        const lastImage = loadedAssets[loadedAssets.length - 1].img;
        const voiceDuration = outroBuffer.duration;
        const fadeStartTime = audioContext.currentTime + voiceDuration;
        
        bgmNodes.gain.gain.setValueAtTime(0.10, fadeStartTime);
        bgmNodes.gain.gain.linearRampToValueAtTime(0, fadeStartTime + 3);

        await playOutroSegment(
            ctx, 
            dest, 
            audioContext, 
            lastImage, 
            outroBuffer, 
            outro.message, 
            width, 
            height,
            voiceDuration + 4.0 
        );
    } else {
        // No outro (e.g., Preview Mode)
        // Fade out BGM quickly
        const now = audioContext.currentTime;
        bgmNodes.gain.gain.cancelScheduledValues(now);
        bgmNodes.gain.gain.setValueAtTime(bgmNodes.gain.gain.value, now);
        bgmNodes.gain.gain.linearRampToValueAtTime(0, now + 1.0);
        
        // Short pause to capture fade
        await new Promise(r => setTimeout(r, 1000));
    }
    
    bgmNodes.stop();
    if (onProgress) onProgress(1);

  } catch (err) {
    recorder.stop();
    audioContext.close();
    throw err;
  }

  recorder.stop();
  audioContext.close();

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(URL.createObjectURL(blob));
    };
  });
};

// --- HELPER FUNCTIONS ---

const playIntroSegment = (
  ctx: CanvasRenderingContext2D,
  dest: MediaStreamAudioDestinationNode, // Added
  audioCtx: AudioContext, // Added
  image: HTMLImageElement,
  title: string,
  width: number,
  height: number,
  musicBuffer: AudioBuffer | null // Added
): Promise<void> => {
  return new Promise((resolve) => {
    // Play Intro Music if available
    if (musicBuffer) {
        const source = audioCtx.createBufferSource();
        source.buffer = musicBuffer;
        source.connect(dest);
        source.start();
    }

    const duration = 3.0;
    const startTime = performance.now();

    const draw = () => {
      const now = performance.now();
      const elapsed = (now - startTime) / 1000;
      
      if (elapsed >= duration) {
        resolve();
        return;
      }

      const progress = elapsed / duration;

      // Draw Image (Slow Zoom In)
      const scale = 1.0 + (0.05 * progress); 
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const x = (width - scaledWidth) / 2;
      const y = (height - scaledHeight) / 2;

      ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

      // Gradient Overlay for text
      const gradient = ctx.createLinearGradient(0, height * 0.4, 0, height);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.8, "rgba(0,0,0,0.8)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Title Text
      ctx.globalAlpha = Math.min(progress * 2, 1);
      ctx.font = `800 50px Inter, sans-serif`; 
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Shadow
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = 'white';
      
      // Split title if too long
      const words = title.toUpperCase().split(' ');
      const mid = Math.ceil(words.length / 2);
      if (words.length > 3) {
           ctx.fillText(words.slice(0, mid).join(' '), width/2, height/2 - 30);
           ctx.fillText(words.slice(mid).join(' '), width/2, height/2 + 30);
      } else {
           ctx.fillText(title.toUpperCase(), width/2, height/2);
      }
      
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;

      requestAnimationFrame(draw);
    };
    draw();
  });
};

const playSceneSegment = (
    ctx: CanvasRenderingContext2D,
    dest: MediaStreamAudioDestinationNode,
    audioCtx: AudioContext,
    image: HTMLImageElement,
    audioBuffer: AudioBuffer,
    text: string,
    width: number,
    height: number
): Promise<void> => {
    return new Promise((resolve) => {
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(dest);
        source.start();

        const duration = audioBuffer.duration;
        const startTime = performance.now();
        
        // Ken Burns vars
        const zoomAmount = 0.10;
        const seed = text.length; 
        const panX = ((seed % 10) / 10 - 0.5) * 40;
        const panY = (((seed * 2) % 10) / 10 - 0.5) * 40;

        const draw = () => {
            const now = performance.now();
            const elapsed = (now - startTime) / 1000;
            
            if (elapsed >= duration) {
                resolve();
                return;
            }

            const progress = elapsed / duration;

            // Clear
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);

            // Ken Burns
            const scale = 1.05 + (zoomAmount * progress); 
            const scaledWidth = width * scale;
            const scaledHeight = height * scale;
            const x = (width - scaledWidth) / 2 + (panX * progress);
            const y = (height - scaledHeight) / 2 + (panY * progress);

            ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

            // Subtitles
            drawSimpleSubtitles(ctx, text, width, height);

            requestAnimationFrame(draw);
        };
        draw();
    });
};

const playOutroSegment = (
  ctx: CanvasRenderingContext2D,
  dest: MediaStreamAudioDestinationNode,
  audioCtx: AudioContext,
  image: HTMLImageElement,
  audioBuffer: AudioBuffer,
  message: string,
  width: number,
  height: number,
  overrideDuration?: number
): Promise<void> => {
  return new Promise((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);
    source.start();

    const duration = overrideDuration || (audioBuffer.duration + 1); 
    const startTime = performance.now();

    const draw = () => {
        const now = performance.now();
        const elapsed = (now - startTime) / 1000;
        
        if (elapsed >= duration) {
            resolve();
            return;
        }

        const progress = Math.min(elapsed / 2, 1); 
        
        ctx.globalAlpha = 1.0; 
        ctx.drawImage(image, 0, 0, width, height);
        
        // Darken
        ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * progress})`;
        ctx.fillRect(0, 0, width, height);

        // Text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 40px Inter, sans-serif`;
        ctx.fillStyle = `rgba(255, 255, 255, ${progress})`; 
        ctx.fillText(message, width/2, height/2);

        requestAnimationFrame(draw);
    };
    draw();
  });
};

const drawSimpleSubtitles = (
  ctx: CanvasRenderingContext2D, 
  text: string, 
  canvasWidth: number, 
  canvasHeight: number
) => {
  const fontSize = 28; 
  const padding = 20;
  const bottomMargin = 80;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  const maxWidth = canvasWidth - (padding * 3);

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  const grad = ctx.createLinearGradient(0, canvasHeight - 250, 0, canvasHeight);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, canvasHeight - 250, canvasWidth, 250);

  lines.forEach((line, i) => {
      const y = canvasHeight - bottomMargin - ((lines.length - 1 - i) * (fontSize + 12));
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillText(line, canvasWidth / 2 + 2, y + 2);
      
      // Main Text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, canvasWidth / 2, y);
  });
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

// Robust Audio Loader that handles both Raw PCM (Gemini) and Standard Formats (MP3/WAV from Fallbacks)
const loadAudioUniversal = async (src: string, ctx: AudioContext): Promise<AudioBuffer> => {
  const response = await fetch(src);
  const arrayBuffer = await response.arrayBuffer();

  // Method 1: Try Standard Decode (WAV, MP3, OGG)
  // We clone the buffer because decodeAudioData detaches/neutures the buffer it processes.
  try {
    const bufferForDecode = arrayBuffer.slice(0);
    return await ctx.decodeAudioData(bufferForDecode);
  } catch (e) {
    // Method 2: Fallback to Raw PCM (Gemini Specific Format)
    // If standard decode fails, we assume it's the raw PCM from Gemini which has no header.
    console.warn("Standard audio decode failed, attempting raw PCM parse...", e);
    
    // Note: Gemini sends 24000Hz, 1 channel, Int16 LE
    const view = new DataView(arrayBuffer);
    
    // Check for WAV header manually just in case decodeAudioData failed for other reasons
    // (RIFF header check)
    if (arrayBuffer.byteLength > 44 && view.getUint32(0) === 0x52494646) {
        console.error("This appears to be a corrupt WAV file, not raw PCM.");
        throw e;
    }

    const rawBytes = new Uint8Array(arrayBuffer);
    const samples = new Int16Array(rawBytes.buffer);
    const audioBuffer = ctx.createBuffer(1, samples.length, 24000);
    const channelData = audioBuffer.getChannelData(0);
    
    for (let i = 0; i < samples.length; i++) {
      channelData[i] = samples[i] / 32768.0;
    }
    return audioBuffer;
  }
};

const createAmbientBackgroundTrack = (ctx: AudioContext, dest: AudioNode) => {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.frequency.value = 110.00; // A2
  osc2.frequency.value = 164.81; // E3
  osc1.type = 'sine';
  osc2.type = 'triangle';

  const gain = ctx.createGain();
  gain.gain.value = 0.05;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 600;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  return {
    start: () => { osc1.start(); osc2.start(); },
    stop: () => { osc1.stop(); osc2.stop(); },
    gain: gain
  };
};
