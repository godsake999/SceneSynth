
export type GenerationSource = 'gemini' | 'fallback' | 'edge' | 'streamelements' | 'none';
export type GenerationStrategy = 'smart' | 'force-fallback' | 'gemini-only';

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
