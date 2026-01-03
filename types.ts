
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
  imagePrompt: string; 
  imageUrl?: string;
  audioUrl?: string;
  
  textStatus: 'idle' | 'generating' | 'completed' | 'error';
  imageStatus: 'idle' | 'generating' | 'completed' | 'error';
  audioStatus: 'idle' | 'generating' | 'completed' | 'error';
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
  scenes: Array<{
    storyLine: string;
    imagePrompt: string;
  }>;
}
