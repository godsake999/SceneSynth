
import { Scene } from "../types";

interface VideoGeneratorOptions {
  scenes: Scene[];
  intro?: {
    imageUrl: string;
    title: string;
    audioUrl?: string; 
  };
  outro?: {
    imageUrl?: string;
    audioUrl: string;
    message: string;
  };
  onProgress?: (progress: number) => void;
}

type TransitionType = 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'zoom' | 'wipeLeft' | 'wipeRight' | 'none';

// Professional, streamlined transitions for a cohesive feel
const TRANSITIONS: TransitionType[] = [
  'fade', 'slideLeft', 'slideRight', 'slideUp', 'slideDown', 
  'zoom', 'wipeLeft', 'wipeRight'
];

// Pacing Constants
const BREATH_DURATION = 0.8; // Seconds of silence after audio to let scene "breathe"
const TRANS_DURATION = 1.2;  // Slower transitions for cinematic flow

export const generateSequentialVideo = async ({
  scenes,
  intro,
  outro,
  onProgress
}: VideoGeneratorOptions): Promise<string> => {
  
  const hasIntro = !!(intro?.imageUrl && intro?.audioUrl);
  const validScenes = scenes.filter(s => s.imageUrl && s.audioUrl);
  
  if (validScenes.length === 0 && !hasIntro && !outro?.audioUrl) throw new Error("No valid content to generate video");

  await document.fonts.ready;

  const width = 720;
  const height = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not get canvas context");

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const dest = audioContext.createMediaStreamDestination();
  const audioTrack = dest.stream.getAudioTracks()[0];

  const stream = canvas.captureStream(30);
  stream.addTrack(audioTrack);

  const recorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 3500000 
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();

  const bgmNodes = createAmbientBackgroundTrack(audioContext, dest);
  bgmNodes.gain.gain.value = 0; 
  bgmNodes.start();
  
  bgmNodes.gain.gain.setValueAtTime(0, audioContext.currentTime);
  bgmNodes.gain.gain.linearRampToValueAtTime(0.08, audioContext.currentTime + 2.0); 

  try {
    const loadedAssets = await Promise.all(validScenes.map(async (scene) => {
        const img = await loadImage(scene.imageUrl!);
        const ab = await loadAudioUniversal(scene.audioUrl!, audioContext);
        return { scene, img, audioBuffer: ab };
    }));

    let introImg: HTMLImageElement | null = null;
    let introAudioBuffer: AudioBuffer | null = null;
    if (intro?.imageUrl && intro.audioUrl) {
      introImg = await loadImage(intro.imageUrl);
      introAudioBuffer = await loadAudioUniversal(intro.audioUrl, audioContext);
    }

    let outroBuffer: AudioBuffer | null = null;
    let outroImg: HTMLImageElement | null = null;
    if (outro) {
      outroBuffer = await loadAudioUniversal(outro.audioUrl, audioContext);
      if (outro.imageUrl) outroImg = await loadImage(outro.imageUrl);
    }

    if (introImg && introAudioBuffer) {
       await playIntroSegment(ctx, dest, audioContext, introImg, intro!.title, width, height, introAudioBuffer);
    }

    for (let i = 0; i < loadedAssets.length; i++) {
        const { scene, img, audioBuffer } = loadedAssets[i];
        if (onProgress) onProgress(i / loadedAssets.length);
        const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];
        await playSceneSegment(ctx, dest, audioContext, img, audioBuffer, scene.storyLine, width, height, transition);
    }

    if (outro && outroBuffer) {
        const bgImage = outroImg || (loadedAssets.length > 0 ? loadedAssets[loadedAssets.length - 1].img : introImg);
        if (bgImage) {
            const voiceDuration = outroBuffer.duration;
            const fadeStartTime = audioContext.currentTime + voiceDuration;
            bgmNodes.gain.gain.setValueAtTime(0.08, fadeStartTime);
            bgmNodes.gain.gain.linearRampToValueAtTime(0, fadeStartTime + 2.5);
            await playOutroSegment(ctx, dest, audioContext, bgImage, outroBuffer, outro.message, width, height, voiceDuration + 1.5);
        }
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
    recorder.onstop = () => resolve(URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })));
  });
};

// --- HELPER FUNCTIONS ---

const playIntroSegment = (
  ctx: CanvasRenderingContext2D, dest: MediaStreamAudioDestinationNode, audioCtx: AudioContext,
  image: HTMLImageElement, title: string, width: number, height: number, audioBuffer: AudioBuffer
): Promise<void> => {
  return new Promise((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);
    source.start();

    const duration = audioBuffer.duration + BREATH_DURATION;
    const startTime = performance.now();
    const words = title.toUpperCase().split(' ');
    ctx.font = `800 60px Inter, sans-serif`;
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        if (ctx.measureText(currentLine + " " + words[i]).width < width - 100) currentLine += " " + words[i];
        else { lines.push(currentLine); currentLine = words[i]; }
    }
    lines.push(currentLine);

    const draw = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= duration) { resolve(); return; }
      const progress = elapsed / duration;
      const scale = 1.0 + (0.05 * progress); 
      ctx.drawImage(image, (width - width*scale)/2, (height - height*scale)/2, width*scale, height*scale);
      
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0,0,width,height);
      
      ctx.globalAlpha = Math.min(progress * 4, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 60px Inter, sans-serif`;
      ctx.fillStyle = 'white';
      lines.forEach((line, idx) => ctx.fillText(line, width/2, (height/2 - (lines.length*35)) + idx*70));
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    draw();
  });
};

const playSceneSegment = (
    ctx: CanvasRenderingContext2D, dest: MediaStreamAudioDestinationNode, audioCtx: AudioContext,
    image: HTMLImageElement, audioBuffer: AudioBuffer, text: string, width: number, height: number,
    transition: TransitionType
): Promise<void> => {
    return new Promise((resolve) => {
        const snapshot = ctx.getImageData(0, 0, width, height);
        const snapshotCanvas = document.createElement('canvas');
        snapshotCanvas.width = width; snapshotCanvas.height = height;
        snapshotCanvas.getContext('2d')?.putImageData(snapshot, 0, 0);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(dest);
        source.start();

        const audioDur = audioBuffer.duration;
        const totalDur = audioDur + BREATH_DURATION;
        const startTime = performance.now();

        const draw = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            if (elapsed >= totalDur) { resolve(); return; }
            
            // progress of total scene duration
            const totalProgress = elapsed / totalDur;
            // progress of voice-over (for subtitles)
            const audioProgress = Math.min(elapsed / audioDur, 1);
            // progress of transition
            const tp = Math.min(elapsed / TRANS_DURATION, 1);

            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);

            // Subtle continuous Ken Burns zoom
            const scale = 1.02 + (0.08 * totalProgress);
            const sw = width * scale, sh = height * scale;
            const bx = (width - sw) / 2, by = (height - sh) / 2;

            if (elapsed < TRANS_DURATION) {
                switch(transition) {
                    case 'fade':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.globalAlpha = tp;
                        ctx.drawImage(image, bx, by, sw, sh);
                        ctx.globalAlpha = 1;
                        break;
                    case 'slideLeft':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.drawImage(image, bx + width * (1 - tp), by, sw, sh);
                        break;
                    case 'slideDown':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.drawImage(image, bx, by - height * (1 - tp), sw, sh);
                        break;
                    case 'slideRight':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.drawImage(image, bx - width * (1 - tp), by, sw, sh);
                        break;
                    case 'slideUp':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.drawImage(image, bx, by + height * (1 - tp), sw, sh);
                        break;
                    case 'wipeLeft':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.drawImage(image, 0, 0, width * tp, height, 0, 0, width * tp, height);
                        break;
                    case 'wipeRight':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.drawImage(image, width * (1 - tp), 0, width * tp, height, width * (1 - tp), 0, width * tp, height);
                        break;
                    case 'zoom':
                        ctx.drawImage(snapshotCanvas, 0, 0);
                        ctx.save();
                        const z = 0.5 + 0.5 * tp;
                        ctx.translate(width/2, height/2);
                        ctx.scale(z, z);
                        ctx.globalAlpha = tp;
                        ctx.drawImage(image, -sw/2, -sh/2, sw, sh);
                        ctx.restore();
                        ctx.globalAlpha = 1;
                        break;
                    default:
                        ctx.globalAlpha = tp;
                        ctx.drawImage(image, bx, by, sw, sh);
                        ctx.globalAlpha = 1;
                }
            } else {
                ctx.drawImage(image, bx, by, sw, sh);
            }

            // Draw subtitles synced to audio progress
            if (elapsed < audioDur + 0.2) {
                drawSubtitles(ctx, text, width, height, audioProgress);
            } else {
                // Keep completed subtitle visible for a moment during breathing room
                drawSubtitles(ctx, text, width, height, 1.0);
            }
            
            requestAnimationFrame(draw);
        };
        draw();
    });
};

const playOutroSegment = (
  ctx: CanvasRenderingContext2D, dest: MediaStreamAudioDestinationNode, audioCtx: AudioContext,
  image: HTMLImageElement, audioBuffer: AudioBuffer, message: string, width: number, height: number, duration: number
): Promise<void> => {
  return new Promise((resolve) => {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);
    source.start();

    const startTime = performance.now();
    const words = message.split(' ');
    ctx.font = `bold 40px Inter, sans-serif`;
    const lines: string[] = [];
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
        if (ctx.measureText(currentLine + " " + words[i]).width < width - 120) currentLine += " " + words[i];
        else { lines.push(currentLine); currentLine = words[i]; }
    }
    lines.push(currentLine);

    const draw = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        if (elapsed >= duration) { resolve(); return; }
        const p = Math.min(elapsed / 1.5, 1);
        ctx.drawImage(image, 0, 0, width, height);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * p})`;
        ctx.fillRect(0, 0, width, height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255, 255, 255, ${p})`;
        lines.forEach((l, i) => ctx.fillText(l, width/2, (height/2 - (lines.length*25)) + i*50));
        requestAnimationFrame(draw);
    };
    draw();
  });
};

/**
 * Draws high-impact subtitles with a Karaoke highlight effect using clipping masks.
 */
const drawSubtitles = (ctx: CanvasRenderingContext2D, text: string, cw: number, ch: number, progress: number) => {
  const fontSize = 38;
  const lineHeight = fontSize * 1.3;
  ctx.textAlign = 'center';
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  
  // Wrap text into lines
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {
    if (ctx.measureText(cur + " " + words[i]).width < cw - 100) cur += " " + words[i];
    else { lines.push(cur); cur = words[i]; }
  }
  lines.push(cur);

  // Background protection gradient
  const gradHeight = 300;
  const grad = ctx.createLinearGradient(0, ch - gradHeight, 0, ch);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(1, "rgba(0,0,0,0.8)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, ch - gradHeight, cw, gradHeight);

  // Calculate character-based progress distribution
  const totalChars = text.length;
  let charAccumulator = 0;
  const startY = ch - 120 - (lines.length - 1) * lineHeight;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    const x = cw / 2;
    const lineWidth = ctx.measureText(line).width;
    
    // 1. Draw the "inactive" base text
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)"; // Dimmed base
    ctx.fillText(line, x, y);
    ctx.shadowBlur = 0;

    // 2. Draw the "active" karaoke highlight using clipping
    const lineChars = line.length;
    const lineStartProgress = charAccumulator / totalChars;
    const lineEndProgress = (charAccumulator + lineChars) / totalChars;
    
    // Determine how much of this specific line should be highlighted
    if (progress > lineStartProgress) {
        const lineLocalProgress = Math.min((progress - lineStartProgress) / (lineEndProgress - lineStartProgress), 1);
        
        ctx.save();
        // Create a clipping rectangle that expands from the left of the text to the right
        const textLeft = x - lineWidth / 2;
        ctx.beginPath();
        ctx.rect(textLeft, y - fontSize, lineWidth * lineLocalProgress, fontSize * 1.5);
        ctx.clip();
        
        // Highlight styling: Vibrant Gold
        ctx.fillStyle = "#FFD700"; 
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 4;
        ctx.fillText(line, x, y);
        ctx.restore();
    }
    
    charAccumulator += lineChars + 1; // +1 to account for the space/gap
  });
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
};

const loadAudioUniversal = async (src: string, ctx: AudioContext): Promise<AudioBuffer> => {
  const response = await fetch(src);
  const ab = await response.arrayBuffer();
  try { return await ctx.decodeAudioData(ab.slice(0)); } catch {
    const samples = new Int16Array(ab);
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) data[i] = samples[i] / 32768.0;
    return buffer;
  }
};

const createAmbientBackgroundTrack = (ctx: AudioContext, dest: AudioNode) => {
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
  o1.frequency.value = 110; o2.frequency.value = 165;
  o1.type = 'sine'; o2.type = 'triangle';
  const gain = ctx.createGain(); gain.gain.value = 0.05;
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
  o1.connect(filter); o2.connect(filter); filter.connect(gain); gain.connect(dest);
  return { start: () => { o1.start(); o2.start(); }, stop: () => { o1.stop(); o2.stop(); }, gain };
};
