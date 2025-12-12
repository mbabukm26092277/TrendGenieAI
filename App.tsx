import React, { useState, useEffect, useRef } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { SubscriptionModal } from './components/SubscriptionModal';
import { generateStyleImage, findNearbySalons, findShoppingLinks, getMoreStyleSuggestions } from './services/geminiService';
import { MAX_FREE_GENERATIONS, HAIR_STYLES, FASHION_STYLES, APP_NAME, HAIR_COLORS, CLOTHING_COLORS } from './constants';
import { GeneratedStyle, SalonResult, ShoppingResult, AppState, GeoLocation } from './types';
import { 
  Loader2, ChevronLeft, ChevronRight, Download, MapPin, ShoppingBag, 
  Scissors, Shirt, Sparkles, RefreshCcw, Camera, ChevronDown, Palette, Check
} from 'lucide-react';

// Extracted ColorPicker to prevent re-renders and improve performance
const ColorPicker = ({ 
  colors, 
  selected, 
  onSelect, 
  label 
}: { 
  colors: { name: string; value: string }[]; 
  selected: string | null; 
  onSelect: (c: string | null) => void;
  label: string
}) => (
  <div className="mb-4">
    <div className="flex justify-between items-center mb-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
        <Palette className="w-3 h-3" />
        {label}
      </label>
      {selected && (
        <button onClick={() => onSelect(null)} className="text-[10px] text-slate-500 hover:text-white transition-colors">
          Reset
        </button>
      )}
    </div>
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c.name}
          onClick={() => onSelect(selected === c.value ? null : c.value)}
          className={`w-8 h-8 rounded-full border-2 transition-all relative group ${
            selected === c.value 
              ? 'border-white scale-110 shadow-[0_0_10px_rgba(255,255,255,0.5)]' 
              : 'border-slate-700 hover:scale-110 hover:border-slate-500'
          }`}
          style={{ backgroundColor: c.value }}
          title={c.name}
          aria-label={`Select color ${c.name}`}
        >
          {selected === c.value && (
            <Check className={`w-4 h-4 mx-auto absolute inset-0 m-auto ${
              ['#ffffff', '#f5f5f5', '#fdd835', '#d7ccc8'].includes(c.value) ? 'text-black' : 'text-white'
            }`} />
          )}
          {/* Tooltip on hover */}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black/90 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg">
            {c.name}
          </span>
        </button>
      ))}
    </div>
  </div>
);

// Skeleton loader for style items
const StyleSkeleton = () => (
  <div className="flex items-center gap-3 p-2 bg-slate-700/30 rounded-lg animate-pulse border border-slate-700/50">
    <div className="shrink-0 w-8 h-8 rounded-full bg-slate-700"></div>
    <div className="h-3 bg-slate-700 rounded w-20"></div>
  </div>
);

const App: React.FC = () => {
  // State
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedStyle[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [usageCount, setUsageCount] = useState<number>(0);
  const [showPaywall, setShowPaywall] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  // Customization State
  const [selectedHairColor, setSelectedHairColor] = useState<string | null>(null);
  const [selectedTopColor, setSelectedTopColor] = useState<string | null>(null);
  const [selectedBottomColor, setSelectedBottomColor] = useState<string | null>(null);

  // Dynamic Style Lists
  const [availableHairStyles, setAvailableHairStyles] = useState<string[]>(HAIR_STYLES);
  const [visibleHairCount, setVisibleHairCount] = useState<number>(4);
  const [isLoadingMoreHair, setIsLoadingMoreHair] = useState(false);

  const [availableFashionStyles, setAvailableFashionStyles] = useState<string[]>(FASHION_STYLES);
  const [visibleFashionCount, setVisibleFashionCount] = useState<number>(4);
  const [isLoadingMoreFashion, setIsLoadingMoreFashion] = useState(false);
  
  // Grounding Data
  const [salons, setSalons] = useState<SalonResult[]>([]);
  const [shoppingLinks, setShoppingLinks] = useState<ShoppingResult[]>([]);
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);

  // Load usage from local storage on mount
  useEffect(() => {
    const savedCount = localStorage.getItem('trendGenieUsage');
    if (savedCount) {
      setUsageCount(parseInt(savedCount, 10));
    }
    
    // Get Location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => console.log("Geolocation permission denied or error", error)
      );
    }

    // Generate random suggestions
    const newSuggestions = [];
    for (let i = 0; i < 3; i++) {
      const h = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)];
      const f = FASHION_STYLES[Math.floor(Math.random() * FASHION_STYLES.length)];
      newSuggestions.push(`${h} with ${f}`);
    }
    setSuggestions(newSuggestions);
  }, []);

  const incrementUsage = () => {
    const newCount = usageCount + 1;
    setUsageCount(newCount);
    localStorage.setItem('trendGenieUsage', newCount.toString());
    return newCount;
  };

  const handleImageSelected = (base64: string) => {
    setOriginalImage(base64);
    // Add original to history as the first item
    const initialStyle: GeneratedStyle = {
      id: 'original',
      imageUrl: base64,
      prompt: 'Original Photo',
      type: 'mix',
      timestamp: Date.now()
    };
    setHistory([initialStyle]);
    setCurrentIndex(0);
    setAppState(AppState.IDLE);
  };

  const handleLoadMoreHair = async () => {
    if (visibleHairCount < availableHairStyles.length) {
      setVisibleHairCount(prev => Math.min(prev + 4, availableHairStyles.length));
    } else {
      setIsLoadingMoreHair(true);
      try {
        const newStyles = await getMoreStyleSuggestions(availableHairStyles, 'hair');
        if (newStyles && newStyles.length > 0) {
          setAvailableHairStyles(prev => [...prev, ...newStyles]);
          setVisibleHairCount(prev => prev + newStyles.length);
        }
      } finally {
        setIsLoadingMoreHair(false);
      }
    }
  };

  const handleLoadMoreFashion = async () => {
    if (visibleFashionCount < availableFashionStyles.length) {
      setVisibleFashionCount(prev => Math.min(prev + 4, availableFashionStyles.length));
    } else {
      setIsLoadingMoreFashion(true);
      try {
        const newStyles = await getMoreStyleSuggestions(availableFashionStyles, 'fashion');
        if (newStyles && newStyles.length > 0) {
          setAvailableFashionStyles(prev => [...prev, ...newStyles]);
          setVisibleFashionCount(prev => prev + newStyles.length);
        }
      } finally {
        setIsLoadingMoreFashion(false);
      }
    }
  };

  const handleGenerate = async (type: 'hair' | 'fashion' | 'mix', promptDetails: string) => {
    if (usageCount >= MAX_FREE_GENERATIONS) {
      setShowPaywall(true);
      return;
    }

    if (!originalImage && type !== 'mix') return;

    setAppState(AppState.GENERATING);
    setSalons([]);
    setShoppingLinks([]);

    try {
      const inputImage = history[currentIndex].imageUrl.split(',')[1]; 

      // Enhance prompt with colors
      let finalPrompt = promptDetails;
      const hairColorName = HAIR_COLORS.find(c => c.value === selectedHairColor)?.name;
      const topColorName = CLOTHING_COLORS.find(c => c.value === selectedTopColor)?.name;
      const bottomColorName = CLOTHING_COLORS.find(c => c.value === selectedBottomColor)?.name;

      if (type === 'hair' && hairColorName) {
        finalPrompt += `, dyed ${hairColorName}`;
      } else if (type === 'fashion') {
        if (topColorName) finalPrompt += `, ${topColorName} top/dress`;
        if (bottomColorName) finalPrompt += `, ${bottomColorName} bottoms/pants/skirt`;
      } else if (type === 'mix') {
        if (hairColorName) finalPrompt += `, hair color ${hairColorName}`;
        if (topColorName) finalPrompt += `, ${topColorName} top`;
        if (bottomColorName) finalPrompt += `, ${bottomColorName} bottom`;
      }

      const generatedImageBase64 = await generateStyleImage(inputImage, finalPrompt);
      
      const newStyle: GeneratedStyle = {
        id: Date.now().toString(),
        imageUrl: generatedImageBase64,
        prompt: finalPrompt,
        type: type,
        timestamp: Date.now()
      };

      const newHistory = [...history.slice(0, currentIndex + 1), newStyle];
      setHistory(newHistory);
      setCurrentIndex(newHistory.length - 1);
      incrementUsage();

      if (type === 'hair' || type === 'mix') {
        if (userLocation) {
          findNearbySalons(userLocation, promptDetails).then(setSalons);
        }
      }
      if (type === 'fashion' || type === 'mix') {
        findShoppingLinks(promptDetails).then(setShoppingLinks);
      }

      setAppState(AppState.COMPLETE);
    } catch (error) {
      console.error(error);
      setAppState(AppState.ERROR);
      setTimeout(() => setAppState(AppState.IDLE), 3000);
    }
  };

  const handleSubscribe = () => {
    alert("Thank you for subscribing! Your limit has been reset.");
    setUsageCount(0);
    localStorage.setItem('trendGenieUsage', '0');
    setShowPaywall(false);
  };

  const downloadImage = () => {
    const current = history[currentIndex];
    if (!current) return;
    const link = document.createElement('a');
    link.href = current.imageUrl;
    link.download = `trendgenie-${current.type}-${current.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resetApp = () => {
    setOriginalImage(null);
    setHistory([]);
    setCurrentIndex(-1);
    setAppState(AppState.IDLE);
    setSalons([]);
    setShoppingLinks([]);
    setSelectedHairColor(null);
    setSelectedTopColor(null);
    setSelectedBottomColor(null);
  };

  const currentStyle = history[currentIndex];

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans selection:bg-brand-500 selection:text-white">
      <SubscriptionModal isOpen={showPaywall} onSubscribe={handleSubscribe} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles className="text-brand-500 w-6 h-6" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-transparent">
              {APP_NAME}
            </h1>
          </div>
          <div className="text-sm font-medium text-slate-400">
            {MAX_FREE_GENERATIONS - usageCount} generations left
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 pb-32">
        {!originalImage ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center mb-8 max-w-2xl">
              <h2 className="text-4xl font-extrabold mb-4">Discover Your Perfect Look</h2>
              <p className="text-slate-400 text-lg">
                Upload your photo to try new hairstyles, trending outfits, and find where to get them.
              </p>
            </div>
            <ImageUpload onImageSelected={handleImageSelected} />
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Left Column: Image Viewer */}
            <div className="lg:col-span-2 space-y-6">
              <div className="relative group rounded-2xl overflow-hidden bg-slate-950 shadow-2xl border border-slate-800 aspect-[3/4] max-h-[70vh] flex items-center justify-center">
                {currentStyle && (
                  <img
                    src={currentStyle.imageUrl}
                    alt="Style Result"
                    className="w-full h-full object-contain"
                  />
                )}
                
                {appState === AppState.GENERATING && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-20">
                    <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
                    <p className="text-xl font-medium animate-pulse">Creating your new look...</p>
                  </div>
                )}

                {/* Navigation Arrows */}
                {currentIndex > 0 && (
                  <button
                    onClick={() => {
                        setCurrentIndex(currentIndex - 1);
                        setSalons([]); 
                        setShoppingLinks([]);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-brand-500 rounded-full text-white transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                )}
                {currentIndex < history.length - 1 && (
                  <button
                    onClick={() => {
                        setCurrentIndex(currentIndex + 1);
                        setSalons([]); 
                        setShoppingLinks([]);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-brand-500 rounded-full text-white transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronRight className="w-8 h-8" />
                  </button>
                )}
              </div>

              {/* Action Bar */}
              <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl">
                <button onClick={resetApp} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                  <RefreshCcw className="w-4 h-4" /> Start Over
                </button>
                <div className="text-sm text-slate-400 font-mono">
                  {currentIndex + 1} / {history.length}
                </div>
                <button onClick={downloadImage} className="flex items-center gap-2 text-brand-400 hover:text-brand-300 transition-colors font-medium">
                  <Download className="w-4 h-4" /> Download
                </button>
              </div>
            </div>

            {/* Right Column: Controls & Results */}
            <div className="space-y-6">
              
              {/* Controls */}
              <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                
                {/* Hairstyle Section */}
                <div className="mb-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-brand-500" /> Hairstyle
                    </h3>
                    
                    <ColorPicker 
                        colors={HAIR_COLORS} 
                        selected={selectedHairColor} 
                        onSelect={setSelectedHairColor} 
                        label="Hair Color" 
                    />

                    <div className="grid grid-cols-2 gap-2 mb-4">
                    {availableHairStyles.slice(0, visibleHairCount).map(style => (
                        <button
                        key={style}
                        onClick={() => handleGenerate('hair', `Change hair to ${style}`)}
                        disabled={appState === AppState.GENERATING}
                        className="group flex items-center gap-3 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition-all border border-transparent hover:border-slate-600"
                        title={style}
                        >
                            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center border border-slate-600 group-hover:border-brand-500/50 transition-colors">
                                <Scissors className="w-4 h-4 text-slate-400 group-hover:text-brand-400" />
                            </div>
                            <span className="text-xs font-medium truncate leading-tight">{style}</span>
                        </button>
                    ))}
                    {isLoadingMoreHair && (
                        <>
                        <StyleSkeleton />
                        <StyleSkeleton />
                        <StyleSkeleton />
                        <StyleSkeleton />
                        </>
                    )}
                    </div>
                    <button 
                    onClick={handleLoadMoreHair}
                    disabled={isLoadingMoreHair || appState === AppState.GENERATING}
                    className="w-full text-xs py-2 text-brand-400 hover:text-brand-300 border border-slate-700 hover:border-brand-500/50 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                    {isLoadingMoreHair ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
                    {visibleHairCount < availableHairStyles.length ? "Show More Styles" : "Find New Styles"}
                    </button>
                </div>
                
                {/* Fashion Section */}
                <div className="pt-6 border-t border-slate-700">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Shirt className="w-5 h-5 text-purple-500" /> Fashion
                    </h3>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <ColorPicker 
                            colors={CLOTHING_COLORS} 
                            selected={selectedTopColor} 
                            onSelect={setSelectedTopColor} 
                            label="Top Color" 
                        />
                        <ColorPicker 
                            colors={CLOTHING_COLORS} 
                            selected={selectedBottomColor} 
                            onSelect={setSelectedBottomColor} 
                            label="Bottom Color" 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                    {availableFashionStyles.slice(0, visibleFashionCount).map(style => (
                        <button
                        key={style}
                        onClick={() => handleGenerate('fashion', `Change outfit to ${style}`)}
                        disabled={appState === AppState.GENERATING}
                        className="group flex items-center gap-3 p-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-left transition-all border border-transparent hover:border-slate-600"
                        title={style}
                        >
                            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center border border-slate-600 group-hover:border-purple-500/50 transition-colors">
                                <Shirt className="w-4 h-4 text-slate-400 group-hover:text-purple-400" />
                            </div>
                            <span className="text-xs font-medium truncate leading-tight">{style}</span>
                        </button>
                    ))}
                    {isLoadingMoreFashion && (
                        <>
                        <StyleSkeleton />
                        <StyleSkeleton />
                        <StyleSkeleton />
                        <StyleSkeleton />
                        </>
                    )}
                    </div>
                    <button 
                    onClick={handleLoadMoreFashion}
                    disabled={isLoadingMoreFashion || appState === AppState.GENERATING}
                    className="w-full text-xs py-2 text-brand-400 hover:text-brand-300 border border-slate-700 hover:border-brand-500/50 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                    {isLoadingMoreFashion ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
                    {visibleFashionCount < availableFashionStyles.length ? "Show More Styles" : "Find New Styles"}
                    </button>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-700">
                   <h3 className="text-sm font-semibold mb-2 text-slate-300">Custom Request</h3>
                   <div className="flex gap-2 mb-3">
                     <input 
                        type="text" 
                        list="style-suggestions"
                        placeholder="e.g. Red evening gown with bun"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                     />
                     <datalist id="style-suggestions">
                        {availableHairStyles.map(s => <option key={`h-${s}`} value={s} />)}
                        {availableFashionStyles.map(s => <option key={`f-${s}`} value={s} />)}
                     </datalist>
                     <button 
                        onClick={() => handleGenerate('mix', customPrompt)}
                        disabled={!customPrompt || appState === AppState.GENERATING}
                        className="bg-brand-600 hover:bg-brand-500 p-2 rounded-lg disabled:opacity-50"
                     >
                       <Sparkles className="w-5 h-5" />
                     </button>
                   </div>
                   
                   <div className="space-y-2">
                     <p className="text-xs text-slate-500 font-medium">Try a combination:</p>
                     <div className="flex flex-wrap gap-2">
                       {suggestions.map((s, i) => (
                          <button 
                            key={i}
                            onClick={() => setCustomPrompt(s)}
                            className="text-[10px] px-3 py-1.5 bg-slate-700/30 hover:bg-slate-700 rounded-full text-slate-400 hover:text-brand-300 transition-colors border border-slate-600/50 hover:border-brand-500/50"
                          >
                            {s}
                          </button>
                       ))}
                     </div>
                   </div>
                </div>
              </div>

              {/* Grounding Results */}
              {(salons.length > 0 || shoppingLinks.length > 0) && (
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {salons.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-green-400">
                        <MapPin className="w-5 h-5" /> Nearby Salons
                      </h3>
                      <ul className="space-y-2">
                        {salons.map((salon, idx) => (
                          <li key={idx}>
                            <a 
                              href={salon.uri} 
                              target="_blank" 
                              rel="noreferrer"
                              className="block p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors text-sm"
                            >
                              <div className="font-medium text-slate-200">{salon.title}</div>
                              <div className="text-xs text-brand-400 mt-1">View on Map &rarr;</div>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {shoppingLinks.length > 0 && (
                    <div>
                      <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-blue-400">
                        <ShoppingBag className="w-5 h-5" /> Shop the Look
                      </h3>
                      <ul className="space-y-2">
                        {shoppingLinks.map((item, idx) => (
                          <li key={idx}>
                            <a 
                              href={item.uri} 
                              target="_blank" 
                              rel="noreferrer"
                              className="block p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors text-sm"
                            >
                              <div className="font-medium text-slate-200">{item.title}</div>
                              <div className="text-xs text-brand-400 mt-1">Check Availability &rarr;</div>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;