
import React, { useState, useEffect, useRef } from 'react';
import { GameState, ImageSize, ChatMessage, GameHistoryItem, SaveSlot, UsageStats } from './types';
import { generateStoryBeat, generateImage, getChatResponse, calculateEstimatedCost } from './geminiService';

const STORAGE_KEY = 'CHRONICLE_WEAVER_SAVES_V2';
const DEFAULT_BUDGET_THRESHOLD = 5.00;

const initialUsageStats: UsageStats = {
  inputTokens: 0,
  outputTokens: 0,
  imageCount: 0,
  premiumImageCount: 0,
  estimatedCost: 0
};

type TextCase = 'normal' | 'uppercase' | 'lowercase';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [history, setHistory] = useState<GameHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [imageSize, setImageSize] = useState<ImageSize>(ImageSize.K1);
  const [useHighRes, setUseHighRes] = useState(false);
  const [textOnlyMode, setTextOnlyMode] = useState(false);
  const [textCase, setTextCase] = useState<TextCase>('normal');
  const [fontSize, setFontSize] = useState(20);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [customGenre, setCustomGenre] = useState('');
  const [saves, setSaves] = useState<SaveSlot[]>([]);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<UsageStats>(initialUsageStats);
  const [budgetThreshold, setBudgetThreshold] = useState(DEFAULT_BUDGET_THRESHOLD);
  const [showQuotaPanel, setShowQuotaPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load saves and preferences from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSaves(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse saves", e);
      }
    }
    const storedBudget = localStorage.getItem('BUDGET_THRESHOLD');
    if (storedBudget) setBudgetThreshold(parseFloat(storedBudget));
    
    const storedFs = localStorage.getItem('PREF_FONT_SIZE');
    if (storedFs) setFontSize(parseInt(storedFs));

    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Sync current game state to specific save slot
  useEffect(() => {
    if (gameStarted && gameState && currentSaveId) {
      setSaves(prevSaves => {
        const updated = prevSaves.map(s => {
          if (s.id === currentSaveId) {
            // Optimization: Keep latest image, strip base64 from historical ones to save localstorage quota
            const leanHistory = history.map((item, index) => ({
              ...item,
              imageUrl: index === 0 ? item.imageUrl : undefined
            }));
            return { 
              ...s, 
              gameState, 
              history: leanHistory, 
              chatMessages, 
              usageStats, 
              lastUpdated: Date.now() 
            };
          }
          return s;
        });

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          if (error instanceof DOMException && error.name === 'QuotaExceededError') {
            console.warn("Storage quota exceeded. Purging older scene images to preserve narrative state.");
            const superLeanSaves = updated.map(s => ({
              ...s, 
              history: s.history.map(h => ({ ...h, imageUrl: undefined }))
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(superLeanSaves));
          }
        }
        return updated;
      });
    }
  }, [gameState, history, chatMessages, gameStarted, currentSaveId, usageStats]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const updateUsage = (input: number, output: number, images: number = 0, premiumImages: number = 0, modelType: 'flash' | 'pro' = 'flash') => {
    setUsageStats(prev => {
      const newCost = calculateEstimatedCost(input, output, images, premiumImages, modelType);
      return {
        inputTokens: prev.inputTokens + input,
        outputTokens: prev.outputTokens + output,
        imageCount: prev.imageCount + images,
        premiumImageCount: prev.premiumImageCount + premiumImages,
        estimatedCost: prev.estimatedCost + newCost
      };
    });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleKeySelection = async () => {
    try {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setShowKeyModal(false);
    } catch (e) {
      console.error("Failed to open key selection dialog", e);
    }
  };

  const handleError = (error: any) => {
    if (error instanceof Error && error.message === 'API_KEY_ERROR') {
      setShowKeyModal(true);
    } else {
      console.error("Application Error:", error);
    }
    setLoading(false);
    setImageLoading(false);
    setChatLoading(false);
  };

  const startGame = async (genreChoice?: string) => {
    setLoading(true);
    setGameStarted(true);
    const genre = genreChoice || customGenre || "Fantasy";
    const newSaveId = crypto.randomUUID();
    const saveName = `${genre} - ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    setCurrentSaveId(newSaveId);
    setUsageStats(initialUsageStats);

    let systemDirectives = "";
    if (genre === '80s Sci-Fi Horror') {
      systemDirectives = "Visual style MUST be '8-bit pixel art, Atari 2600 aesthetic, grainy CRT monitor effect, retro 1980s VHS quality'. Narrative: 1980s mystery, analog tech, synthesizer atmosphere.";
    }

    const prompt = `Start a new choose-your-own-adventure in the "${genre}" genre. ${systemDirectives} Return output as JSON matching the GameState schema.`;
    
    try {
      const response = await generateStoryBeat(prompt);
      setGameState(response.data);
      updateUsage(response.usage.inputTokens, response.usage.outputTokens);
      
      const newSlot: SaveSlot = {
        id: newSaveId,
        name: saveName,
        genre: response.data.genre,
        lastUpdated: Date.now(),
        gameState: response.data,
        history: [],
        chatMessages: [],
        usageStats: initialUsageStats
      };
      setSaves(prev => [newSlot, ...prev]);
      
      if (!textOnlyMode) {
        await updateImage(response.data, 'The Beginning');
      } else {
        setHistory(prev => [{ text: response.data.storyText, choice: 'Arrival', state: response.data }, ...prev]);
        setLoading(false);
      }
    } catch (error) {
      handleError(error);
    }
  };

  const loadSave = (slot: SaveSlot) => {
    setGameState(slot.gameState);
    setHistory(slot.history);
    setChatMessages(slot.chatMessages);
    setUsageStats(slot.usageStats || initialUsageStats);
    setCurrentSaveId(slot.id);
    setGameStarted(true);
  };

  const deleteSave = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSaves(prev => {
      const filtered = prev.filter(s => s.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      return filtered;
    });
    if (currentSaveId === id) {
      setGameStarted(false);
      setGameState(null);
      setHistory([]);
      setChatMessages([]);
      setUsageStats(initialUsageStats);
      setCurrentSaveId(null);
    }
  };

  const updateImage = async (state: GameState, choiceMade: string) => {
    if (textOnlyMode) {
       setLoading(false);
       return;
    }
    setImageLoading(true);
    try {
      const response = await generateImage(state.visualPrompt, state.worldStyle, imageSize, useHighRes);
      if (response.data) {
        setHistory(prev => [{ text: state.storyText, choice: choiceMade, imageUrl: response.data, state }, ...prev]);
        updateUsage(
          response.usage.inputTokens, 
          response.usage.outputTokens, 
          useHighRes ? 0 : 1, 
          useHighRes ? 1 : 0,
          useHighRes ? 'pro' : 'flash'
        );
      }
    } catch (error: any) {
      handleError(error);
    } finally {
      setImageLoading(false);
      setLoading(false);
    }
  };

  const makeChoice = async (choice: string) => {
    if (!gameState) return;
    setLoading(true);
    const prompt = `Game State: ${JSON.stringify(gameState)}. Choice: "${choice}". Advance the plot. Maintain the genre consistency. Return new state in JSON.`;
    try {
      const response = await generateStoryBeat(prompt, gameState);
      setGameState(response.data);
      updateUsage(response.usage.inputTokens, response.usage.outputTokens);
      if (!textOnlyMode) {
        await updateImage(response.data, choice);
      } else {
        setHistory(prev => [{ text: response.data.storyText, choice: choice, state: response.data }, ...prev]);
        setLoading(false);
      }
    } catch (error) {
      handleError(error);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !gameState || chatLoading) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);
    try {
      const response = await getChatResponse(userMsg, gameState);
      setChatMessages(prev => [...prev, { role: 'model', text: response.data }]);
      updateUsage(response.usage.inputTokens, response.usage.outputTokens, 0, 0, 'pro');
    } catch (error) {
      handleError(error);
    } finally {
      setChatLoading(false);
    }
  };

  const applyTextCase = (text: string) => {
    if (textCase === 'uppercase') return text.toUpperCase();
    if (textCase === 'lowercase') return text.toLowerCase();
    return text;
  };

  const getGenreFontClass = () => {
    if (!gameState) return 'font-inter';
    const genre = gameState.genre.toLowerCase();
    if (genre.includes('fantasy')) return 'font-fantasy';
    if (genre.includes('80s') || genre.includes('horror')) return 'font-80s text-xs';
    if (genre.includes('cyberpunk') || genre.includes('steampunk')) return 'font-data';
    return 'font-inter';
  };

  const is80sMode = gameState?.genre === '80s Sci-Fi Horror';
  const isBudgetExceeded = usageStats.estimatedCost >= budgetThreshold;
  const isBudgetWarning = usageStats.estimatedCost >= budgetThreshold * 0.8;

  if (!gameStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617] p-4 sm:p-12 overflow-y-auto selection:bg-blue-500/30">
        <div className="max-w-6xl w-full grid lg:grid-cols-6 gap-12 items-stretch">
          <div className="lg:col-span-4 bg-slate-900/60 backdrop-blur-xl rounded-[3.5rem] shadow-2xl p-10 sm:p-16 border border-slate-800/60 flex flex-col justify-center">
            <header className="mb-14 text-center lg:text-left">
              <h1 className="text-6xl sm:text-7xl font-black mb-6 tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-blue-200 via-indigo-400 to-emerald-400">
                Chronicle Weaver
              </h1>
              <p className="text-slate-400 text-xl font-medium leading-relaxed max-w-xl mx-auto lg:mx-0">
                The loom of infinite destinies. Start a new thread and witness reality unfold.
              </p>
            </header>
            <div className="space-y-8">
              <label className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 block mb-2">Initialize Thread Genre</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { id: "High Fantasy", label: "⚔️ High Fantasy", color: "hover:bg-amber-900/10 hover:border-amber-700/40" },
                  { id: "Cyberpunk", label: "🌆 Cyberpunk 2099", color: "hover:bg-cyan-900/10 hover:border-cyan-700/40" },
                  { id: "80s Sci-Fi Horror", label: "📼 VHS Horror", color: "bg-rose-900/10 border-rose-800/40 hover:bg-rose-900/30 hover:border-rose-700" },
                  { id: "Steampunk", label: "⚙️ Victorian Steam", color: "hover:bg-orange-900/10 hover:border-orange-700/40" }
                ].map(genre => (
                  <button key={genre.id} onClick={() => startGame(genre.id)} className={`group p-6 rounded-[2rem] transition-all border border-slate-800 bg-slate-900/40 text-left ${genre.color}`}>
                    <span className="block text-slate-200 text-lg font-black group-hover:translate-x-1 transition-transform">{genre.label}</span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1 block">New Campaign</span>
                  </button>
                ))}
              </div>
              <div className="relative group mt-10">
                <input type="text" placeholder="Or weave a custom world..." className="w-full bg-slate-950/50 border border-slate-800 rounded-[2rem] px-8 py-6 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600 font-bold text-lg" value={customGenre} onChange={(e) => setCustomGenre(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && startGame()} />
                <button onClick={() => startGame()} className="absolute right-4 top-4 bottom-4 bg-indigo-600 hover:bg-indigo-500 px-10 rounded-3xl font-black uppercase text-xs tracking-[0.2em] transition-all shadow-xl shadow-indigo-950/20">Warp</button>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 bg-slate-900/30 backdrop-blur-md rounded-[3.5rem] p-10 border border-slate-800/30 flex flex-col h-full min-h-[500px]">
            <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-500 mb-10 flex items-center gap-4">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              Archives
            </h2>
            <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
              {saves.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 italic">
                  <p className="text-sm font-medium">No threads saved in this timeline.</p>
                </div>
              )}
              {saves.map(save => (
                <div key={save.id} onClick={() => loadSave(save)} className="group relative bg-slate-950/60 p-6 rounded-3xl border border-slate-800/60 cursor-pointer hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all hover:scale-[1.03] shadow-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-black text-slate-100 text-sm mb-1 truncate max-w-[150px]">{save.name}</h3>
                      <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em]">{save.genre}</p>
                    </div>
                    <button onClick={(e) => deleteSave(save.id, e)} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-rose-400 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                  </div>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{new Date(save.lastUpdated).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden transition-all duration-1000 ${is80sMode ? 'bg-[#0a0505] text-[#ff4b4b] crt-effect' : 'bg-[#020617] text-slate-200'}`}>
      
      <aside className={`w-80 border-r p-7 flex flex-col gap-8 hidden md:flex transition-colors duration-500 ${is80sMode ? 'bg-[#1a0f0f]/60 border-rose-950' : 'bg-slate-900/60 border-slate-800'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full animate-pulse ${is80sMode ? 'bg-rose-600 shadow-[0_0_12px_#e11d48]' : 'bg-emerald-500 shadow-[0_0_12px_#10b981]'}`}></div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Loom Status</h2>
          </div>
          <div className="flex gap-2">
             <button onClick={toggleFullscreen} className={`p-2 rounded-xl border transition-all ${is80sMode ? 'border-rose-900 text-rose-500 hover:bg-rose-950' : 'border-slate-800 text-slate-400 hover:bg-slate-800'}`}>
                {isFullscreen ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>}
             </button>
             <button onClick={() => setGameStarted(false)} className={`text-[10px] font-black uppercase tracking-[0.3em] px-3 py-2 rounded-xl border transition-all ${is80sMode ? 'border-rose-900 text-rose-500 hover:bg-rose-950' : 'border-slate-800 text-slate-400 hover:bg-slate-800'}`}>EXIT</button>
          </div>
        </div>

        <section>
          <h3 className={`font-black mb-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] ${is80sMode ? 'text-rose-500' : 'text-emerald-400'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>OBJECTIVE</h3>
          <div className={`p-6 rounded-3xl border text-[11px] leading-relaxed italic transition-all ${is80sMode ? 'bg-rose-950/20 border-rose-900/50 text-rose-200 shadow-[inset_0_0_10px_#e11d4811]' : 'bg-slate-800/80 border-slate-700 text-slate-300 shadow-sm'}`}>{applyTextCase(gameState?.currentQuest || "Awaiting destiny's call.")}</div>
        </section>

        <section className="flex-1 overflow-hidden flex flex-col">
          <h3 className={`font-black mb-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] ${is80sMode ? 'text-rose-400' : 'text-indigo-400'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>CARRYINGS</h3>
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-3">
            {gameState?.inventory.map((item, i) => (
              <div key={i} className={`p-4 rounded-2xl border text-[11px] font-black tracking-tight flex items-center gap-4 transition-all ${is80sMode ? 'bg-rose-950/10 border-rose-900/20 text-rose-300' : 'bg-slate-800/40 border-slate-700/50 text-slate-300'}`}><div className={`w-1.5 h-1.5 rounded-full ${is80sMode ? 'bg-rose-600' : 'bg-indigo-500'}`}></div>{applyTextCase(item)}</div>
            ))}
          </div>
        </section>

        <section className="pt-8 border-t border-slate-800 space-y-6">
          <div className={`p-5 rounded-3xl border transition-all ${isBudgetExceeded ? 'bg-rose-900/30 border-rose-500 animate-pulse' : isBudgetWarning ? 'bg-amber-900/20 border-amber-500' : 'bg-slate-950/40 border-slate-800/50'}`}>
            <div className="flex justify-between items-center mb-3">
              <label className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Load</label>
              <button onClick={() => setShowQuotaPanel(!showQuotaPanel)} className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest underline decoration-2 underline-offset-4">BILLING</button>
            </div>
            <div className="flex justify-between items-end">
              <span className={`text-xl font-mono font-bold ${isBudgetExceeded ? 'text-rose-400' : isBudgetWarning ? 'text-amber-400' : 'text-slate-100'}`}>${usageStats.estimatedCost.toFixed(3)}</span>
            </div>
          </div>
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 block ml-1">Calibration</label>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/40 border border-slate-800/50">
              <span className="text-[10px] font-black uppercase tracking-widest">TEXT-ONLY</span>
              <input type="checkbox" checked={textOnlyMode} onChange={(e) => setTextOnlyMode(e.target.checked)} className="w-4 h-4 rounded-lg border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer" />
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 space-y-4">
              <div className="flex justify-between items-center">
                 <span className="text-[10px] font-black uppercase tracking-widest">CASING</span>
                 <div className="flex gap-1">
                    {[
                      { val: 'normal', lab: 'Aa' },
                      { val: 'uppercase', lab: 'AA' },
                      { val: 'lowercase', lab: 'aa' }
                    ].map(tc => (
                      <button 
                        key={tc.val} 
                        onClick={() => setTextCase(tc.val as TextCase)} 
                        className={`px-2 py-1 text-[9px] rounded-lg border font-black transition-all ${textCase === tc.val ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-800 text-slate-600 bg-slate-900/40 hover:text-slate-400'}`}
                      >
                        {tc.lab}
                      </button>
                    ))}
                 </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest">SIZE</span>
                  <span className="text-[10px] font-mono text-slate-500 font-bold">{fontSize}px</span>
                </div>
                <input 
                  type="range" 
                  min="14" 
                  max="44" 
                  step="2"
                  value={fontSize} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setFontSize(val);
                    localStorage.setItem('PREF_FONT_SIZE', val.toString());
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </div>
        </section>
      </aside>

      <main className="flex-1 flex flex-col overflow-y-auto relative bg-[#010413]">
        <div className="max-w-5xl mx-auto w-full p-8 lg:p-16 lg:px-24 space-y-20 pb-40">
          {!textOnlyMode && (
            <div className="relative group overflow-visible">
              {imageLoading ? (
                <div className={`aspect-video w-full rounded-[3rem] flex flex-col items-center justify-center border-2 border-dashed transition-all duration-700 animate-pulse ${is80sMode ? 'bg-rose-950/10 border-rose-900 shadow-[0_0_30px_#e11d4822]' : 'bg-slate-900/50 border-slate-800'}`}>
                  <div className={`w-14 h-14 border-4 rounded-full animate-spin mb-6 ${is80sMode ? 'border-rose-500 border-t-transparent' : 'border-indigo-500 border-t-transparent'}`}></div>
                  <p className={`text-xs font-black uppercase tracking-[0.4em] ${is80sMode ? 'text-rose-500 font-80s text-[9px]' : 'text-slate-500'}`}>Visualizing Destiny...</p>
                </div>
              ) : history[0]?.imageUrl ? (
                <div key={history[0]?.imageUrl} className={`relative overflow-hidden rounded-[3rem] shadow-2xl transition-all duration-[1500ms] animate-in fade-in zoom-in-105 ${is80sMode ? 'shadow-rose-950/40 ring-2 ring-rose-900' : 'shadow-black/60 ring-1 ring-slate-800/80'}`}>
                  <img src={history[0].imageUrl} className={`w-full aspect-video object-cover transition-transform duration-[6s] group-hover:scale-110 ${is80sMode ? 'pixelated brightness-75 contrast-125 saturate-150' : 'brightness-90 contrast-110'}`} alt="Current Thread Scene" />
                  <div className={`absolute inset-0 bg-gradient-to-t via-transparent pointer-events-none ${is80sMode ? 'from-rose-950/70' : 'from-slate-950/95'}`}></div>
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-16">
            <article key={gameState?.storyText} className={`max-w-none transition-all duration-[1200ms] animate-in fade-in slide-in-from-bottom-8 ${loading ? 'opacity-30 blur-md' : 'opacity-100'}`}>
              <div 
                className={`leading-[1.7] tracking-tight ${getGenreFontClass()} text-slate-100/90`}
                style={{ fontSize: `${fontSize}px` }}
              >
                {applyTextCase(gameState?.storyText || '')}
              </div>
            </article>
            {!loading && gameState?.choices && (
              <div className="grid grid-cols-1 gap-5 animate-in fade-in slide-in-from-bottom-12 duration-1000">
                {gameState.choices.map((choice, i) => (
                  <button key={i} onClick={() => makeChoice(choice)} className={`group relative p-7 text-left rounded-[2rem] border transition-all hover:translate-x-2 active:scale-[0.98] flex items-center gap-8 ${is80sMode ? 'bg-rose-950/5 border-rose-900/30 hover:bg-rose-900/20 hover:border-rose-600' : 'bg-slate-900/30 border-slate-800/60 hover:bg-slate-800/80 hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-950/10'}`}>
                    <span className={`flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black border transition-colors ${is80sMode ? 'bg-rose-950 border-rose-800 text-rose-500 group-hover:border-rose-400 font-80s text-[9px]' : 'bg-slate-950 border-slate-700 text-indigo-400 group-hover:border-indigo-500'}`}>{i + 1}</span>
                    <span className={`text-lg font-bold tracking-tight ${is80sMode ? 'font-80s text-[11px] leading-6' : ''}`}>{applyTextCase(choice)}</span>
                    <div className={`ml-auto opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300 ${is80sMode ? 'text-rose-500' : 'text-indigo-500'}`}><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg></div>
                  </button>
                ))}
              </div>
            )}
            {loading && (
              <div className={`flex flex-col items-center justify-center gap-10 py-16 ${is80sMode ? 'text-rose-600' : 'text-slate-600'}`}>
                <div className="w-full max-w-lg h-1.5 bg-slate-900/50 rounded-full overflow-hidden border border-slate-800/50 shadow-inner relative">
                   <div className={`h-full animate-[loom_3s_ease-in-out_infinite] ${is80sMode ? 'bg-rose-600 shadow-[0_0_15px_#e11d48]' : 'bg-indigo-500 shadow-[0_0_15px_#6366f1]'}`} style={{ width: '40%' }}></div>
                </div>
                <div className="text-center space-y-4">
                   <p className={`text-[10px] font-black uppercase tracking-[0.6em] animate-pulse ${is80sMode ? 'font-80s text-[9px]' : ''}`}>Weaving Destiny Threads...</p>
                   <p className="text-[9px] opacity-30 font-black uppercase tracking-widest italic">The Oracle consults the loom</p>
                </div>
                <style>{`@keyframes loom { 0% { transform: translateX(-120%); } 100% { transform: translateX(300%); } }`}</style>
              </div>
            )}
          </div>

          {history.length > 1 && (
            <div className="pt-32 border-t border-slate-800/40">
              <h4 className="text-[11px] font-black uppercase tracking-[0.5em] opacity-30 mb-20 text-center">Chapter Archive</h4>
              <div className="space-y-24">
                {history.slice(1).map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row gap-12 items-start opacity-30 hover:opacity-100 transition-all duration-1000 group/item">
                    {item.imageUrl && !textOnlyMode && (
                      <div className="w-full sm:w-64 aspect-video rounded-[2.5rem] overflow-hidden border border-slate-800/80 flex-shrink-0 shadow-2xl group-hover/item:border-indigo-500/40 transition-colors">
                        <img src={item.imageUrl} className={`w-full h-full object-cover grayscale brightness-50 contrast-125 group-hover/item:grayscale-0 group-hover/item:brightness-100 transition-all duration-1000 ${is80sMode ? 'pixelated' : ''}`} alt="Archived Scene" />
                      </div>
                    )}
                    <div className="space-y-6 flex-1">
                      <div className="flex flex-wrap items-center gap-5">
                        <p className={`text-[10px] font-black tracking-[0.3em] uppercase px-4 py-1.5 rounded-full border ${is80sMode ? 'text-rose-600 border-rose-900/60 font-80s text-[8px]' : 'text-indigo-500 border-indigo-900/40'}`}>THREAD MARKER #{history.length - idx - 1}</p>
                        <div className="h-px flex-1 bg-slate-800/40"></div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                           <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0"></div>
                           <p className="text-[11px] font-black uppercase tracking-widest text-slate-300">Decision: <span className="text-indigo-400 ml-2">{item.choice || "Automatic Transition"}</span></p>
                        </div>
                        <p className={`text-base leading-[1.8] ${is80sMode ? 'font-data text-rose-300' : 'font-noir italic text-slate-400'}`}>{applyTextCase(item.text.substring(0, 450))}...</p>
                        {item.state && item.state.inventory.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-800/30">
                             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 mr-2 self-center">Held Items:</span>
                             {item.state.inventory.map((loot, li) => (
                               <span key={li} className="text-[9px] font-black px-3 py-1 rounded-xl bg-slate-900 border border-slate-800/60 text-slate-500 group-hover/item:text-slate-400 group-hover/item:border-slate-700 transition-colors">{applyTextCase(loot)}</span>
                             ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <aside className={`w-96 border-l flex flex-col hidden lg:flex transition-colors duration-500 ${is80sMode ? 'bg-[#1a0f0f]/80 border-rose-950' : 'bg-slate-900/70 border-slate-800 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]'}`}>
        <div className="p-10 border-b border-slate-800/50">
          <h2 className={`text-[10px] font-black uppercase tracking-[0.4em] flex items-center gap-4 ${is80sMode ? 'text-rose-500 font-80s text-[9px]' : 'text-indigo-400'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
            THE LOOM ORACLE
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] p-5 rounded-[1.8rem] text-[12px] leading-[1.7] ${msg.role === 'user' ? `${is80sMode ? 'bg-rose-900 text-white shadow-[0_8px_20px_#e11d4822]' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-950/20'} rounded-br-none` : `${is80sMode ? 'bg-rose-950/40 border-rose-900/30 font-data' : 'bg-slate-800/80 border-slate-700/50 font-inter'} text-slate-200 border rounded-bl-none shadow-sm`}`}>
                {applyTextCase(msg.text)}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className={`p-5 rounded-[1.8rem] border flex gap-2 items-center ${is80sMode ? 'bg-rose-950/40 border-rose-900/30 shadow-[0_0_15px_#e11d4822]' : 'bg-slate-800/80 border-slate-700/50'}`}>
                <div className={`w-2 h-2 rounded-full animate-bounce ${is80sMode ? 'bg-rose-600' : 'bg-indigo-500'}`}></div>
                <div className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.2s] ${is80sMode ? 'bg-rose-600' : 'bg-indigo-500'}`}></div>
                <div className={`w-2 h-2 rounded-full animate-bounce [animation-delay:0.4s] ${is80sMode ? 'bg-rose-600' : 'bg-indigo-500'}`}></div>
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] ml-3 ${is80sMode ? 'text-rose-500 font-80s text-[8px]' : 'text-slate-500'}`}>CONSULTING LORE...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="p-8 border-t border-slate-800 bg-slate-950/40 backdrop-blur-xl">
          <div className="relative">
            <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }} placeholder="Direct query to the loom..." className={`w-full border rounded-[1.8rem] py-5 px-6 pr-16 text-xs focus:outline-none transition-all resize-none h-28 placeholder:text-slate-700 ${is80sMode ? 'bg-rose-950/20 border-rose-900 focus:ring-1 focus:ring-rose-500 font-mono uppercase' : 'bg-slate-950/80 border-slate-800 focus:ring-2 focus:ring-indigo-500 font-inter'}`} />
            <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatLoading} className={`absolute bottom-5 right-5 p-3 rounded-2xl transition-all ${is80sMode ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-950/30' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-950/30'} disabled:opacity-20`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7-7 7M5 5l7 7-7 7"></path></svg></button>
          </div>
        </div>
      </aside>

      {showQuotaPanel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="bg-slate-900 border border-slate-800 max-w-xl w-full p-12 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] transform animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-100 mb-10 flex items-center justify-between uppercase tracking-[0.5em]">
              LOOM METRICS
              <button onClick={() => setShowQuotaPanel(false)} className="text-slate-600 hover:text-slate-200 transition-colors"><svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </h3>
            <div className="grid grid-cols-2 gap-6 mb-12">
              <div className="bg-slate-950/60 p-7 rounded-[2.5rem] border border-slate-800/80 shadow-inner">
                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-3">Input Units</p>
                <p className="text-3xl font-mono text-indigo-500 font-black">{usageStats.inputTokens.toLocaleString()}</p>
              </div>
              <div className="bg-slate-950/60 p-7 rounded-[2.5rem] border border-slate-800/80 shadow-inner">
                <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-3">Output Units</p>
                <p className="text-3xl font-mono text-emerald-500 font-black">{usageStats.outputTokens.toLocaleString()}</p>
              </div>
            </div>
            <div className="space-y-10">
              <div>
                <label className="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em] block mb-4 ml-2">Budget Threshold ($)</label>
                <div className="flex gap-5">
                  <input type="number" step="1.00" value={budgetThreshold} onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setBudgetThreshold(v);
                    localStorage.setItem('BUDGET_THRESHOLD', v.toString());
                  }} className="flex-1 bg-slate-950 border border-slate-800 rounded-[1.8rem] px-8 py-5 text-base font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all" />
                  <button onClick={() => setUsageStats(initialUsageStats)} className="px-10 py-5 bg-slate-800/60 hover:bg-rose-900/30 hover:border-rose-800 rounded-[1.8rem] text-[10px] font-black transition-all uppercase tracking-[0.3em] border border-slate-700">RESET</button>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 italic leading-relaxed text-center px-4">Estimates provided are based on standard LLM pricing tiers for the current loom configuration.</p>
            </div>
          </div>
        </div>
      )}

      {showKeyModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-slate-950/95 backdrop-blur-2xl animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 max-w-lg w-full p-16 rounded-[4rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] text-center transform animate-in zoom-in-95">
            <div className="w-20 h-20 bg-indigo-600/20 rounded-[2rem] flex items-center justify-center mx-auto mb-10 border border-indigo-500/30">
               <svg className="w-10 h-10 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
            </div>
            <h3 className="text-3xl font-black text-slate-100 mb-6 tracking-tight uppercase tracking-widest">Access Protocol</h3>
            <p className="text-slate-400 mb-12 text-base leading-relaxed">High-fidelity threads require an active Gemini API key to proceed through the loom of fate.</p>
            <button onClick={handleKeySelection} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-[0.4em] text-xs rounded-3xl transition-all shadow-2xl shadow-indigo-950/40">AUTHENTICATE</button>
          </div>
        </div>
      )}

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .animate-in { animation-duration: 0.8s; animation-fill-mode: both; }
        .fade-in { animation-name: fadeIn; }
        .zoom-in-95 { animation-name: zoomIn95; }
        .zoom-in-105 { animation-name: zoomIn105; }
        .slide-in-from-bottom-8 { animation-name: slideInFromBottom8; }
        .slide-in-from-bottom-12 { animation-name: slideInFromBottom12; }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn95 { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes zoomIn105 { from { opacity: 0; transform: scale(1.05); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideInFromBottom8 { from { opacity: 0; transform: translateY(2rem); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInFromBottom12 { from { opacity: 0; transform: translateY(3rem); } to { opacity: 1; transform: translateY(0); } }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
};

export default App;
