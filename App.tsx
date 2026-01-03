
import React, { useState, useEffect } from 'react';
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
import { Scene, IntroState, OutroState } from './types';
import SceneCard from './components/SceneCard';

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('Cinematic 3D Render');
  
  // Initial States
  const initialIntro: IntroState = { 
      title: '', imagePrompt: '', musicPrompt: '', textStatus: 'idle', imageStatus: 'idle', musicStatus: 'idle' 
  };
  const initialOutro: OutroState = { message: '', textStatus: 'idle', audioStatus: 'idle' };
  const initialScenes: Scene[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1, storyLine: '', imagePrompt: '', textStatus: 'idle', imageStatus: 'idle', audioStatus: 'idle'
  }));

  const [intro, setIntro] = useState<IntroState>(initialIntro);
  const [outro, setOutro] = useState<OutroState>(initialOutro);
  const [scenes, setScenes] = useState<Scene[]>(initialScenes);
  const [showJson, setShowJson] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [isProducingVideo, setIsProducingVideo] = useState(false);
  const [previewingSceneId, setPreviewingSceneId] = useState<number | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fullMovieUrl, setFullMovieUrl] = useState<string | null>(null);
  const [isPlayingMovie, setIsPlayingMovie] = useState(false);

  const handleNewStory = () => {
      if (window.confirm("Start a new story? This will clear current progress.")) {
          setTopic('');
          setIntro(initialIntro);
          setOutro(initialOutro);
          setScenes(initialScenes);
          setFullMovieUrl(null);
          setError(null);
          setJsonContent('');
          setShowJson(false);
          setIsPlayingMovie(false);
      }
  };

  const toggleJsonEditor = () => {
    if (!showJson) {
      const data = { intro, outro, scenes: scenes.map(s => ({ storyLine: s.storyLine, imagePrompt: s.imagePrompt, imageUrl: s.imageUrl, audioUrl: s.audioUrl })) };
      setJsonContent(JSON.stringify(data, null, 2));
      setShowJson(true);
    } else {
      try {
        const data = JSON.parse(jsonContent);
        if (data.intro) setIntro(prev => ({ ...prev, ...data.intro }));
        if (data.outro) setOutro(prev => ({ ...prev, ...data.outro }));
        if (data.scenes) setScenes(prev => data.scenes.map((s: any, i: number) => ({ ...prev[i], ...s, textStatus: 'completed', imageStatus: s.imageUrl ? 'completed' : 'idle', audioStatus: s.audioUrl ? 'completed' : 'idle' })));
        setShowJson(false);
        setError(null);
      } catch (e) { setError("Invalid JSON format."); }
    }
  };

  const updateScene = (index: number, updates: Partial<Scene>) => {
    setScenes(prev => {
        const next = [...prev];
        next[index] = { ...next[index], ...updates };
        return next;
    });
  };

  const handleGenerateIntroTitle = async () => {
      setIntro(prev => ({ ...prev, textStatus: 'generating' }));
      try {
          const title = await generateIntroTitle(topic, style);
          setIntro(prev => ({ ...prev, title, textStatus: 'completed' }));
      } catch (e: any) { setIntro(prev => ({ ...prev, textStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateIntroImage = async () => {
      const prompt = intro.imagePrompt || `Movie title card for "${intro.title}", ${style} style`;
      setIntro(prev => ({ ...prev, imageStatus: 'generating' }));
      try {
          const url = await generateSceneImage(prompt);
          setIntro(prev => ({ ...prev, imageUrl: url, imageStatus: 'completed' }));
      } catch (e: any) { setIntro(prev => ({ ...prev, imageStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateIntroMusic = async () => {
      setIntro(prev => ({ ...prev, musicStatus: 'generating' }));
      try {
          const url = await generateIntroAudio(intro.musicPrompt || topic);
          setIntro(prev => ({ ...prev, musicUrl: url, musicStatus: 'completed' }));
      } catch (e: any) { setIntro(prev => ({ ...prev, musicStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateOutroMessage = async () => {
      setOutro(prev => ({ ...prev, textStatus: 'generating' }));
      try {
          const message = await generateOutroMessage(topic);
          setOutro(prev => ({ ...prev, message, textStatus: 'completed' }));
      } catch (e: any) { setOutro(prev => ({ ...prev, textStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateOutroAudio = async () => {
      setOutro(prev => ({ ...prev, audioStatus: 'generating' }));
      try {
          const url = await generateSpeech(outro.message);
          setOutro(prev => ({ ...prev, audioUrl: url, audioStatus: 'completed' }));
      } catch (e: any) { setOutro(prev => ({ ...prev, audioStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateAllText = async () => {
      if (!topic) return;
      setError(null);
      try {
          const plan = await generateStoryPlan(topic, style);
          setIntro(prev => ({ ...prev, title: plan.title, imagePrompt: plan.introImagePrompt || `Title card: ${plan.title}`, musicPrompt: plan.introMusicPrompt, textStatus: 'completed' }));
          setOutro(prev => ({ ...prev, message: plan.outroMessage, textStatus: 'completed' }));
          setScenes(prev => prev.map((s, i) => ({
              ...s, storyLine: plan.scenes[i]?.storyLine || '', imagePrompt: `${plan.scenes[i].imagePrompt}, ${style} style`, textStatus: 'completed'
          })));
      } catch (e: any) { setError(e.message); }
  };

  const handleGenerateSceneScript = async (index: number) => {
      setScenes(prev => { const next = [...prev]; next[index].textStatus = 'generating'; return next; });
      try {
          const res = await generateSingleSceneText(topic, index + 1, scenes.slice(0, index).map(s => s.storyLine).join(" "));
          setScenes(prev => { const next = [...prev]; next[index] = { ...next[index], storyLine: res.storyLine, imagePrompt: `${res.imagePrompt}, ${style} style`, textStatus: 'completed' }; return next; });
      } catch (e: any) { setScenes(prev => { const next = [...prev]; next[index].textStatus = 'error'; return next; }); setError(e.message); }
  };

  const handleGenerateSceneImage = async (index: number) => {
      setScenes(prev => { const next = [...prev]; next[index].imageStatus = 'generating'; return next; });
      try {
          const url = await generateSceneImage(scenes[index].imagePrompt);
          setScenes(prev => { const next = [...prev]; next[index] = { ...next[index], imageUrl: url, imageStatus: 'completed' }; return next; });
      } catch (e: any) { setScenes(prev => { const next = [...prev]; next[index].imageStatus = 'error'; return next; }); setError(e.message); }
  };

  const handleGenerateSceneAudio = async (index: number) => {
      setScenes(prev => { const next = [...prev]; next[index].audioStatus = 'generating'; return next; });
      try {
          const url = await generateSpeech(scenes[index].storyLine);
          setScenes(prev => { const next = [...prev]; next[index] = { ...next[index], audioUrl: url, audioStatus: 'completed' }; return next; });
      } catch (e: any) { setScenes(prev => { const next = [...prev]; next[index].audioStatus = 'error'; return next; }); setError(e.message); }
  };

  const handlePreviewScene = async (index: number) => {
      const scene = scenes[index];
      if (!scene.imageUrl || !scene.audioUrl) return;
      setPreviewingSceneId(scene.id);
      try {
          const url = await generateSequentialVideo({ scenes: [scene] });
          setFullMovieUrl(url);
          setIsPlayingMovie(true);
      } catch (e: any) { setError(e.message); } finally { setPreviewingSceneId(null); }
  };

  const handleProduceVideo = async () => {
      setIsProducingVideo(true);
      setVideoProgress(0);
      try {
          const url = await generateSequentialVideo({
              scenes,
              intro: intro.imageUrl ? { imageUrl: intro.imageUrl, title: intro.title, musicUrl: intro.musicUrl } : undefined,
              outro: outro.audioUrl ? { audioUrl: outro.audioUrl, message: outro.message } : undefined,
              onProgress: (p) => setVideoProgress(Math.round(p * 100))
          });
          setFullMovieUrl(url);
          setIsPlayingMovie(true);
      } catch (e: any) { setError(e.message); } finally { setIsProducingVideo(false); }
  };

  const isReadyToProduce = scenes.every(s => s.imageUrl && s.audioUrl); 

  return (
    <div className="min-h-screen pb-40 bg-[#0f172a] text-slate-100 font-sans">
        <div className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur border-b border-slate-800">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="font-bold text-xl tracking-tight">SceneSynth<span className="text-blue-500">AI</span></h1>
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20 uppercase tracking-widest">Free Mode</span>
                </div>
                <div className="flex items-center gap-2">
                   <button onClick={handleNewStory} className="bg-slate-800 hover:bg-red-900/20 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 transition-all">New Project</button>
                   <button onClick={toggleJsonEditor} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showJson ? 'bg-amber-500/10 text-amber-500 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>{showJson ? 'Save JSON' : 'JSON'}</button>
                </div>
            </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 mt-8">
            {!showJson && (
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 mb-10">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-6">
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Story Topic</label>
                          <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="A lone astronaut discovers an ancient temple on Mars..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div className="md:col-span-3">
                           <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Visual Style</label>
                           <select value={style} onChange={e => setStyle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none">
                              {['Cinematic 3D Render', 'Cyberpunk Neon', 'Studio Ghibli Anime', 'Vibrant Watercolor', 'Dark Fantasy Oil Painting', 'Hyper-Realistic Photography'].map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                      </div>
                      <div className="md:col-span-3">
                          <button onClick={handleGenerateAllText} disabled={!topic} className="w-full h-[50px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
                              <i className="fa-solid fa-wand-magic-sparkles"></i> Generate Plan
                          </button>
                      </div>
                  </div>
              </div>
            )}

            {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-400 rounded-xl flex items-center gap-2"><i className="fa-solid fa-triangle-exclamation"></i><span className="text-sm font-medium">{error}</span></div>}

            {showJson ? (
              <textarea value={jsonContent} onChange={(e) => setJsonContent(e.target.value)} className="w-full h-[70vh] bg-slate-900 text-slate-300 font-mono text-sm outline-none resize-none p-4 rounded-xl border border-slate-700" spellCheck={false} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  <div className="bg-slate-900/50 border border-indigo-500/30 rounded-xl overflow-hidden flex flex-col">
                      <div className="p-3 bg-indigo-900/20 border-b border-indigo-500/20 flex justify-between items-center"><span className="text-xs font-bold text-indigo-400">INTRO</span></div>
                      <div className="aspect-[9/16] relative bg-black/40 group">
                          {intro.imageUrl ? <img src={intro.imageUrl} className="w-full h-full object-cover" alt="Intro" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">{intro.imageStatus === 'generating' ? <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full"></div> : <i className="fa-solid fa-film text-4xl opacity-30"></i>}</div>}
                          <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/95 to-transparent flex flex-col gap-2">
                               <input value={intro.title} onChange={e => setIntro({...intro, title: e.target.value})} placeholder="Title" className="w-full bg-transparent text-center font-black text-white text-xl outline-none" />
                          </div>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2 mt-auto bg-slate-800">
                          <button onClick={handleGenerateIntroTitle} className="bg-slate-700 text-white text-[10px] py-2 rounded">TITLE</button>
                          <button onClick={handleGenerateIntroImage} className="bg-indigo-600 text-white text-[10px] py-2 rounded">IMAGE</button>
                          <button onClick={handleGenerateIntroMusic} className="col-span-2 bg-pink-600 text-white text-[10px] py-2 rounded">STINGER AUDIO</button>
                      </div>
                  </div>

                  {scenes.map((scene, idx) => <SceneCard key={scene.id} scene={scene} isPreviewing={previewingSceneId === scene.id} onUpdate={(u) => updateScene(idx, u)} onGenerateScript={() => handleGenerateSceneScript(idx)} onGenerateImage={() => handleGenerateSceneImage(idx)} onGenerateAudio={() => handleGenerateSceneAudio(idx)} onPreview={() => handlePreviewScene(idx)} />)}
                  
                  <div className="bg-slate-900/50 border border-emerald-500/30 rounded-xl overflow-hidden flex flex-col">
                      <div className="p-3 bg-emerald-900/20 border-b border-emerald-500/20 flex justify-between items-center"><span className="text-xs font-bold text-emerald-400">OUTRO</span></div>
                      <div className="aspect-[9/16] bg-black/40 flex items-center justify-center p-6"><textarea value={outro.message} onChange={e => setOutro({...outro, message: e.target.value})} placeholder="Closing message..." className="w-full bg-transparent text-center text-white text-lg font-bold outline-none resize-none" rows={4} /></div>
                      <div className="p-3 grid grid-cols-2 gap-2 mt-auto bg-slate-800">
                          <button onClick={handleGenerateOutroMessage} className="bg-slate-700 text-white text-[10px] py-2 rounded">TEXT</button>
                          <button onClick={handleGenerateOutroAudio} className="bg-emerald-600 text-white text-[10px] py-2 rounded">VOICE</button>
                      </div>
                  </div>
              </div>
            )}
            
            {!showJson && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0f172a]/95 backdrop-blur-md border-t border-slate-800 z-40">
                  <div className="max-w-6xl mx-auto flex items-center justify-between">
                      <div className="flex items-center gap-4">
                           <div className="text-xs text-slate-400"><span className="font-bold text-white">{scenes.filter(s => s.imageUrl && s.audioUrl).length} / {scenes.length}</span> Scenes Ready</div>
                           {isProducingVideo && <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{width: `${videoProgress}%`}}></div></div>}
                      </div>
                      <button onClick={handleProduceVideo} disabled={!isReadyToProduce || isProducingVideo} className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${isReadyToProduce ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105' : 'bg-slate-800 text-slate-500'}`}>
                          {isProducingVideo ? `RENDERING ${videoProgress}%` : 'PRODUCE FULL MOVIE'}
                      </button>
                  </div>
              </div>
            )}
        </main>

        {isPlayingMovie && fullMovieUrl && (
            <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4">
                <div className="relative w-full max-w-[400px] aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                    <video src={fullMovieUrl} controls autoPlay className="w-full h-full object-cover" />
                    <button onClick={() => setIsPlayingMovie(false)} className="absolute top-4 right-4 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/80"><i className="fa-solid fa-xmark"></i></button>
                </div>
                <div className="mt-6 flex gap-4">
                    <a href={fullMovieUrl} download="story.webm" className="px-8 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-500 flex items-center gap-2"><i className="fa-solid fa-download"></i> Download</a>
                    <button onClick={() => setIsPlayingMovie(false)} className="px-8 py-3 bg-slate-800 text-white rounded-full font-bold hover:bg-slate-700">Close</button>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;
