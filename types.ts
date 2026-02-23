
export type GenerationSource = 'gemini' | 'fallback' | 'imagefx' | 'edge' | 'streamelements' | 'none';
export type GenerationStrategy = 'smart' | 'force-fallback' | 'force-imagefx' | 'gemini-only';

export interface Scene {
  id: number;
  storyLine: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;

  // Tracking source
  textSource: GenerationSource;
  imageSource: GenerationSource;
  audioSource: GenerationSource;

  // Granular Statuses
  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
}

export interface IntroState {
  title: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;

  textSource: GenerationSource;
  imageSource: GenerationSource;
  audioSource: GenerationSource;

  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
}

export interface OutroState {
  message: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;

  textSource: GenerationSource;
  imageSource: GenerationSource;
  audioSource: GenerationSource;

  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
}

export interface StoryResponse {
  title: string;
  outroMessage: string;
  introImagePrompt?: string;
  outroImagePrompt?: string;
  visualBible?: string; // Global style and character definition
  scenes: Array<{
    storyLine: string;
    imagePrompt: string;
  }>;
}

// ============== AUDIO CONFIGURATION ==============

// SFX event with timing (query-based for Gemini generation)
export interface SFXEvent {
  query: string;        // Descriptive search term (e.g., "water splash", "whoosh")
  startTime: number;    // Seconds from video start
  volume?: number;      // 0-1, default 0.7
}

// Background music configuration
export interface MusicConfig {
  query: string;        // Descriptive search term (e.g., "peaceful ambient piano")
  loop: boolean;        // Whether to loop
  volume?: number;      // 0-1, default 0.25
  duckToVolume?: number; // Volume during voiceover, default 0.08
}

// Combined audio configuration for video generation
export interface AudioConfig {
  sfxEvents?: SFXEvent[];
  music?: MusicConfig;
}

// Freesound search result
export interface FreesoundResult {
  id: number;
  name: string;
  duration: number;
  previewUrl: string;
  tags: string[];
}
