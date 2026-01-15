
import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { 
    generateStoryPlan, 
    generateSingleSceneText, 
    generateSceneImage, 
    generateSpeech, 
    generateIntroTitle,
    generateOutroMessage
} from './services/geminiService';
import { generateSequentialVideo } from './utils/videoGenerator';
import { Scene, IntroState, OutroState, GenerationStrategy } from './types';
import SceneCard from './components/SceneCard';

// --- STATE FACTORIES TO PREVENT MUTATION BUGS ---

const createDefaultIntro = (): IntroState => ({ 
    title: '', imagePrompt: '', textStatus: 'idle', imageStatus: 'idle', audioStatus: 'idle',
    textSource: 'none', imageSource: 'none', audioSource: 'none'
});

const createDefaultOutro = (): OutroState => ({ 
    message: '', imagePrompt: '', textStatus: 'idle', imageStatus: 'idle', audioStatus: 'idle',
    textSource: 'none', imageSource: 'none', audioSource: 'none'
});

const createDefaultScenes = (): Scene[] => Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, storyLine: '', imagePrompt: '', textStatus: 'idle', imageStatus: 'idle', audioStatus: 'idle',
    textSource: 'none', imageSource: 'none', audioSource: 'none'
}));

const App: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('Cinematic 3D Render');
  const [strategy, setStrategy] = useState<GenerationStrategy>('smart');
  const [language, setLanguage] = useState<'en' | 'my'>('en'); // New Language State
  const [visualBible, setVisualBible] = useState<string>('');
  const [isPlanning, setIsPlanning] = useState(false);
  
  const [intro, setIntro] = useState<IntroState>(createDefaultIntro());
  const [outro, setOutro] = useState<OutroState>(createDefaultOutro());
  const [scenes, setScenes] = useState<Scene[]>(createDefaultScenes());
  
  const [showJson, setShowJson] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [isProducingVideo, setIsProducingVideo] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [previewingSceneId, setPreviewingSceneId] = useState<number | null>(null);
  const [isPreviewingIntro, setIsPreviewingIntro] = useState(false);
  const [isPreviewingOutro, setIsPreviewingOutro] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fullMovieUrl, setFullMovieUrl] = useState<string | null>(null);
  const [isPlayingMovie, setIsPlayingMovie] = useState(false);
  const [appResetKey, setAppResetKey] = useState(0);

  const handleNewStory = () => {
      if (window.confirm("Start a new story? This will clear all current progress and fields.")) {
          setTopic('');
          setVisualBible('');
          setStyle('Cinematic 3D Render');
          setStrategy('smart');
          setLanguage('en');
          setIntro(createDefaultIntro());
          setOutro(createDefaultOutro());
          setScenes(createDefaultScenes());
          setIsPlanning(false);
          setIsProducingVideo(false);
          setIsZipping(false);
          setPreviewingSceneId(null);
          setIsPreviewingIntro(false);
          setIsPreviewingOutro(false);
          setVideoProgress(0);
          setFullMovieUrl(null);
          setError(null);
          setIsPlayingMovie(false);
          setJsonContent('');
          setShowJson(false);
          setAppResetKey(prev => prev + 1);
      }
  };

  const toggleJsonEditor = () => {
    if (!showJson) {
      const data = { 
        visualBible,
        intro, 
        outro, 
        scenes: scenes.map(s => ({ storyLine: s.storyLine, imagePrompt: s.imagePrompt, imageUrl: s.imageUrl, audioUrl: s.audioUrl, imageSource: s.imageSource, audioSource: s.audioSource })) 
      };
      setJsonContent(JSON.stringify(data, null, 2));
      setShowJson(true);
    } else {
      try {
        const data = JSON.parse(jsonContent);
        if (data.visualBible !== undefined) setVisualBible(typeof data.visualBible === 'string' ? data.visualBible : JSON.stringify(data.visualBible));
        if (data.intro) setIntro(prev => ({ ...prev, ...data.intro }));
        if (data.outro) setOutro(prev => ({ ...prev, ...data.outro }));
        if (data.scenes) {
          setScenes(data.scenes.map((s: any, i: number) => ({ 
            ...createDefaultScenes()[i], 
            ...s, 
            textStatus: s.storyLine ? 'completed' : 'idle', 
            imageStatus: s.imageUrl ? 'completed' : 'idle', 
            audioStatus: s.audioUrl ? 'completed' : 'idle' 
          })));
        }
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
          setIntro(prev => ({ ...prev, title, textStatus: 'completed', textSource: 'gemini' }));
      } catch (e: any) { setIntro(prev => ({ ...prev, textStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateIntroImage = async () => {
      const prompt = intro.imagePrompt || `Movie title card for "${intro.title || topic}", ${style} style`;
      setIntro(prev => ({ ...prev, imageStatus: 'generating' }));
      try {
          const res = await generateSceneImage(prompt, strategy, visualBible);
          setIntro(prev => ({ ...prev, imageUrl: res.data, imageStatus: 'completed', imageSource: res.source }));
      } catch (e: any) { setIntro(prev => ({ ...prev, imageStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateIntroAudio = async () => {
      const textToSpeak = intro.title || topic;
      if (!textToSpeak) return;
      setIntro(prev => ({ ...prev, audioStatus: 'generating' }));
      try {
          const res = await generateSpeech(textToSpeak, strategy, language);
          setIntro(prev => ({ ...prev, audioUrl: res.data, audioStatus: 'completed', audioSource: res.source }));
      } catch (e: any) { setIntro(prev => ({ ...prev, audioStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateOutroMessage = async () => {
      setOutro(prev => ({ ...prev, textStatus: 'generating' }));
      try {
          const message = await generateOutroMessage(topic);
          setOutro(prev => ({ ...prev, message, textStatus: 'completed', textSource: 'gemini' }));
      } catch (e: any) { setOutro(prev => ({ ...prev, textStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateOutroImage = async () => {
      const prompt = outro.imagePrompt || `Cinematic ending scene for "${topic}", ${style} style`;
      setOutro(prev => ({ ...prev, imageStatus: 'generating' }));
      try {
          const contextImage = scenes[4].imageUrl || scenes[3].imageUrl || intro.imageUrl;
          const res = await generateSceneImage(prompt, strategy, visualBible, contextImage);
          setOutro(prev => ({ ...prev, imageUrl: res.data, imageStatus: 'completed', imageSource: res.source }));
      } catch (e: any) { setOutro(prev => ({ ...prev, imageStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateOutroAudio = async () => {
      if (!outro.message) return;
      setOutro(prev => ({ ...prev, audioStatus: 'generating' }));
      try {
          const res = await generateSpeech(outro.message, strategy, language);
          setOutro(prev => ({ ...prev, audioUrl: res.data, audioStatus: 'completed', audioSource: res.source }));
      } catch (e: any) { setOutro(prev => ({ ...prev, audioStatus: 'error' })); setError(e.message); }
  };

  const handleGenerateAllText = async () => {
      if (!topic || isPlanning) return;
      setError(null);
      setIsPlanning(true);
      try {
          const plan = await generateStoryPlan(topic, style);
          
          const bibleRaw = plan.visualBible || '';
          const bibleString = typeof bibleRaw === 'string' 
            ? bibleRaw 
            : JSON.stringify(bibleRaw, null, 2);
          
          setVisualBible(bibleString);
          setIntro(prev => ({ 
            ...prev, 
            title: plan.title, 
            imagePrompt: plan.introImagePrompt || `Title card: ${plan.title}`, 
            textStatus: 'completed', 
            textSource: 'gemini' 
          }));
          setOutro(prev => ({ 
            ...prev, 
            message: plan.outroMessage, 
            imagePrompt: plan.outroImagePrompt || `Ending frame: ${plan.title}`,
            textStatus: 'completed', 
            textSource: 'gemini' 
          }));
          setScenes(prev => prev.map((s, i) => ({
              ...s, 
              storyLine: plan.scenes[i]?.storyLine || '', 
              imagePrompt: `${plan.scenes[i]?.imagePrompt || topic}, ${style} style`, 
              textStatus: 'completed', 
              textSource: 'gemini'
          })));
      } catch (e: any) { 
          setError(e.message); 
      } finally {
          setIsPlanning(false);
      }
  };

  const handleGenerateSceneScript = async (index: number) => {
      setScenes(prev => { 
        const next = [...prev]; 
        next[index] = { ...next[index], textStatus: 'generating' }; 
        return next; 
      });
      try {
          const res = await generateSingleSceneText(topic, index + 1, scenes.slice(0, index).map(s => s.storyLine).join(" "));
          setScenes(prev => { 
            const next = [...prev]; 
            next[index] = { ...next[index], storyLine: res.storyLine, imagePrompt: `${res.imagePrompt}, ${style} style`, textStatus: 'completed', textSource: 'gemini' }; 
            return next; 
          });
      } catch (e: any) { 
        setScenes(prev => { 
          const next = [...prev]; 
          next[index] = { ...next[index], textStatus: 'error' }; 
          return next; 
        }); 
        setError(e.message); 
      }
  };

  const handleGenerateSceneImage = async (index: number) => {
      setScenes(prev => { 
        const next = [...prev]; 
        next[index] = { ...next[index], imageStatus: 'generating' }; 
        return next; 
      });
      try {
          let contextImage = undefined;
          if (index > 0 && scenes[index - 1].imageUrl) {
            contextImage = scenes[index - 1].imageUrl;
          } else if (intro.imageUrl) {
            contextImage = intro.imageUrl;
          }

          const res = await generateSceneImage(scenes[index].imagePrompt, strategy, visualBible, contextImage);
          setScenes(prev => { 
            const next = [...prev]; 
            next[index] = { ...next[index], imageUrl: res.data, imageStatus: 'completed', imageSource: res.source }; 
            return next; 
          });
      } catch (e: any) { 
        setScenes(prev => { 
          const next = [...prev]; 
          next[index] = { ...next[index], imageStatus: 'error' }; 
          return next; 
        }); 
        setError(e.message); 
      }
  };

  const handleGenerateSceneAudio = async (index: number) => {
      setScenes(prev => { 
        const next = [...prev]; 
        next[index] = { ...next[index], audioStatus: 'generating' }; 
        return next; 
      });
      try {
          const res = await generateSpeech(scenes[index].storyLine, strategy, language);
          setScenes(prev => { 
            const next = [...prev]; 
            next[index] = { ...next[index], audioUrl: res.data, audioStatus: 'completed', audioSource: res.source }; 
            return next; 
          });
      } catch (e: any) { 
        setScenes(prev => { 
          const next = [...prev]; 
          next[index] = { ...next[index], audioStatus: 'error' }; 
          return next; 
        }); 
        setError(e.message); 
      }
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

  const handlePreviewIntro = async () => {
    if (!intro.imageUrl || !intro.audioUrl) return;
    setIsPreviewingIntro(true);
    try {
        const url = await generateSequentialVideo({ 
            scenes: [],
            intro: { imageUrl: intro.imageUrl, title: intro.title, audioUrl: intro.audioUrl } 
        });
        setFullMovieUrl(url);
        setIsPlayingMovie(true);
    } catch (e: any) { setError(e.message); } finally { setIsPreviewingIntro(false); }
  }

  const handlePreviewOutro = async () => {
    if (!outro.audioUrl) return;
    setIsPreviewingOutro(true);
    try {
        const url = await generateSequentialVideo({ 
            scenes: [],
            outro: { imageUrl: outro.imageUrl, audioUrl: outro.audioUrl, message: outro.message } 
        });
        setFullMovieUrl(url);
        setIsPlayingMovie(true);
    } catch (e: any) { setError(e.message); } finally { setIsPreviewingOutro(false); }
  }

  const handleProduceVideo = async () => {
      setIsProducingVideo(true);
      setVideoProgress(0);
      try {
          const url = await generateSequentialVideo({
              scenes,
              intro: intro.imageUrl && intro.audioUrl ? { imageUrl: intro.imageUrl, title: intro.title, audioUrl: intro.audioUrl } : undefined,
              outro: outro.audioUrl ? { audioUrl: outro.audioUrl, message: outro.message, imageUrl: outro.imageUrl } : undefined,
              onProgress: (p) => setVideoProgress(Math.round(p * 100))
          });
          setFullMovieUrl(url);
          setIsPlayingMovie(true);
      } catch (e: any) { setError(e.message); } finally { setIsProducingVideo(false); }
  };

  const downloadAllImages = async () => {
    const imagesToDownload = [
      { url: intro.imageUrl, name: '1' },
      ...scenes.map((s, i) => ({ url: s.imageUrl, name: (i + 2).toString() })),
      { url: outro.imageUrl, name: '7' }
    ].filter(img => !!img.url);

    if (imagesToDownload.length === 0) {
      alert("No images generated yet.");
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const safeTitle = (intro.title || topic || 'story').toLowerCase().replace(/[^a-z0-9]/g, '_');
      const fetchImage = async (url: string) => {
        const response = await fetch(url);
        return await response.blob();
      };
      await Promise.all(imagesToDownload.map(async (img) => {
        const blob = await fetchImage(img.url!);
        zip.file(`${safeTitle}_${img.name}.png`, blob);
      }));
      const content = await zip.generateAsync({ type: 'blob' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(content);
      downloadLink.download = `${safeTitle}_assets.zip`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e: any) {
      setError("Failed to create asset zip: " + e.message);
    } finally {
      setIsZipping(false);
    }
  };

  const isReadyToProduce = scenes.every(s => s.imageUrl && s.audioUrl); 
  const hasSomeImages = !!intro.imageUrl || scenes.some(s => !!s.imageUrl) || !!outro.imageUrl;

  const getAudioLabel = (source: string) => {
      if (source === 'gemini') return 'GEMINI';
      if (source === 'streamelements') return 'OS VOICE';
      if (source === 'fallback') return 'SOT';
      return '';
  }

  return (
    <div key={appResetKey} className="min-h-screen pb-40 bg-[#0f172a] text-slate-100 font-sans">
        <div className="sticky top-0 z-50 bg-[#0f172a]/80 backdrop-blur border-b border-slate-800">
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="font-bold text-xl tracking-tight">SceneSynth<span className="text-blue-500">AI</span></h1>
                </div>
                <div className="flex items-center gap-2">
                   <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 mr-2">
                       <button onClick={() => setLanguage('en')} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${language === 'en' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>EN</button>
                       <button onClick={() => setLanguage('my')} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${language === 'my' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>MY</button>
                   </div>
                   <button onClick={handleNewStory} className="bg-slate-800 hover:bg-red-900/20 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-700 transition-all">New Project</button>
                   <button onClick={toggleJsonEditor} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${showJson ? 'bg-amber-500/10 text-amber-500 border-amber-500/50' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>{showJson ? 'Save JSON' : 'JSON'}</button>
                </div>
            </div>
        </div>

        <main className="max-w-6xl mx-auto px-4 mt-8">
            {!showJson && (
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 mb-10">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-5">
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Story Topic</label>
                          <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Enter a story concept..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div className="md:col-span-3">
                           <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Visual Style</label>
                           <select value={style} onChange={e => setStyle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none">
                              {['Cinematic 3D Render', 'Cyberpunk Neon', 'Studio Ghibli Anime', 'Vibrant Watercolor', 'Dark Fantasy Oil Painting', 'Hyper-Realistic Photography'].map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                      </div>
                      <div className="md:col-span-2">
                           <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-2 block">Model Strategy</label>
                           <select value={strategy} onChange={e => setStrategy(e.target.value as GenerationStrategy)} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-3 outline-none text-[10px] font-bold">
                              <option value="smart">SMART (AUTO)</option>
                              <option value="force-fallback">FORCE FREE</option>
                              <option value="gemini-only">GEMINI ONLY</option>
                           </select>
                      </div>
                      <div className="md:col-span-2">
                          <button 
                            onClick={handleGenerateAllText} 
                            disabled={!topic || isPlanning} 
                            className={`w-full h-[50px] ${isPlanning ? 'bg-slate-700' : 'bg-gradient-to-r from-blue-600 to-indigo-600'} text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all`}
                          >
                              <i className={`fa-solid ${isPlanning ? 'fa-spinner animate-spin' : 'fa-wand-magic-sparkles'}`}></i>
                              {isPlanning ? 'PLANNING...' : 'PLAN'}
                          </button>
                      </div>
                      {visualBible && (
                        <div className="md:col-span-12 mt-4 p-4 bg-slate-900/50 border border-blue-500/20 rounded-xl overflow-hidden">
                            <label className="text-[10px] font-black text-blue-400 uppercase mb-2 block tracking-widest">Visual Bible (Context)</label>
                            <p className="text-xs text-slate-400 leading-relaxed italic line-clamp-4">
                                {typeof visualBible === 'string' ? visualBible : JSON.stringify(visualBible)}
                            </p>
                        </div>
                      )}
                  </div>
              </div>
            )}

            {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-400 rounded-xl flex items-center gap-2"><i className="fa-solid fa-triangle-exclamation"></i><span className="text-sm font-medium">{error}</span></div>}

            {showJson ? (
              <textarea value={jsonContent} onChange={(e) => setJsonContent(e.target.value)} className="w-full h-[70vh] bg-slate-900 text-slate-300 font-mono text-sm outline-none resize-none p-4 rounded-xl border border-slate-700" spellCheck={false} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {/* INTRO CARD */}
                  <div className="flex flex-col bg-slate-800 rounded-2xl shadow-2xl border border-indigo-500/20 overflow-hidden relative transition-all duration-300">
                    <div className="relative aspect-[9/16] bg-slate-900 group">
                      {intro.imageUrl ? (
                        <img src={intro.imageUrl} alt="Intro" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-600 gap-3">
                          {intro.imageStatus === 'generating' ? <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div> : <i className="fa-solid fa-film text-5xl opacity-30"></i>}
                          <p className="text-sm font-medium tracking-wide">{intro.imageStatus === 'generating' ? "Painting..." : "No Intro Image"}</p>
                        </div>
                      )}
                      
                      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 shadow-lg">
                        INTRO
                        {intro.imageUrl && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter ${intro.imageSource === 'gemini' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'}`}>
                            {intro.imageSource === 'gemini' ? 'Gemini' : 'Flux'}
                          </span>
                        )}
                      </div>

                      {intro.imageUrl && intro.audioUrl && !isPreviewingIntro && (
                        <button onClick={handlePreviewIntro} className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-all duration-300 opacity-0 group-hover:opacity-100">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                              <i className="fa-solid fa-play text-indigo-600 pl-1 text-2xl"></i>
                            </div>
                            <span className="text-white text-[10px] font-black tracking-widest uppercase drop-shadow-md">Play Intro</span>
                          </div>
                        </button>
                      )}
                      {isPreviewingIntro && <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"><div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}
                    </div>

                    <div className="p-4 flex flex-col gap-4 bg-slate-800">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-500 font-black tracking-wider px-1">Intro Visuals</label>
                        <textarea value={intro.imagePrompt} onChange={e => setIntro({...intro, imagePrompt: e.target.value})} placeholder="Visual description..." className="w-full min-h-[50px] text-[11px] text-slate-300 bg-slate-900/40 p-2.5 rounded-xl border border-slate-700/30 outline-none resize-none leading-relaxed" />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] uppercase text-slate-500 font-black tracking-wider">Video Title</label>
                          <button onClick={handleGenerateIntroTitle} className="text-[10px] text-blue-400 hover:text-blue-300 font-black transition-colors">
                            <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>
                            {intro.textStatus === 'generating' ? "Naming..." : "Get Title"}
                          </button>
                        </div>
                        <input value={intro.title} onChange={e => setIntro({...intro, title: e.target.value})} placeholder="Main Video Title..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 h-12">
                        <button onClick={handleGenerateIntroImage} disabled={intro.imageStatus === 'generating'} className={`flex items-center justify-center rounded-xl text-[9px] font-black tracking-tighter transition-all ${intro.imageUrl ? 'bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600/50' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg'} disabled:opacity-50`}>
                          <i className={`fa-solid ${intro.imageStatus === 'generating' ? 'fa-spinner animate-spin' : (intro.imageUrl ? 'fa-rotate' : 'fa-paintbrush')} mr-1.5`}></i>
                          {intro.imageStatus === 'generating' ? "Drawing..." : (intro.imageUrl ? "Redraw" : "Draw Intro")}
                        </button>
                        <button onClick={handleGenerateIntroAudio} disabled={!intro.title && !topic || intro.audioStatus === 'generating'} className={`flex flex-col items-center justify-center rounded-xl text-[9px] font-black tracking-tighter transition-all ${intro.audioUrl ? 'bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600/50' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg'} disabled:opacity-50`}>
                           <div className="flex items-center gap-1.5"><i className={`fa-solid ${intro.audioStatus === 'generating' ? 'fa-spinner animate-spin' : (intro.audioUrl ? 'fa-rotate' : 'fa-microphone')}`}></i> {intro.audioStatus === 'generating' ? "Syncing..." : (intro.audioUrl ? "Redo Voice" : "Voice Title")}</div>
                           {intro.audioUrl && <span className="text-[7px] opacity-60 uppercase">{getAudioLabel(intro.audioSource)}</span>}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SCENE CARDS */}
                  {scenes.map((scene, idx) => <SceneCard key={scene.id} scene={scene} isPreviewing={previewingSceneId === scene.id} onUpdate={(u) => updateScene(idx, u)} onGenerateScript={() => handleGenerateSceneScript(idx)} onGenerateImage={() => handleGenerateSceneImage(idx)} onGenerateAudio={() => handleGenerateSceneAudio(idx)} onPreview={() => handlePreviewScene(idx)} />)}
                  
                  {/* OUTRO CARD */}
                  <div className="flex flex-col bg-slate-800 rounded-2xl shadow-2xl border border-emerald-500/20 overflow-hidden relative transition-all duration-300">
                    <div className="relative aspect-[9/16] bg-slate-900 group">
                      {outro.imageUrl ? (
                        <img src={outro.imageUrl} alt="Outro" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-600 gap-3">
                          {outro.imageStatus === 'generating' ? <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> : <i className="fa-solid fa-door-open text-5xl opacity-30"></i>}
                          <p className="text-sm font-medium tracking-wide">{outro.imageStatus === 'generating' ? "Painting..." : "No Outro Image"}</p>
                        </div>
                      )}

                      <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-2 shadow-lg">
                        OUTRO
                        {outro.imageUrl && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter ${outro.imageSource === 'gemini' ? 'bg-blue-500/80 text-white' : 'bg-purple-500/80 text-white'}`}>
                            {outro.imageSource === 'gemini' ? 'Gemini' : 'Flux'}
                          </span>
                        )}
                      </div>

                      {outro.audioUrl && !isPreviewingOutro && (
                        <button onClick={handlePreviewOutro} className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-all duration-300 opacity-0 group-hover:opacity-100">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                              <i className="fa-solid fa-play text-indigo-600 pl-1 text-2xl"></i>
                            </div>
                            <span className="text-white text-[10px] font-black tracking-widest uppercase drop-shadow-md">Play Outro</span>
                          </div>
                        </button>
                      )}
                      {isPreviewingOutro && <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"><div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div></div>}
                    </div>

                    <div className="p-4 flex flex-col gap-4 bg-slate-800">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase text-slate-500 font-black tracking-wider px-1">Outro Visuals</label>
                        <textarea value={outro.imagePrompt} onChange={e => setOutro({...outro, imagePrompt: e.target.value})} placeholder="Visual description..." className="w-full min-h-[50px] text-[11px] text-slate-300 bg-slate-900/40 p-2.5 rounded-xl border border-slate-700/30 outline-none resize-none leading-relaxed" />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-[10px] uppercase text-slate-500 font-black tracking-wider">Closing Words</label>
                          <button onClick={handleGenerateOutroMessage} className="text-[10px] text-blue-400 hover:text-blue-300 font-black transition-colors">
                            <i className="fa-solid fa-wand-magic-sparkles mr-1.5"></i>
                            {outro.textStatus === 'generating' ? "Polishing..." : "Get Message"}
                          </button>
                        </div>
                        <textarea value={outro.message} onChange={e => setOutro({...outro, message: e.target.value})} placeholder="Closing message..." className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs min-h-[60px] resize-none focus:ring-1 focus:ring-blue-500 outline-none" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 h-12">
                        <button onClick={handleGenerateOutroImage} disabled={outro.imageStatus === 'generating'} className={`flex items-center justify-center rounded-xl text-[9px] font-black tracking-tighter transition-all ${outro.imageUrl ? 'bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600/50' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg'} disabled:opacity-50`}>
                          <i className={`fa-solid ${outro.imageStatus === 'generating' ? 'fa-spinner animate-spin' : (outro.imageUrl ? 'fa-rotate' : 'fa-paintbrush')} mr-1.5`}></i>
                          {outro.imageStatus === 'generating' ? "Drawing..." : (outro.imageUrl ? "Redraw" : "Draw Outro")}
                        </button>
                        <button onClick={handleGenerateOutroAudio} disabled={!outro.message || outro.audioStatus === 'generating'} className={`flex flex-col items-center justify-center rounded-xl text-[9px] font-black tracking-tighter transition-all ${outro.audioUrl ? 'bg-slate-700/50 text-slate-400 hover:text-white border border-slate-600/50' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg'} disabled:opacity-50`}>
                           <div className="flex items-center gap-1.5"><i className={`fa-solid ${outro.audioStatus === 'generating' ? 'fa-spinner animate-spin' : (outro.audioUrl ? 'fa-rotate' : 'fa-microphone')}`}></i> {outro.audioStatus === 'generating' ? "Syncing..." : (outro.audioUrl ? "Redo Voice" : "Voice Outro")}</div>
                           {outro.audioUrl && <span className="text-[7px] opacity-60 uppercase">{getAudioLabel(outro.audioSource)}</span>}
                        </button>
                      </div>
                    </div>
                  </div>
              </div>
            )}
            
            {!showJson && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0f172a]/95 backdrop-blur-md border-t border-slate-800 z-40">
                  <div className="max-w-6xl mx-auto flex items-center justify-between">
                      <div className="flex items-center gap-4">
                           <div className="text-xs text-slate-400"><span className="font-bold text-white">{scenes.filter(s => s.imageUrl && s.audioUrl).length} / {scenes.length}</span> Ready</div>
                           {isProducingVideo && <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden ml-2"><div className="h-full bg-blue-500 transition-all" style={{width: `${videoProgress}%`}}></div></div>}
                      </div>
                      <div className="flex items-center gap-3">
                          <button 
                            onClick={downloadAllImages} 
                            disabled={!hasSomeImages || isZipping}
                            className={`px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${hasSomeImages ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-slate-900 text-slate-700 cursor-not-allowed'}`}
                          >
                              <i className={`fa-solid ${isZipping ? 'fa-spinner animate-spin' : 'fa-file-zipper'}`}></i>
                              {isZipping ? 'ZIPPING...' : 'DOWNLOAD ASSET PACK'}
                          </button>
                          <button onClick={handleProduceVideo} disabled={!isReadyToProduce || isProducingVideo} className={`px-8 py-3 rounded-xl font-bold text-sm transition-all ${isReadyToProduce ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105 shadow-lg shadow-indigo-900/40' : 'bg-slate-800 text-slate-500'}`}>
                              {isProducingVideo ? `RENDERING ${videoProgress}%` : 'PRODUCE FULL MOVIE'}
                          </button>
                      </div>
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
                    <a href={fullMovieUrl} download="story.webm" className="px-8 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-500 flex items-center gap-2"><i className="fa-solid fa-download"></i> Download Video</a>
                    <button onClick={() => setIsPlayingMovie(false)} className="px-8 py-3 bg-slate-800 text-white rounded-full font-bold hover:bg-slate-700">Close</button>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;
