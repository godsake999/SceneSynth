
import React, { useState, useRef } from 'react';
import { 
    generateStoryPlan, 
    generateSingleSceneText, 
    generateSceneImage, 
    generateSpeech, 
    generateIntroTitle,
    generateOutroMessage,
    generateIntroAudio 
} from './services/geminiService';
import { generateSequentialVideo } from './utils/videoGenerator';
import { Scene, IntroState, OutroState, StoryResponse } from './types';
import SceneCard from './components/SceneCard';

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('Cinematic 3D Render');
  
  // Initial States
  const initialIntro: IntroState = { 
      title: '', 
      imagePrompt: '', 
      musicPrompt: '',
      textStatus: 'idle', 
      imageStatus: 'idle',
      musicStatus: 'idle' 
  };
  const initialOutro: OutroState = { message: '', textStatus: 'idle', audioStatus: 'idle' };
  const initialScenes: Scene[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      storyLine: '',
      imagePrompt: '',
      textStatus: 'idle',
      imageStatus: 'idle',
      audioStatus: 'idle'
  }));

  const [intro, setIntro] = useState<IntroState>(initialIntro);
  const [outro, setOutro] = useState<OutroState>(initialOutro);
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);

  // JSON Editor State
  const [showJson, setShowJson] = useState(false);
  const [jsonContent, setJsonContent] = useState('');

  // Global Status
  const [isProducingVideo, setIsProducingVideo] = useState(false);
  const [previewingSceneId, setPreviewingSceneId] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fullMovieUrl, setFullMovieUrl] = useState<string | null>(null);
  const [isPlayingMovie, setIsPlayingMovie] = useState(false);

  const styles = [
    'Cinematic 3D Render', 'Cyberpunk Neon', 'Studio Ghibli Anime', 'Vibrant Watercolor',
    'Dark Fantasy Oil Painting', 'Retro 80s Synthwave', 'Hyper-Realistic Photography', 'Minimalist Vector Art'
  ];

  // --- RESET HANDLER ---
  const handleNewStory = () => {
      if (window.confirm("Are you sure you want to clear everything and start a new story?")) {
          setTopic('');
          setIntro(initialIntro);
          setOutro(initialOutro);
          setScenes(initialScenes);
          setFullMovieUrl(null);
          setError(null);
          setJsonContent('');
          setShowJson(false);
          setIsPlayingMovie(false);
          setVideoProgress(0);
      }
  };

  // --- JSON HANDLERS ---
  const toggleJsonEditor = () => {
    if (!showJson) {
      const data = {
        intro,
        outro,
        scenes: scenes.map(s => ({ 
            storyLine: s.storyLine, 
            imagePrompt: s.imagePrompt,
            imageUrl: s.imageUrl,
            audioUrl: s.audioUrl 
        }))
      };
      setJsonContent(JSON.stringify(data, null, 2));
      setShowJson(true);
    } else {
      try {
        const data = JSON.parse(jsonContent);
        if (data.intro) setIntro(prev => ({ ...prev, ...data.intro }));
        if (data.outro) setOutro(prev => ({ ...prev, ...data.outro }));
        if (data.scenes && Array.isArray(data.scenes)) {
             setScenes(prev => data.scenes.map((s: any, i: number) => ({
                 ...prev[i],
                 storyLine: s.storyLine || '',
                 imagePrompt: s.imagePrompt || '',
                 imageUrl: s.imageUrl || undefined,
                 audioUrl: s.audioUrl || undefined,
                 textStatus: s.storyLine ? 'completed' : 'idle',
                 imageStatus: s.imageUrl ? 'completed' : 'idle',
                 audioStatus: s.audioUrl ? 'completed' : 'idle',
             })));
        }
        setShowJson(false);
        setError(null);
      } catch (e) {
        setError("Invalid JSON format. Please correct it before saving.");
      }
    }
  };

  const updateScene = (index: number, updates: Partial<Scene>) => {
    setScenes(prev => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        return next;
    });
  };

  // --- INTRO ACTIONS ---
  const handleGenerateIntroTitle = async () => {
      setIntro(prev => ({ ...prev, textStatus: 'generating' }));
      setError(null);
      try {
          const title = await generateIntroTitle(topic, style);
          setIntro(prev => ({ ...prev, title, textStatus: 'completed' }));
      } catch (e: any) {
          setIntro(prev => ({ ...prev, textStatus: 'error' }));
          setError(`Intro Title Error: ${e.message}`);
      }
  };

  const handleGenerateIntroImage = async () => {
      const promptToUse = intro.imagePrompt || `Movie title card with text "${intro.title}", ${style} style, cinematic composition`;
      if (!intro.imagePrompt) setIntro(prev => ({...prev, imagePrompt: promptToUse}));
      setIntro(prev => ({ ...prev, imageStatus: 'generating' }));
      setError(null);
      try {
          const url = await generateSceneImage(promptToUse);
          setIntro(prev => ({ ...prev, imageUrl: url, imageStatus: 'completed' }));
      } catch (e: any) {
          setIntro(prev => ({ ...prev, imageStatus: 'error' }));
          setError(`Intro Image Error: ${e.message}`);
      }
  };

  const handleGenerateIntroMusic = async () => {
      const promptToUse = intro.musicPrompt || `Cinematic intro music for ${topic}, ${style}`;
      if (!intro.musicPrompt) setIntro(prev => ({...prev, musicPrompt: promptToUse}));
      setIntro(prev => ({ ...prev, musicStatus: 'generating' }));
      setError(null);
      try {
          const url = await generateIntroAudio(promptToUse);
          setIntro(prev => ({ ...prev, musicUrl: url, musicStatus: 'completed' }));
      } catch (e: any) {
          setIntro(prev => ({ ...prev, musicStatus: 'error' }));
          setError(`Intro Music Error: ${e.message}`);
      }
  };

  // --- OUTRO ACTIONS ---
  const handleGenerateOutroMessage = async () => {
      setOutro(prev => ({ ...prev, textStatus: 'generating' }));
      setError(null);
      try {
          const message = await generateOutroMessage(topic);
          setOutro(prev => ({ ...prev, message, textStatus: 'completed' }));
      } catch (e: any) {
          setOutro(prev => ({ ...prev, textStatus: 'error' }));
          setError(`Outro Message Error: ${e.message}`);
      }
  };

  const handleGenerateOutroAudio = async () => {
      if (!outro.message) return;
      setOutro(prev => ({ ...prev, audioStatus: 'generating' }));
      setError(null);
      try {
          const url = await generateSpeech(outro.message);
          setOutro(prev => ({ ...prev, audioUrl: url, audioStatus: 'completed' }));
      } catch (e: any) {
          setOutro(prev => ({ ...prev, audioStatus: 'error' }));
          setError(`Outro Audio Error: ${e.message}`);
      }
  };

  // --- SCENE ACTIONS ---
  const handleGenerateAllText = async () => {
      if (!topic) return;
      setError(null);
      try {
          const plan = await generateStoryPlan(topic, style);
          setIntro(prev => ({ 
              ...prev, 
              title: plan.title, 
              imagePrompt: plan.introImagePrompt || `Movie title card for "${plan.title}", ${style} style`,
              musicPrompt: plan.introMusicPrompt || `Original Soundtrack for ${plan.title}`,
              textStatus: 'completed' 
          }));
          setOutro(prev => ({ ...prev, message: plan.outroMessage, textStatus: 'completed' }));
          setScenes(prev => prev.map((s, i) => ({
              ...s,
              storyLine: plan.scenes[i]?.storyLine || '',
              imagePrompt: plan.scenes[i]?.imagePrompt ? `${plan.scenes[i].imagePrompt}, ${style} style` : '',
              textStatus: 'completed'
          })));
      } catch (e: any) {
          setError("Failed to generate story plan: " + e.message);
      }
  };

  const handleGenerateSceneScript = async (index: number) => {
      const prevContext = scenes.slice(0, index).map(s => s.storyLine).join(" ");
      setScenes(prev => {
          const next = [...prev];
          next[index].textStatus = 'generating';
          return next;
      });
      setError(null);
      try {
          const res = await generateSingleSceneText(topic || "A generic story", index + 1, prevContext);
          setScenes(prev => {
              const next = [...prev];
              next[index].storyLine = res.storyLine;
              next[index].imagePrompt = `${res.imagePrompt}, ${style} style`;
              next[index].textStatus = 'completed';
              return next;
          });
      } catch (e: any) {
           setScenes(prev => {
              const next = [...prev];
              next[index].textStatus = 'error';
              return next;
          });
          setError(`Scene ${index + 1} Script Error: ${e.message}`);
      }
  };

  const handleGenerateSceneImage = async (index: number) => {
      const scene = scenes[index];
      if (!scene.imagePrompt) return;
      setScenes(prev => {
          const next = [...prev];
          next[index].imageStatus = 'generating';
          return next;
      });
      setError(null);
      try {
          const url = await generateSceneImage(scene.imagePrompt);
          setScenes(prev => {
              const next = [...prev];
              next[index].imageUrl = url;
              next[index].imageStatus = 'completed';
              return next;
          });
      } catch (e: any) {
          setScenes(prev => {
              const next = [...prev];
              next[index].imageStatus = 'error';
              return next;
          });
          setError(`Scene ${index + 1} Image Error: ${e.message}`);
      }
  };

  const handleGenerateSceneAudio = async (index: number) => {
      const scene = scenes[index];
      if (!scene.storyLine) return;
      setScenes(prev => {
          const next = [...prev];
          next[index].audioStatus = 'generating';
          return next;
      });
      setError(null);
      try {
          const url = await generateSpeech(scene.storyLine);
          setScenes(prev => {
              const next = [...prev];
              next[index].audioUrl = url;
              next[index].audioStatus = 'completed';
              return next;
          });
      } catch (e: any) {
          setScenes(prev => {
              const next = [...prev];
              next[index].audioStatus = 'error';
              return next;
          });
          setError(`Scene ${index + 1} Audio Error: ${e.message}`);
      }
  };

  const handlePreviewScene = async (index: number) => {
      const scene = scenes[index];
      if (!scene.imageUrl || !scene.audioUrl) return;
      setPreviewingSceneId(scene.id);
      setError(null);
      try {
          const url = await generateSequentialVideo({
              scenes: [scene],
              onProgress: () => {} 
          });
          setFullMovieUrl(url);
          setIsPlayingMovie(true);
      } catch (e: any) {
          setError(`Preview Error: ${e.message}`);
      } finally {
          setPreviewingSceneId(null);
      }
  };

  const handleProduceVideo = async () => {
      setIsProducingVideo(true);
      setVideoProgress(0);
      setError(null);
      try {
          const url = await generateSequentialVideo({
              scenes,
              intro: (intro.imageUrl && intro.title) ? { 
                  imageUrl: intro.imageUrl, 
                  title: intro.title,
                  musicUrl: intro.musicUrl 
              } : undefined,
              outro: (outro.audioUrl && outro.message) ? { audioUrl: outro.audioUrl, message: outro.message } : undefined,
              onProgress: (p) => setVideoProgress(Math.round(p * 100))
          });
          setFullMovieUrl(url);
          setIsPlayingMovie(true);
      } catch (e: any) {
          setError("Video production failed: " + e.message);
      } finally {
          setIsProducingVideo(false);
      }
  };

  const isReadyToProduce = scenes.every(s => s.imageUrl && s.audioUrl); 

  return (
    <div className="min-h-screen pb-40 bg-[#0f172a] text-slate-100 font-sans">
        
        {/* Navbar */}
        <div className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur border-b border-slate-800 shadow-lg">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                <h1 className="font-bold text-xl tracking-tight">SceneSynth<span className="text-blue-500">AI</span></h1>
                
                <div className="flex items-center gap-2">
                   {fullMovieUrl && (
                      <button 
                          onClick={() => setIsPlayingMovie(true)}
                          className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 transition-transform hover:scale-105"
                      >
                          <i className="fa-solid fa-play"></i> Watch Movie
                      </button>
                   )}
                   <button 
                      onClick={handleNewStory}
                      className="bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-400 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all"
                   >
                      <i className="fa-solid fa-plus-circle"></i> New Story
                   </button>
                   <button 
                      onClick={toggleJsonEditor}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showJson ? 'bg-amber-500/10 text-amber-500 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'}`}
                   >
                      <i className={`fa-solid ${showJson ? 'fa-check' : 'fa-code'} mr-2`}></i>
                      {showJson ? 'Apply Changes' : 'JSON'}
                   </button>
                </div>
            </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 mt-8">
            
            {/* Controls */}
            {!showJson && (
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 mb-10">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-6">
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Story Topic</label>
                          <input 
                              type="text" 
                              value={topic}
                              onChange={e => setTopic(e.target.value)}
                              placeholder="e.g. A cyberpunk detective finding a lost cat in neon city"
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                      </div>
                      <div className="md:col-span-3">
                           <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Visual Style</label>
                           <select 
                              value={style} 
                              onChange={e => setStyle(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none"
                          >
                              {styles.map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                      </div>
                      <div className="md:col-span-3">
                          <button 
                              onClick={handleGenerateAllText}
                              disabled={!topic}
                              className="w-full h-[50px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                          >
                              <i className="fa-solid fa-wand-magic-sparkles"></i> Plan Full Story
                          </button>
                      </div>
                  </div>
              </div>
            )}

            {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-400 rounded-xl flex items-center gap-2">
                    <i className="fa-solid fa-triangle-exclamation"></i> 
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {showJson ? (
              <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 relative">
                <div className="absolute top-2 right-4 text-xs text-slate-500 font-mono">editable</div>
                <textarea 
                  value={jsonContent}
                  onChange={(e) => setJsonContent(e.target.value)}
                  className="w-full h-[70vh] bg-transparent text-slate-300 font-mono text-sm outline-none resize-none p-2"
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  
                  {/* INTRO CARD */}
                  <div className="bg-slate-900/50 border border-indigo-500/30 rounded-xl overflow-hidden flex flex-col relative shadow-xl">
                      <div className="p-3 bg-indigo-900/20 border-b border-indigo-500/20 flex justify-between items-center">
                          <span className="text-xs font-bold text-indigo-400">INTRO SCENE</span>
                          {intro.musicUrl && (
                             <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center animate-pulse">
                                 <i className="fa-solid fa-music text-[10px] text-white"></i>
                             </div>
                          )}
                      </div>
                      <div className="aspect-[9/16] relative bg-black/40 group">
                          {intro.imageUrl ? (
                               <img src={intro.imageUrl} className="w-full h-full object-cover" alt="Intro" />
                          ) : (
                               <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                                   {intro.imageStatus === 'generating' ? (
                                      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                                   ) : <i className="fa-solid fa-film text-4xl opacity-30"></i>}
                               </div>
                          )}
                          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 to-transparent flex flex-col justify-end gap-2">
                               <input 
                                  value={intro.title}
                                  onChange={e => setIntro({...intro, title: e.target.value})}
                                  placeholder="Video Title"
                                  className="w-full bg-transparent text-center font-black text-white text-xl outline-none placeholder:text-white/20"
                               />
                               <div className="space-y-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <input
                                      value={intro.musicPrompt || ''}
                                      onChange={e => setIntro({...intro, musicPrompt: e.target.value})}
                                      placeholder="Music prompt..."
                                      className="w-full bg-black/60 text-[10px] text-pink-300 p-2 rounded border border-pink-500/30 outline-none"
                                   />
                                   <textarea
                                      value={intro.imagePrompt}
                                      onChange={e => setIntro({...intro, imagePrompt: e.target.value})}
                                      placeholder="Image prompt..."
                                      className="w-full bg-black/60 text-[10px] text-slate-300 p-2 rounded border border-white/10 outline-none resize-none h-12"
                                   />
                               </div>
                          </div>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2 mt-auto bg-slate-800">
                          <button 
                               onClick={handleGenerateIntroTitle}
                               className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold py-2 rounded"
                          >
                              {intro.textStatus === 'generating' ? '...' : 'GEN TITLE'}
                          </button>
                          <button 
                               onClick={handleGenerateIntroImage}
                               disabled={!intro.title || intro.imageStatus === 'generating'}
                               className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold py-2 rounded disabled:opacity-50"
                          >
                              {intro.imageStatus === 'generating' ? 'GEN...' : (intro.imageUrl ? 'REDRAW' : 'DRAW')}
                          </button>
                          <button 
                               onClick={handleGenerateIntroMusic}
                               disabled={!intro.title || intro.musicStatus === 'generating'}
                               className={`col-span-2 text-[10px] font-bold py-2 rounded flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
                                   intro.musicUrl 
                                   ? 'bg-pink-900/50 text-pink-300 border border-pink-500/30 hover:bg-pink-900/70' 
                                   : 'bg-pink-600 hover:bg-pink-500 text-white'
                               }`}
                          >
                              <i className={`fa-solid ${intro.musicUrl ? 'fa-rotate' : 'fa-music'}`}></i>
                              {intro.musicStatus === 'generating' ? 'COMPOSING...' : (intro.musicUrl ? 'REGENERATE MUSIC' : 'GENERATE MUSIC')}
                          </button>
                      </div>
                  </div>

                  {/* SCENES 1-5 */}
                  {scenes.map((scene, idx) => (
                      <SceneCard 
                          key={scene.id}
                          scene={scene}
                          isPreviewing={previewingSceneId === scene.id}
                          onUpdate={(updates) => updateScene(idx, updates)}
                          onGenerateScript={() => handleGenerateSceneScript(idx)}
                          onGenerateImage={() => handleGenerateSceneImage(idx)}
                          onGenerateAudio={() => handleGenerateSceneAudio(idx)}
                          onPreview={() => handlePreviewScene(idx)}
                      />
                  ))}

                  {/* OUTRO CARD */}
                  <div className="bg-slate-900/50 border border-emerald-500/30 rounded-xl overflow-hidden flex flex-col shadow-xl">
                      <div className="p-3 bg-emerald-900/20 border-b border-emerald-500/20 flex justify-between items-center">
                          <span className="text-xs font-bold text-emerald-400">OUTRO SCENE</span>
                      </div>
                      <div className="aspect-[9/16] relative bg-black/40 flex items-center justify-center p-6 text-center">
                          <div className="space-y-4 w-full">
                              <i className="fa-solid fa-hand-peace text-4xl text-emerald-500/50"></i>
                              <textarea 
                                  value={outro.message}
                                  onChange={e => setOutro({...outro, message: e.target.value})}
                                  placeholder="Closing message..."
                                  className="w-full bg-transparent text-center text-white text-lg font-bold outline-none resize-none"
                                  rows={4}
                              />
                          </div>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2 mt-auto bg-slate-800">
                          <button 
                               onClick={handleGenerateOutroMessage}
                               className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] font-bold py-2 rounded"
                          >
                              {outro.textStatus === 'generating' ? '...' : 'GEN MSG'}
                          </button>
                          <button 
                               onClick={handleGenerateOutroAudio}
                               disabled={!outro.message || outro.audioStatus === 'generating'}
                               className={`text-[10px] font-bold py-2 rounded disabled:opacity-50 ${
                                   outro.audioUrl 
                                   ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/70' 
                                   : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                               }`}
                          >
                              {outro.audioStatus === 'generating' ? '...' : (outro.audioUrl ? 'REDO VOICE' : 'GEN VOICE')}
                          </button>
                      </div>
                  </div>

              </div>
            )}
            
            {/* Production Footer */}
            {!showJson && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0f172a]/95 backdrop-blur-md border-t border-slate-800 z-40 shadow-2xl">
                  <div className="max-w-6xl mx-auto flex items-center justify-between">
                      <div className="flex items-center gap-4">
                           <div className="text-xs text-slate-400">
                               <span className="font-bold text-white">{scenes.filter(s => s.imageUrl && s.audioUrl).length} / {scenes.length}</span> Scenes Ready
                           </div>
                           {isProducingVideo && (
                               <div className="w-32 sm:w-48 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                                   <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${videoProgress}%`}}></div>
                               </div>
                           )}
                      </div>
                      <div className="flex gap-2">
                        {fullMovieUrl && !isProducingVideo && (
                           <button 
                               onClick={handleNewStory}
                               className="px-4 py-3 rounded-xl font-bold text-sm bg-slate-800 text-red-400 hover:bg-red-900/20 border border-slate-700 transition-all"
                           >
                               RESET
                           </button>
                        )}
                        <button 
                            onClick={handleProduceVideo}
                            disabled={!isReadyToProduce || isProducingVideo}
                            className={`px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-blue-900/20 transition-all ${
                                isReadyToProduce 
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105 active:scale-95' 
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                            {isProducingVideo ? `RENDERING ${videoProgress}%` : 'PRODUCE FULL MOVIE'}
                        </button>
                      </div>
                  </div>
              </div>
            )}

        </main>

        {/* Video Player Modal */}
        {isPlayingMovie && fullMovieUrl && (
            <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex flex-col items-center justify-center p-4">
                <div className="relative w-full max-w-[400px] aspect-[9/16] bg-black shadow-2xl rounded-2xl overflow-hidden border border-slate-800 ring-1 ring-white/10">
                    <video src={fullMovieUrl} controls autoPlay className="w-full h-full object-cover" />
                    <button 
                        onClick={() => setIsPlayingMovie(false)}
                        className="absolute top-4 right-4 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                    >
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                </div>
                <div className="mt-6 flex gap-4">
                    <a href={fullMovieUrl} download="scenesynth-story.webm" className="px-8 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-500 shadow-lg transition-all flex items-center gap-2">
                        <i className="fa-solid fa-download"></i> Download Video
                    </a>
                    <button 
                        onClick={() => {
                            setIsPlayingMovie(false);
                            handleNewStory();
                        }} 
                        className="px-8 py-3 bg-slate-800 text-white rounded-full font-bold hover:bg-slate-700 shadow-lg transition-all flex items-center gap-2"
                    >
                        <i className="fa-solid fa-plus"></i> New Project
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;
