
export interface Scene {
  id: number;
  storyLine: string;
  imagePrompt: string;
  imageUrl?: string;
  audioUrl?: string;
  
  // Granular Statuses
  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
}

export interface IntroState {
  title: string;
  imagePrompt?: string; 
  imageUrl?: string;
  musicPrompt?: string; // New: Description of the music
  musicUrl?: string;    // New: URL of the generated audio
  
  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  musicStatus?: 'idle' | 'generating' | 'completed' | 'error'; // New
}

export interface OutroState {
  message: string;
  audioUrl?: string;
  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
}

export interface StoryResponse {
  title: string;
  outroMessage: string;
  introImagePrompt?: string; 
  introMusicPrompt?: string; // New: AI suggested music prompt
  scenes: Array<{
    storyLine: string;
    imagePrompt: string;
  }>;
}
