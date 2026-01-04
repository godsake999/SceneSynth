
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
    if (scene.audioSource === 'edge') return 'Edge';
    if (scene.audioSource === 'gemini') return 'Gemini';
    if (scene.audioSource === 'fallback') return 'SoT';
    return '';
  };

  const getAudioColorClass = () => {
    if (scene.audioSource === 'edge') return 'bg-cyan-500/90';
    if (scene.audioSource === 'gemini') return 'bg-green-500/90';
    return 'bg-amber-500/90';
  };

  return (
    <div className="flex flex-col bg-slate-800 rounded-xl overflow-hidden shadow-xl border border-slate-700">
      {/* Visual Area (9:16) */}
      <div className="relative aspect-[9/16] bg-slate-900 overflow-hidden group">
        {hasImage ? (
          <img
            src={scene.imageUrl}
            alt={`Scene ${scene.id}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-600 gap-2">
            {isLoadingImage ? (
              <>
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-medium text-slate-400">
                  Generating with {scene.imageSource === 'gemini' ? 'Gemini' : scene.imageSource === 'fallback' ? 'Flux' : 'AI'}...
                </p>
              </>
            ) : (
              <>
                <i className="fa-solid fa-image text-4xl opacity-50"></i>
                <p className="text-xs font-medium">No Image</p>
              </>
            )}
          </div>
        )}

        {/* Scene Badge */}
        <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded border border-white/10 flex items-center gap-2">
          SCENE {scene.id}
          {hasImage && (
            <span className={`text-[8px] px-1 rounded uppercase ${scene.imageSource === 'gemini' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'}`}>
              {scene.imageSource === 'gemini' ? 'Gemini' : 'Flux'}
            </span>
          )}
        </div>

        {/* Audio Indicator */}
        {hasAudio && (
          <div className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-lg ${getAudioColorClass()}`}>
            <i className="fa-solid fa-volume-high text-[10px] text-white"></i>
          </div>
        )}

        {/* Preview Overlay Button */}
        {isReadyToPreview && !isPreviewing && (
          <button
            onClick={onPreview}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors group-hover:opacity-100 opacity-0 cursor-pointer"
          >
            <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
              <i className="fa-solid fa-play text-indigo-600 pl-1 text-lg"></i>
            </div>
          </button>
        )}

        {isPreviewing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[10px] font-bold text-white tracking-widest">RENDERING</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls Area */}
      <div className="p-3 flex flex-col gap-3 bg-slate-800 border-t border-slate-700">

        {/* Script Section */}
        <div className="space-y-1">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] uppercase text-slate-500 font-bold">Storyline</label>
            <button
              onClick={onGenerateScript}
              disabled={isLoadingText}
              className="text-[10px] text-blue-400 hover:text-blue-300 disabled:opacity-50 font-bold"
            >
              <i className="fa-solid fa-wand-magic-sparkles mr-1"></i>
              {isLoadingText ? "Writing..." : (hasText ? "Rewrite" : "Write")}
            </button>
          </div>
          <textarea
            value={scene.storyLine}
            onChange={(e) => onUpdate({ storyLine: e.target.value })}
            placeholder="Enter voiceover script here..."
            className="w-full min-h-[60px] text-xs text-slate-200 bg-slate-900/50 p-2 rounded border border-slate-700/50 focus:border-blue-500/50 outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Image Prompt Section */}
        <div className="space-y-1">
          <div className="flex justify-between items-center mb-1">
            <label className="text-[10px] uppercase text-slate-500 font-bold">Visual Prompt</label>
          </div>
          <textarea
            value={scene.imagePrompt}
            onChange={(e) => onUpdate({ imagePrompt: e.target.value })}
            placeholder="Describe the image..."
            className="w-full min-h-[50px] text-[10px] text-slate-400 bg-slate-900/30 p-2 rounded border border-slate-700/30 focus:border-indigo-500/50 outline-none resize-none"
          />
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            onClick={onGenerateImage}
            disabled={!scene.imagePrompt || isLoadingImage}
            className={`flex flex-col items-center justify-center py-2 rounded text-[9px] font-bold transition-all ${hasImage
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <i className={`fa-solid ${hasImage ? 'fa-rotate' : 'fa-paintbrush'}`}></i>
              {isLoadingImage ? "Generating..." : (hasImage ? "Redraw" : "Draw")}
            </div>
            {hasImage && <span className="text-[7px] opacity-60 uppercase">{scene.imageSource}</span>}
          </button>

          <button
            onClick={onGenerateAudio}
            disabled={!hasText || isLoadingAudio}
            className={`flex flex-col items-center justify-center py-2 rounded text-[9px] font-bold transition-all ${hasAudio
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <i className={`fa-solid ${hasAudio ? 'fa-rotate' : 'fa-microphone'}`}></i>
              {isLoadingAudio ? "Generating..." : (hasAudio ? "Redo Voice" : "Voice")}
            </div>
            {hasAudio && <span className="text-[7px] opacity-60 uppercase">{getAudioSourceLabel()}</span>}
          </button>
        </div>

        {/* Explicit Preview Button */}
        {isReadyToPreview && (
          <button
            onClick={onPreview}
            disabled={isPreviewing}
            className="w-full mt-1 bg-slate-900 hover:bg-black text-slate-400 hover:text-white border border-slate-700 py-2 rounded text-[10px] font-bold flex items-center justify-center gap-2 transition-all"
          >
            <i className="fa-solid fa-play-circle"></i>
            PREVIEW SCENE VIDEO
          </button>
        )}

      </div>
    </div>
  );
};

export default SceneCard;
