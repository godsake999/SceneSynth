
import React from 'react';
import { Scene } from '../types';

interface SceneCardProps {
  scene: Scene;
  isPreviewing: boolean;
  onUpdate: (updates: Partial<Scene>) => void;
  onGenerateScript: () => void;
  onGenerateImage: () => void;
  onGenerateAudio: () => void;
  onPreview: () => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ 
  scene, 
  isPreviewing,
  onUpdate, 
  onGenerateScript, 
  onGenerateImage, 
  onGenerateAudio,
  onPreview
}) => {
  const hasImage = !!scene.imageUrl;
  const hasAudio = !!scene.audioUrl;
  const hasText = !!scene.storyLine;
  const isReadyToPreview = hasImage && hasAudio;

  const isLoadingImage = scene.imageStatus === 'generating';
  const isLoadingText = scene.textStatus === 'generating';
  const isLoadingAudio = scene.audioStatus === 'generating';

  const getAudioSourceLabel = () => {
    if (scene.audioSource === 'gemini') return 'Gemini';
    if (scene.audioSource === 'streamelements') return 'OS Voice';
    if (scene.audioSource === 'fallback') return 'SoT';
    return '';
  };

  const getAudioColorClass = () => {
    if (scene.audioSource === 'gemini') return 'bg-green-500/90';
    if (scene.audioSource === 'streamelements') return 'bg-emerald-500/90';
    return 'bg-amber-500/90';
  };

  return (
    <div className="flex flex-col bg-slate-800 rounded-2xl shadow-2xl border border-slate-700 transition-all duration-300">
      {/* Visual Area (9:16) */}
      <div className="relative aspect-[9/16] bg-slate-900 rounded-t-2xl overflow-hidden group">
        {hasImage ? (
          <img 
            src={scene.imageUrl} 
            alt={`Scene ${scene.id}`} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-600 gap-3">
            {isLoadingImage ? (
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            ) : (
                <i className="fa-solid fa-image text-5xl opacity-30"></i>
            )}
            <p className="text-sm font-medium tracking-wide">{isLoadingImage ? "Painting..." : "No Image"}</p>
          </div>
        )}

        {/* Scene Badge */}
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 shadow-lg">
          SCENE {scene.id}
          {hasImage && (
              <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter ${scene.imageSource === 'gemini' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'}`}>
                  {scene.imageSource === 'gemini' ? 'Gemini' : 'Flux'}
              </span>
          )}
        </div>
        
        {/* Audio Indicator */}
        {hasAudio && (
            <div className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md ${getAudioColorClass()}`}>
                <i className="fa-solid fa-volume-high text-xs text-white"></i>
            </div>
        )}

        {/* Play Overlay */}
        {isReadyToPreview && !isPreviewing && (
             <button 
                onClick={onPreview}
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-all duration-300 group-hover:opacity-100 opacity-0 cursor-pointer"
             >
                 <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                        <i className="fa-solid fa-play text-indigo-600 pl-1 text-2xl"></i>
                    </div>
                    <span className="text-white text-[10px] font-black tracking-widest uppercase drop-shadow-md">Play Preview</span>
                 </div>
             </button>
        )}
        
        {isPreviewing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10 backdrop-blur-sm">
                 <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-black text-white tracking-widest uppercase">Rendering...</span>
                 </div>
            </div>
        )}
      </div>

      {/* Controls Area */}
      <div className="p-4 flex flex-col gap-4 bg-slate-800 rounded-b-2xl border-t border-slate-700">
        
        {/* Image Prompt Section */}
        <div className="space-y-1.5">
             <label className="text-[10px] uppercase text-slate-500 font-black tracking-wider px-1">Image Visuals</label>
             <textarea 
                 value={scene.imagePrompt}
                 onChange={(e) => onUpdate({ imagePrompt: e.target.value })}
                 placeholder="Visual description for image generation..."
                 className="w-full min-h-[50px] text-[11px] text-slate-300 bg-slate-900/40 p-2.5 rounded-xl border border-slate-700/30 focus:border-indigo-500/50 outline-none resize-none leading-relaxed"
             />
        </div>

        {/* Script Section */}
        <div className="space-y-1.5">
             <div className="flex justify-between items-center px-1">
                 <label className="text-[10px] uppercase text-slate-500 font-black tracking-wider">Storyline</label>
                 <button 
                    onClick={onGenerateScript}
                    disabled={isLoadingText}
                    className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-50 font-black transition-colors"
                 >
                    <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>
                    {isLoadingText ? "Writing..." : (hasText ? "Rewrite" : "Write")}
                 </button>
             </div>
             <textarea 
                 value={scene.storyLine}
                 onChange={(e) => onUpdate({ storyLine: e.target.value })}
                 placeholder="Enter voiceover script here..."
                 className="w-full min-h-[60px] text-xs text-slate-200 bg-slate-900/60 p-3 rounded-xl border border-slate-700/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none resize-none leading-relaxed transition-all"
             />
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-2 h-12">
            <button
                onClick={onGenerateImage}
                disabled={!scene.imagePrompt || isLoadingImage}
                className={`flex flex-col items-center justify-center rounded-xl text-[9px] font-black tracking-tighter transition-all duration-200 ${
                    hasImage 
                    ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-600/50' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <div className="flex items-center gap-1.5">
                    <i className={`fa-solid ${isLoadingImage ? 'fa-spinner animate-spin' : (hasImage ? 'fa-rotate' : 'fa-paintbrush')}`}></i>
                    {isLoadingImage ? "Generating..." : (hasImage ? "Redraw" : "Draw Scene")}
                </div>
            </button>

            <button
                onClick={onGenerateAudio}
                disabled={!hasText || isLoadingAudio}
                className={`flex flex-col items-center justify-center rounded-xl text-[9px] font-black tracking-tighter transition-all duration-200 ${
                    hasAudio 
                    ? 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white border border-slate-600/50' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
                <div className="flex items-center gap-1.5">
                    <i className={`fa-solid ${isLoadingAudio ? 'fa-spinner animate-spin' : (hasAudio ? 'fa-rotate' : 'fa-microphone')}`}></i>
                    {isLoadingAudio ? "Syncing..." : (hasAudio ? "Redo Voice" : "Voice It")}
                </div>
                {hasAudio && !isLoadingAudio && (
                  <span className="text-[7px] opacity-60 uppercase mt-0.5">{getAudioSourceLabel()}</span>
                )}
            </button>
        </div>
      </div>
    </div>
  );
};

export default SceneCard;
