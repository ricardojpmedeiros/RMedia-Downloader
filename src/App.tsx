import React, { useState, useEffect, useRef } from "react";
import { 
  Download, 
  Youtube, 
  Loader2, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink, 
  Info, 
  Settings, 
  Key, 
  HelpCircle, 
  X, 
  Search, 
  List, 
  Trash2, 
  Plus, 
  Eye, 
  Clock, 
  Tv, 
  ArrowRight,
  Sparkles,
  ChevronRight,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface VideoFormat {
  quality: string;
  container: string;
  hasAudio: boolean;
  hasVideo: boolean;
  itag: number | string;
  filesize: string;
}

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  formats: VideoFormat[];
}

interface SearchVideo {
  id: string;
  url: string;
  title: string;
  description: string;
  duration: string;
  seconds: number;
  views: number;
  uploadedAt: string;
  author: {
    name: string;
    url: string;
  };
  thumbnail: string;
}

interface QueueItem {
  queueId: string;
  title: string;
  thumbnail: string;
  url: string;
  itag: number | string;
  quality: string;
  container: string;
  filesize: string;
  status: "ready" | "downloading" | "done";
  addedAt: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"url" | "search" | "queue">("search");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [selectedItag, setSelectedItag] = useState<number | string | null>(null);
  const [downloadFormatType, setDownloadFormatType] = useState<"video" | "audio">("video");
  
  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchVideo[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SearchVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Download Queue state
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const saved = localStorage.getItem("yt-queue");
    return saved ? JSON.parse(saved) : [];
  });

  // Cookies settings state
  const [cookies, setCookies] = useState<string>(() => localStorage.getItem("yt-cookies") || "");
  const [cookieCount, setCookieCount] = useState<number>(0);
  const [showSettings, setShowSettings] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  useEffect(() => {
    localStorage.setItem("yt-queue", JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    if (!cookies) {
      setCookieCount(0);
      return;
    }
    try {
      const parsed = JSON.parse(cookies);
      if (Array.isArray(parsed)) {
        setCookieCount(parsed.length);
      } else {
        setCookieCount(cookies.split(";").filter(c => c.trim()).length);
      }
    } catch {
      setCookieCount(cookies.split(";").filter(c => c.trim()).length);
    }
  }, [cookies]);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveCookies = (val: string) => {
    setCookies(val);
    localStorage.setItem("yt-cookies", val);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    setSearchError(null);
    setSelectedVideo(null);
    setIsPlaying(false);
    setVideoInfo(null);
    
    // Auto-detect if input is a YouTube URL
    if (searchQuery.includes("youtube.com/") || searchQuery.includes("youtu.be/")) {
      setUrl(searchQuery);
      setActiveTab("url");
      setSearchQuery("");
      setSearching(false);
      // Wait a tick and parse
      setTimeout(() => {
        fetchInfo(searchQuery);
      }, 100);
      return;
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (response.ok) {
        setSearchResults(data.videos || []);
        if (data.videos?.length === 0) {
          setSearchError("Nenhum vídeo encontrado para essa busca.");
        }
      } else {
        setSearchError(data.error || "Erro ao realizar busca no YouTube.");
      }
    } catch (err) {
      console.error(err);
      setSearchError("Erro de conexão ao pesquisar no YouTube.");
    } finally {
      setSearching(false);
    }
  };

  const fetchInfo = async (overrideUrl?: string) => {
    const urlToFetch = overrideUrl || url;
    if (!urlToFetch) return;

    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setSelectedItag(null);

    try {
      const response = await fetch("/api/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: urlToFetch, cookies })
      });
      const data = await response.json();
      if (response.ok) {
        setVideoInfo(data);
        // Auto-select highest quality format based on downloadFormatType
        const bestFormat = data.formats
          .filter((f: any) => downloadFormatType === "video" ? f.hasVideo : !f.hasVideo)
          .sort((a: any, b: any) => {
            if (downloadFormatType === "audio") {
              if (a.itag === "mp3-320") return -1;
              if (b.itag === "mp3-320") return 1;
              return 0;
            }
            return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
          })[0];
        if (bestFormat) {
          setSelectedItag(bestFormat.itag);
        }
      } else {
        setError(data.error || "Erro ao carregar informações do vídeo.");
      }
    } catch (err) {
      console.error("Fetch info error:", err);
      setError("Erro de rede ao conectar com o servidor. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVideo = async (video: SearchVideo) => {
    setSelectedVideo(video);
    setIsPlaying(true);
    setUrl(video.url);
    
    // Auto load download formats
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setSelectedItag(null);

    try {
      const response = await fetch("/api/info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url: video.url, cookies })
      });
      const data = await response.json();
      if (response.ok) {
        setVideoInfo(data);
        const bestFormat = data.formats
          .filter((f: any) => downloadFormatType === "video" ? f.hasVideo : !f.hasVideo)
          .sort((a: any, b: any) => {
            if (downloadFormatType === "audio") {
              if (a.itag === "mp3-320") return -1;
              if (b.itag === "mp3-320") return 1;
              return 0;
            }
            return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
          })[0];
        if (bestFormat) {
          setSelectedItag(bestFormat.itag);
        }
      } else {
        setError(data.error || "O YouTube está exigindo autenticação para obter este vídeo. Configure os cookies nas configurações no topo direito.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao obter opções de download do vídeo.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!url || !selectedItag) return;
    setDownloading(true);
    
    // Create download URL
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&itag=${selectedItag}&cookies=${encodeURIComponent(cookies)}`;
    
    // Instant Browser Download
    window.location.href = downloadUrl;
    
    showToast("Download iniciado no navegador!", "success");
    
    setTimeout(() => {
      setDownloading(false);
    }, 3000);
  };

  const handleAddToQueue = () => {
    if (!url || !selectedItag || !videoInfo) return;
    
    const selectedFormat = videoInfo.formats.find(f => f.itag === selectedItag);
    if (!selectedFormat) return;

    // Check if already in queue with same quality
    const exists = queue.some(item => item.url === url && item.itag === selectedItag);
    if (exists) {
      showToast("Este vídeo com esta qualidade já está na fila!", "info");
      return;
    }

    const newItem: QueueItem = {
      queueId: Date.now().toString(),
      title: videoInfo.title,
      thumbnail: videoInfo.thumbnail,
      url,
      itag: selectedItag,
      quality: selectedFormat.quality,
      container: selectedFormat.container,
      filesize: selectedFormat.filesize,
      status: "ready",
      addedAt: new Date().toISOString()
    };

    setQueue(prev => [newItem, ...prev]);
    showToast("Vídeo adicionado à fila de downloads!", "success");
  };

  const handleDownloadQueueItem = (item: QueueItem) => {
    const downloadUrl = `/api/download?url=${encodeURIComponent(item.url)}&itag=${item.itag}&cookies=${encodeURIComponent(cookies)}`;
    window.location.href = downloadUrl;
    
    // Update queue item status to done
    setQueue(prev => prev.map(q => q.queueId === item.queueId ? { ...q, status: "done" } : q));
    showToast(`Baixando: ${item.title.substring(0, 30)}...`, "success");
  };

  const handleRemoveFromQueue = (queueId: string) => {
    setQueue(prev => prev.filter(item => item.queueId !== queueId));
    showToast("Item removido da fila.", "info");
  };

  const formatDuration = (seconds: string | number) => {
    const s = parseInt(seconds.toString());
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${m}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes: string | undefined) => {
    if (!bytes) return "N/A";
    const b = parseInt(bytes);
    const mb = b / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatViews = (viewsNum: number) => {
    if (!viewsNum) return "0";
    if (viewsNum >= 1000000) {
      return `${(viewsNum / 1000000).toFixed(1)}M visualizações`;
    }
    if (viewsNum >= 1000) {
      return `${(viewsNum / 1000).toFixed(0)}mil visualizações`;
    }
    return `${viewsNum} visualizações`;
  };

  return (
    <div className="min-h-screen bg-[#090909] text-white font-sans selection:bg-red-500/30">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
          >
            <div className={`px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-md border ${
              toast.type === "success" 
                ? "bg-green-500/10 border-green-500/30 text-green-400" 
                : toast.type === "error" 
                ? "bg-red-500/10 border-red-500/30 text-red-400" 
                : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            }`}>
              {toast.type === "success" && <CheckCircle size={18} />}
              {toast.type === "error" && <AlertCircle size={18} />}
              {toast.type === "info" && <Info size={18} />}
              <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/10">
              <Youtube className="text-white fill-current" size={20} />
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">RMedia <span className="text-red-500">Download</span> <span className="text-gray-400 font-normal text-xs sm:text-sm ml-1">by Ricardo Medeiros</span></h1>
          </div>

          {/* Center Tabs Navigation */}
          <nav className="flex items-center bg-white/5 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab("search")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "search" 
                  ? "bg-red-600 text-white shadow-md shadow-red-600/10" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Search size={13} />
              <span className="hidden sm:inline">Pesquisa</span>
            </button>
            <button
              onClick={() => setActiveTab("url")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "url" 
                  ? "bg-red-600 text-white shadow-md shadow-red-600/10" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline">Link Direto</span>
            </button>
            <button
              onClick={() => setActiveTab("queue")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                activeTab === "queue" 
                  ? "bg-red-600 text-white shadow-md shadow-red-600/10" 
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <List size={13} />
              <span className="hidden sm:inline">Fila</span>
              {queue.length > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-red-500 text-white font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-[#090909]">
                  {queue.length}
                </span>
              )}
            </button>
          </nav>

          {/* Right Area */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-xs font-semibold text-gray-300"
            >
              <Settings size={14} />
              <span className="hidden md:inline">Cookies</span>
              {cookieCount > 0 && (
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
        
        {/* ================= ABA DE PESQUISA ================= */}
        {activeTab === "search" && (
          <div>
            {/* Search Input Hero */}
            <div className="text-center mb-10">
              <motion.h2 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl sm:text-4xl font-extrabold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tight"
              >
                Pesquise e Assista sem Anúncios
              </motion.h2>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Digite um termo de busca para encontrar vídeos, assista no player integrado e baixe instantaneamente em qualquer formato.
              </p>
            </div>

            {/* Search Bar Form */}
            <form onSubmit={handleSearch} className="relative group max-w-2xl mx-auto mb-10">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl blur opacity-15 group-focus-within:opacity-35 transition duration-1000"></div>
              <div className="relative flex p-1.5 bg-[#121212] rounded-2xl border border-white/10">
                <div className="flex-1 flex items-center px-3.5 gap-2.5">
                  <Search className="text-gray-500 shrink-0" size={18} />
                  <input 
                    type="text" 
                    placeholder="Pesquise no YouTube ou cole um link..." 
                    className="w-full bg-transparent border-none text-white placeholder:text-gray-600 py-2.5 text-sm focus:outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="bg-white text-black font-bold px-6 py-2.5 rounded-xl text-xs hover:bg-gray-200 transition-all disabled:opacity-40 flex items-center gap-1.5"
                >
                  {searching ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                  <span>Pesquisar</span>
                </button>
              </div>
            </form>

            {/* Main Search Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Player & Formats (Only visible when a video is selected) */}
              <div className={`${selectedVideo ? "lg:col-span-7" : "hidden"} space-y-6`}>
                
                {/* Embedded Video Player Container */}
                {selectedVideo && (
                  <div className="bg-[#121212] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="aspect-video relative w-full bg-black">
                      {isPlaying ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${selectedVideo.id}?autoplay=1`}
                          title={selectedVideo.title}
                          className="w-full h-full border-none"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center relative">
                          <img 
                            src={selectedVideo.thumbnail} 
                            alt={selectedVideo.title} 
                            className="absolute inset-0 w-full h-full object-cover opacity-60"
                            referrerPolicy="no-referrer"
                          />
                          <button 
                            onClick={() => setIsPlaying(true)}
                            className="relative w-16 h-16 bg-red-600 hover:bg-red-700 hover:scale-105 transition-all text-white rounded-full flex items-center justify-center shadow-2xl shadow-red-600/30 z-10"
                          >
                            <Play className="fill-current ml-1" size={26} />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Selected Video Details */}
                    <div className="p-5 border-t border-white/5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-base sm:text-lg text-white leading-snug line-clamp-2">
                            {selectedVideo.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-2">
                            <span className="font-semibold text-gray-200">{selectedVideo.author.name}</span>
                            <span>•</span>
                            <span>{formatViews(selectedVideo.views)}</span>
                            <span>•</span>
                            <span>{selectedVideo.uploadedAt}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Formats Selection Side-Panel */}
                {selectedVideo && (
                  <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 shadow-xl">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3.5 mb-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Tv size={14} className="text-red-500" />
                        Opções de Download
                      </h4>
                      {loading && (
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />
                          Obtendo formatos...
                        </span>
                      )}
                    </div>

                    {/* Loader/Error/Content for formats */}
                    {loading ? (
                      <div className="py-12 flex flex-col items-center justify-center text-gray-500 gap-3">
                        <Loader2 className="animate-spin text-red-500" size={24} />
                        <span className="text-xs">Analisando streams do YouTube...</span>
                      </div>
                    ) : error ? (
                      <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4 text-xs text-red-400 space-y-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <p className="font-medium leading-relaxed">{error}</p>
                        </div>
                        {error.includes("cookies") && (
                          <button
                            onClick={() => setShowSettings(true)}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] transition-all flex items-center gap-1"
                          >
                            <Key size={10} />
                            Configurar Cookies Agora
                          </button>
                        )}
                      </div>
                    ) : videoInfo ? (
                      <div className="space-y-5">
                        {/* Selector para tipo de download (Vídeo vs Áudio) */}
                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                          <button
                            type="button"
                            onClick={() => {
                              setDownloadFormatType("video");
                              const bestVideo = videoInfo.formats
                                .filter(f => f.hasVideo)
                                .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))[0];
                              if (bestVideo) setSelectedItag(bestVideo.itag);
                            }}
                            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all ${
                              downloadFormatType === "video"
                                ? "bg-red-600 text-white shadow-md shadow-red-600/10"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            Vídeo (MP4)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDownloadFormatType("audio");
                              const bestAudio = videoInfo.formats
                                .filter(f => !f.hasVideo)
                                .sort((a, b) => {
                                  if (a.itag === "mp3-320") return -1;
                                  if (b.itag === "mp3-320") return 1;
                                  return 0;
                                })[0];
                              if (bestAudio) setSelectedItag(bestAudio.itag);
                            }}
                            className={`flex-1 py-2 text-center text-xs font-semibold rounded-lg transition-all ${
                              downloadFormatType === "audio"
                                ? "bg-red-600 text-white shadow-md shadow-red-600/10"
                                : "text-gray-400 hover:text-white"
                            }`}
                          >
                            Áudio (MP3)
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {videoInfo.formats
                            .filter(f => downloadFormatType === "video" ? f.hasVideo : !f.hasVideo)
                            .sort((a, b) => {
                              if (downloadFormatType === "audio") {
                                if (a.itag === "mp3-320") return -1;
                                if (b.itag === "mp3-320") return 1;
                                return 0;
                              }
                              return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
                            })
                            .slice(0, 6)
                            .map((format) => (
                              <button
                                key={format.itag}
                                onClick={() => setSelectedItag(format.itag)}
                                className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                                  selectedItag === format.itag 
                                    ? "bg-red-500/10 border-red-500 text-red-400" 
                                    : "bg-white/5 border-white/5 hover:border-white/10 text-gray-400"
                                }`}
                              >
                                <div className="flex items-center justify-between w-full mb-1">
                                  <span className="font-bold text-xs sm:text-sm text-white">{format.quality}</span>
                                  {selectedItag === format.itag && <CheckCircle size={12} className="text-red-500" />}
                                </div>
                                <div className="flex items-center gap-1.5 text-[9px] opacity-60">
                                  <span className="uppercase">{format.container}</span>
                                  <span>•</span>
                                  <span>{formatSize(format.filesize)}</span>
                                  {!format.hasAudio && format.hasVideo && (
                                    <span className="text-orange-500 font-bold">SEM ÁUDIO</span>
                                  )}
                                </div>
                              </button>
                            ))}
                        </div>

                        {/* Control Buttons */}
                        <div className="flex gap-2.5 pt-2">
                          <button
                            onClick={handleDownload}
                            disabled={downloading || !selectedItag}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                          >
                            {downloading ? (
                              <Loader2 className="animate-spin" size={14} />
                            ) : (
                              <Download size={14} />
                            )}
                            <span>Instantâneo</span>
                          </button>
                          
                          <button
                            onClick={handleAddToQueue}
                            disabled={loading || !selectedItag}
                            className="flex-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold text-xs py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5"
                          >
                            <Plus size={14} className="text-red-500" />
                            <span>Adicionar à Fila</span>
                          </button>
                        </div>

                        <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                          Qualidades acima de 720p podem exigir junção de streams de áudio/vídeo.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-gray-500">
                        Nenhum formato selecionado.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column (or full width if no video is selected): Search Results */}
              <div className={`${selectedVideo ? "lg:col-span-5" : "lg:col-span-12"} space-y-4`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                    {searchResults.length > 0 ? "Resultados da Pesquisa" : "Vídeos Populares"}
                  </h3>
                  {searchResults.length > 0 && (
                    <span className="text-xs text-gray-500">{searchResults.length} vídeos</span>
                  )}
                </div>

                {/* Search Loader */}
                {searching && (
                  <div className="py-24 flex flex-col items-center justify-center text-gray-500 gap-3">
                    <Loader2 className="animate-spin text-red-500" size={28} />
                    <span className="text-xs">Buscando vídeos no YouTube...</span>
                  </div>
                )}

                {/* Search Errors */}
                {searchError && !searching && (
                  <div className="bg-[#121212] border border-white/5 rounded-2xl p-8 text-center text-gray-500">
                    <AlertCircle className="mx-auto text-red-500/40 mb-3" size={32} />
                    <p className="text-sm font-medium mb-1">{searchError}</p>
                    <p className="text-xs text-gray-600">Verifique se as palavras estão corretas ou tente de novo.</p>
                  </div>
                )}

                {/* Empty State / Initial search options */}
                {searchResults.length === 0 && !searching && !searchError && (
                  <div className="bg-[#121212] border border-white/5 rounded-2xl p-12 text-center text-gray-500">
                    <Youtube className="mx-auto text-red-500/20 mb-4" size={48} />
                    <h4 className="text-white font-bold mb-1.5 text-sm">Pesquisa Inteligente do YouTube</h4>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                      Digite um título, artista, ou tema acima para encontrar vídeos. Não há necessidade de colas de links longas!
                    </p>
                  </div>
                )}

                {/* Results List */}
                {!searching && searchResults.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 max-h-[75vh] overflow-y-auto pr-1">
                    {searchResults.map((video) => (
                      <motion.div
                        key={video.id}
                        onClick={() => handleSelectVideo(video)}
                        className={`flex gap-3 p-2 rounded-xl border transition-all cursor-pointer text-left ${
                          selectedVideo?.id === video.id 
                            ? "bg-red-500/5 border-red-500/30" 
                            : "bg-[#121212]/50 border-white/5 hover:border-white/10 hover:bg-[#121212]"
                        }`}
                        whileTap={{ scale: 0.99 }}
                      >
                        {/* Thumbnail block */}
                        <div className="w-28 sm:w-36 aspect-video rounded-lg overflow-hidden shrink-0 relative bg-black">
                          <img 
                            src={video.thumbnail} 
                            alt={video.title} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[9px] font-bold">
                            {video.duration}
                          </span>
                        </div>

                        {/* Details block */}
                        <div className="flex flex-col justify-between py-0.5 min-w-0">
                          <div>
                            <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
                              {video.title}
                            </h4>
                            <p className="text-[10px] text-gray-400 font-semibold mt-1 truncate">
                              {video.author.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
                            <span>{formatViews(video.views)}</span>
                            <span>•</span>
                            <span>{video.uploadedAt}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

        {/* ================= ABA DE LINK DIRETO ================= */}
        {activeTab === "url" && (
          <div className="max-w-3xl mx-auto">
            {/* Input Direct Link */}
            <div className="text-center mb-10">
              <motion.h2 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl sm:text-4xl font-extrabold mb-3 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent tracking-tight"
              >
                Colar Link do YouTube
              </motion.h2>
              <p className="text-gray-400 text-sm max-w-lg mx-auto">
                Se você já possui o link direto do vídeo do YouTube que deseja baixar, cole-o na caixa abaixo para obter as opções de download instantaneamente.
              </p>
            </div>

            <div className="relative group mb-8">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-600 rounded-2xl blur opacity-15 group-focus-within:opacity-35 transition duration-1000"></div>
              <div className="relative flex flex-col sm:flex-row gap-3 p-2 bg-[#121212] rounded-2xl border border-white/10">
                <div className="flex-1 flex items-center px-4 gap-3">
                  <Youtube className="text-gray-500" size={20} />
                  <input 
                    type="text" 
                    placeholder="Cole o link do YouTube aqui..." 
                    className="w-full bg-transparent border-none text-white placeholder:text-gray-600 py-3 text-sm focus:outline-none"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchInfo()}
                  />
                </div>
                <button 
                  onClick={() => fetchInfo()}
                  disabled={loading || !url.trim()}
                  className="bg-white text-black font-bold px-8 py-3 rounded-xl text-xs hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : "Analisar"}
                </button>
              </div>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-8"
                >
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 flex flex-col gap-3 text-red-500">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="text-sm font-bold">{error}</p>
                        {error.includes("bot") || error.includes("login") ? (
                          <div className="mt-3 flex flex-col gap-3">
                            <p className="text-xs text-red-400/80 leading-relaxed">
                              O YouTube possui sistemas de segurança agressivos que exigem a verificação de um navegador real para evitar bots. Mas não se preocupe! Você pode usar seus cookies do navegador para se autenticar de forma 100% segura e privada.
                            </p>
                            <button
                              onClick={() => setShowSettings(true)}
                              className="self-start flex items-center gap-2 bg-red-500 text-white font-bold text-xs px-4 py-2 rounded-xl hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
                            >
                              <Settings size={14} />
                              <span>Configurar Cookies do YouTube</span>
                            </button>
                          </div>
                        ) : (
                          error.includes("429") && (
                            <p className="text-xs text-red-400/80 mt-2 leading-relaxed">
                              Dica: O YouTube bloqueia servidores de nuvem periodicamente. Você pode tentar atualizar ou configurar seus próprios Cookies nas configurações no topo direito para garantir download irrestrito.
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Video Info Card */}
            <AnimatePresence>
              {videoInfo && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-[#121212] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                >
                  <div className="flex flex-col md:flex-row">
                    {/* Thumbnail */}
                    <div className="md:w-2/5 relative group bg-black flex items-center justify-center">
                      <img 
                        src={videoInfo.thumbnail} 
                        alt={videoInfo.title} 
                        className="w-full h-full object-cover aspect-video md:aspect-auto"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-bold">
                        {formatDuration(videoInfo.duration)}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="md:w-3/5 p-6 flex flex-col justify-between">
                      <div>
                        <h3 className="text-base sm:text-lg font-bold mb-4 line-clamp-2 leading-snug">
                          {videoInfo.title}
                        </h3>
                        
                        <div className="space-y-4">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Selecione a Qualidade</label>
                          <div className="grid grid-cols-2 gap-2">
                            {videoInfo.formats
                              .filter(f => f.hasVideo)
                              .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))
                              .slice(0, 6)
                              .map((format) => (
                                <button
                                  key={format.itag}
                                  onClick={() => setSelectedItag(format.itag)}
                                  className={`flex flex-col items-start p-3 rounded-xl border transition-all ${
                                    selectedItag === format.itag 
                                      ? "bg-red-500/10 border-red-500 text-red-400" 
                                      : "bg-white/5 border-white/5 hover:border-white/15 text-gray-400"
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full mb-1">
                                    <span className="font-bold text-xs sm:text-sm text-white">{format.quality}</span>
                                    {selectedItag === format.itag && <CheckCircle size={12} className="text-red-500" />}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[9px] opacity-60">
                                    <span className="uppercase">{format.container}</span>
                                    <span>•</span>
                                    <span>{formatSize(format.filesize)}</span>
                                    {!format.hasAudio && (
                                      <span className="text-orange-500 font-bold">SEM ÁUDIO</span>
                                    )}
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 flex gap-3">
                        <button 
                          onClick={handleDownload}
                          disabled={downloading || !selectedItag}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/10 disabled:opacity-40"
                        >
                          {downloading ? (
                            <>
                              <Loader2 className="animate-spin" size={16} />
                              <span className="text-xs">Baixando...</span>
                            </>
                          ) : (
                            <>
                              <Download size={16} />
                              <span className="text-xs">Baixar Agora</span>
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={handleAddToQueue}
                          disabled={!selectedItag}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold px-4 py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus size={16} className="text-red-500" />
                          <span className="hidden sm:inline">Adicionar à Fila</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Features Grid (Only visible if no info or loader) */}
            {!videoInfo && !loading && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16">
                {[
                  { icon: <Download className="text-red-500" />, title: "Downloads Sem Limites", desc: "Baixe quantos vídeos quiser com taxa de transferência ilimitada." },
                  { icon: <CheckCircle className="text-green-500" />, title: "Bypass de Anti-Bot", desc: "Fácil integração de cookies para evitar bloqueios do YouTube." },
                  { icon: <Youtube className="text-blue-500" />, title: "Fila Inteligente", desc: "Adicione múltiplos vídeos na fila e salve quando quiser." },
                ].map((feature, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="bg-[#121212] border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-colors text-left"
                  >
                    <div className="mb-4">{feature.icon}</div>
                    <h4 className="font-bold mb-2 text-sm">{feature.title}</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= ABA DE FILA DE DOWNLOADS ================= */}
        {activeTab === "queue" && (
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-8">
              <div>
                <h2 className="text-2xl font-extrabold flex items-center gap-2">
                  <List className="text-red-500" size={22} />
                  Fila de Downloads
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">Gerencie seus arquivos preparados de forma sequencial</p>
              </div>
              {queue.length > 0 && (
                <button
                  onClick={() => {
                    setQueue([]);
                    showToast("Fila de downloads limpa.", "info");
                  }}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  Limpar Fila
                </button>
              )}
            </div>

            {/* Empty State */}
            {queue.length === 0 ? (
              <div className="bg-[#121212] border border-white/5 rounded-3xl p-16 text-center text-gray-500">
                <List className="mx-auto text-gray-700 mb-4" size={56} />
                <h3 className="text-white font-bold text-sm mb-1">Fila Vazia</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed mb-6">
                  Você não adicionou nenhum vídeo à sua fila ainda. Navegue na busca ou cole links para preencher sua fila.
                </p>
                <button
                  onClick={() => setActiveTab("search")}
                  className="bg-white hover:bg-gray-200 text-black font-bold px-6 py-2.5 rounded-xl text-xs transition-all inline-flex items-center gap-1.5"
                >
                  <Search size={14} />
                  Buscar Vídeos
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {queue.map((item) => (
                  <motion.div
                    key={item.queueId}
                    className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-left hover:border-white/10 transition-colors"
                    layout
                  >
                    <div className="flex items-center gap-4 w-full sm:w-auto min-w-0">
                      {/* Image */}
                      <div className="w-20 aspect-video rounded-lg overflow-hidden shrink-0 bg-black">
                        <img 
                          src={item.thumbnail} 
                          alt={item.title} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      
                      {/* Details */}
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs sm:text-sm text-white truncate max-w-[280px] sm:max-w-[400px]">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                          <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-bold">{item.quality}</span>
                          <span className="uppercase text-gray-500">{item.container}</span>
                          <span>•</span>
                          <span>{formatSize(item.filesize)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t border-white/5 sm:border-t-0 pt-3 sm:pt-0 shrink-0">
                      <button
                        onClick={() => handleDownloadQueueItem(item)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                          item.status === "done" 
                            ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                            : "bg-red-600 hover:bg-red-700 text-white"
                        }`}
                      >
                        {item.status === "done" ? <Check size={13} /> : <Download size={13} />}
                        <span>{item.status === "done" ? "Baixado de Novo" : "Salvar no PC"}</span>
                      </button>

                      <button
                        onClick={() => handleRemoveFromQueue(item.queueId)}
                        className="bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/10 p-2 rounded-xl transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#121212] border border-white/10 w-full max-w-2xl rounded-3xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto relative shadow-2xl"
            >
              <button
                onClick={() => setShowSettings(false)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center text-red-500">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Cookies do YouTube</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Bypass de restrições e bot check de forma segura</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Cole seus Cookies (Formato JSON ou Texto)</label>
                  <textarea
                    rows={6}
                    placeholder="Ex: [{ &quot;name&quot;: &quot;HSID&quot;, &quot;value&quot;: &quot;...&quot; }, ...]"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs font-mono text-gray-300 focus:outline-none focus:border-red-500 transition-colors placeholder:text-gray-700"
                    value={cookies}
                    onChange={(e) => handleSaveCookies(e.target.value)}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-gray-500">Privado: salvo apenas localmente no seu navegador.</span>
                    {cookieCount > 0 ? (
                      <span className="text-xs font-bold text-green-500 flex items-center gap-1">
                        <CheckCircle size={12} />
                        {cookieCount} cookies ativos
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-orange-500">Nenhum cookie configurado</span>
                    )}
                  </div>
                </div>

                <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-xs text-gray-400 space-y-3">
                  <h4 className="font-bold text-white flex items-center gap-1.5">
                    <HelpCircle className="text-red-500" size={14} />
                    Como obter os cookies do seu navegador:
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                    <li>Instale a extensão de navegador <a href="https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdjeiplbhaoeige" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 font-semibold underline inline-flex items-center gap-0.5">Cookie-Editor <ExternalLink size={10} /></a>.</li>
                    <li>Acesse o site <a href="https://youtube.com" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 font-semibold underline inline-flex items-center gap-0.5">youtube.com <ExternalLink size={10} /></a> no seu computador e certifique-se de estar logado.</li>
                    <li>Clique no ícone da extensão <b>Cookie-Editor</b> no topo do navegador.</li>
                    <li>No menu inferior da extensão, clique no botão <b>Export</b> e selecione a opção <b>JSON</b>.</li>
                    <li>Cole o conteúdo copiado na caixa acima. As alterações são aplicadas e salvas automaticamente!</li>
                  </ol>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => handleSaveCookies("")}
                  className="flex-1 border border-white/10 hover:border-white/20 text-gray-400 font-bold py-3 px-6 rounded-xl text-sm transition-all text-center"
                >
                  Limpar Cookies
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-white text-black hover:bg-gray-200 font-bold py-3 px-6 rounded-xl text-sm transition-all text-center"
                >
                  Confirmar e Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-gray-500 text-xs">
            © 2026 RMedia Download by Ricardo Medeiros. Desenvolvido para fins educacionais e uso pessoal.
          </p>
          <div className="flex justify-center gap-6 mt-4">
            <a href="#" className="text-gray-600 hover:text-white transition-colors text-xs">Termos de Uso</a>
            <a href="#" className="text-gray-600 hover:text-white transition-colors text-xs">Privacidade</a>
            <a href="#" className="text-gray-600 hover:text-white transition-colors text-xs">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
