import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import ytSearch from "yt-search";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Check if ffmpeg is available
  let ffmpegAvailable = false;
  exec("ffmpeg -version", (error) => {
    if (!error) {
      ffmpegAvailable = true;
      console.log("FFmpeg is available.");
    } else {
      console.log("FFmpeg is not available. Falling back to highest combined quality (usually 720p).");
    }
  });

  // Helper to parse cookies from a string (either JSON format or raw key-value pairs)
  const parseCookies = (cookiesInput: string): any[] => {
    if (!cookiesInput || !cookiesInput.trim()) return [];
    
    try {
      // If it's a JSON string
      const parsed = JSON.parse(cookiesInput);
      if (Array.isArray(parsed)) {
        return parsed.map(c => ({
          name: c.name || c.key,
          value: c.value,
          domain: c.domain || '.youtube.com',
          path: c.path || '/'
        }));
      }
    } catch (e) {
      // Not JSON, parse as raw Cookie header
    }
    
    // Parse as raw Cookie string
    const cookies: any[] = [];
    const pairs = cookiesInput.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx === -1) continue;
      const key = pair.substring(0, idx).trim();
      const value = pair.substring(idx + 1).trim();
      if (key && value) {
        cookies.push({
          name: key,
          value: value,
          domain: '.youtube.com',
          path: '/'
        });
      }
    }
    return cookies;
  };

  const getAgentWithCookies = (cookiesInput?: string) => {
    if (!cookiesInput) {
      return ytdl.createAgent();
    }
    
    try {
      const cookiesArray = parseCookies(cookiesInput);
      if (cookiesArray.length > 0) {
        console.log(`Using agent with ${cookiesArray.length} parsed cookies.`);
        return ytdl.createAgent(cookiesArray);
      }
    } catch (err) {
      console.error("Error creating agent with cookies:", err);
    }
    return ytdl.createAgent();
  };

  // Helper for retries with exponential backoff and UA rotation
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  ];

  const fetchWithRetry = async (videoURL: string, options: any, agentToUse?: any, retries = 3): Promise<any> => {
    for (let i = 0; i < retries; i++) {
      try {
        const agent = agentToUse || ytdl.createAgent();
        const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        return await ytdl.getInfo(videoURL, { 
          ...options, 
          agent,
          requestOptions: {
            headers: {
              "User-Agent": randomUA,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
              "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
              "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
              "Sec-Ch-Ua-Mobile": "?0",
              "Sec-Ch-Ua-Platform": '"Windows"',
              "Sec-Fetch-Dest": "document",
              "Sec-Fetch-Mode": "navigate",
              "Sec-Fetch-Site": "none",
              "Sec-Fetch-User": "?1",
              "Upgrade-Insecure-Requests": "1"
            }
          }
        });
      } catch (error: any) {
        const isBotBlock = error.message?.includes("bot") || error.message?.includes("login") || error.message?.includes("Faça login") || error.message?.includes("Sign in");
        const isRateLimit = error.status === 429 || error.message?.includes("429") || isBotBlock;
        if (isRateLimit && i < retries - 1) {
          const delay = Math.pow(2, i) * 1000 + (Math.random() * 1000);
          console.warn(`[Blocked/RateLimit] Tentativa ${i + 1} falhou. Retentando em ${Math.round(delay/1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  };

  // Global variable to cache cookies on the server
  let globalCookiesInput = "";

  const getYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getDownloadUrlFromCobalt = async (videoURL: string, itag: string): Promise<string> => {
    const isAudioOnly = ["140", "mp3-128", "mp3-320", "audio", "mp3"].includes(itag) || (typeof itag === "string" && itag.includes("mp3"));
    
    let videoQuality = "720";
    if (itag === "137" || itag === "1080") videoQuality = "1080";
    else if (itag === "22" || itag === "720") videoQuality = "720";
    else if (itag === "18" || itag === "360") videoQuality = "360";
    else if (itag === "135" || itag === "480") videoQuality = "480";
    else if (itag === "2160" || itag === "4k") videoQuality = "2160";
    else if (itag === "1440" || itag === "2k") videoQuality = "1440";

    const requestBody: any = {
      url: videoURL,
      filenamePattern: "pretty",
    };

    if (isAudioOnly) {
      requestBody.isAudioOnly = true;
      requestBody.downloadMode = "audio";
      requestBody.audioFormat = "mp3";
      requestBody.audioBitrate = itag === "mp3-320" ? "320" : "128";
    } else {
      requestBody.downloadMode = "video";
      requestBody.videoQuality = videoQuality;
    }

    // List of public Cobalt APIs to try in order of preference
    const cobaltInstances = [
      "https://api.cobalt.tools/",
      "https://cobalt.api.rybki.ovh/",
      "https://co.wukko.me/"
    ];

    let lastError: any = null;
    for (const apiBase of cobaltInstances) {
      try {
        console.log(`[Cobalt] Tentando obter link de download em ${apiBase}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 seconds timeout

        const response = await fetch(apiBase, {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const data: any = await response.json();
        if (data.status === "error") {
          throw new Error(data.text || (data.error && data.error.code) || "Erro desconhecido");
        }

        if (data.url) {
          console.log(`[Cobalt] Sucesso no servidor ${apiBase}! URL retornada.`);
          return data.url;
        }
        
        throw new Error("Resposta válida sem URL de download.");
      } catch (err: any) {
        console.warn(`[Cobalt] Falha no servidor ${apiBase}:`, err.message || err);
        lastError = err;
      }
    }

    throw lastError || new Error("Nenhum servidor Cobalt respondeu com sucesso.");
  };

  // API Routes
  app.all("/api/info", async (req, res) => {
    let videoURL = "";
    let cookiesInput = "";

    if (req.method === "POST") {
      videoURL = req.body.url;
      cookiesInput = req.body.cookies;
    } else {
      videoURL = req.query.url as string;
      cookiesInput = (req.headers["x-youtube-cookies"] as string) || (req.query.cookies as string);
    }

    if (cookiesInput) {
      globalCookiesInput = cookiesInput;
    } else {
      cookiesInput = globalCookiesInput;
    }

    if (!videoURL || !ytdl.validateURL(videoURL)) {
      return res.status(400).json({ error: "URL do YouTube inválida" });
    }

    try {
      const agent = getAgentWithCookies(cookiesInput);
      const info = await fetchWithRetry(videoURL, {}, agent);
      
      const formats = info.formats
        .filter((f: any) => f.hasVideo)
        .map((f: any) => ({
          quality: f.qualityLabel || f.quality || "720p",
          container: f.container || "mp4",
          hasAudio: f.hasAudio,
          hasVideo: f.hasVideo,
          itag: f.itag,
          filesize: f.contentLength,
        }));

      // Append standard high quality MP3 presets
      formats.push({
        quality: "Áudio MP3 (Super Premium 320kbps)",
        container: "mp3",
        hasAudio: true,
        hasVideo: false,
        itag: "mp3-320",
        filesize: undefined
      });
      formats.push({
        quality: "Áudio MP3 (Padrão 128kbps)",
        container: "mp3",
        hasAudio: true,
        hasVideo: false,
        itag: "mp3-128",
        filesize: undefined
      });

      res.json({
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
        duration: info.videoDetails.lengthSeconds,
        formats,
      });
    } catch (error: any) {
      console.warn("ytdl failed to get video info. Trying yt-search fallback...", error.message || error);
      
      try {
        let videoId: string | null = null;
        try {
          videoId = ytdl.getVideoID(videoURL);
        } catch (e) {
          videoId = getYouTubeId(videoURL);
        }

        if (!videoId) {
          throw new Error("Could not parse YouTube video ID.");
        }

        const ytResult: any = await (ytSearch as any)({ videoId });
        if (!ytResult) {
          throw new Error("yt-search video lookup returned no results.");
        }

        // Generate reliable custom formats compatible with Cobalt API
        const formats = [
          { quality: "1080p (Full HD)", container: "mp4", hasAudio: true, hasVideo: true, itag: "1080", filesize: undefined },
          { quality: "720p (HD)", container: "mp4", hasAudio: true, hasVideo: true, itag: "22", filesize: undefined },
          { quality: "480p (SD)", container: "mp4", hasAudio: true, hasVideo: true, itag: "480", filesize: undefined },
          { quality: "360p (SD)", container: "mp4", hasAudio: true, hasVideo: true, itag: "18", filesize: undefined },
          { quality: "Áudio MP3 (Super Premium 320kbps)", container: "mp3", hasAudio: true, hasVideo: false, itag: "mp3-320", filesize: undefined },
          { quality: "Áudio MP3 (Padrão 128kbps)", container: "mp3", hasAudio: true, hasVideo: false, itag: "mp3-128", filesize: undefined }
        ];

        return res.json({
          title: ytResult.title,
          thumbnail: ytResult.thumbnail || ytResult.image || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          duration: ytResult.duration?.seconds || ytResult.seconds || 0,
          formats,
          isFallback: true
        });
      } catch (fallbackError: any) {
        console.error("yt-search fallback also failed:", fallbackError);
        const isBotBlock = error.message?.includes("bot") || error.message?.includes("login") || error.message?.includes("Faça login") || error.message?.includes("Sign in");
        if (isBotBlock) {
          return res.status(403).json({ 
            error: "O YouTube bloqueou a requisição exigindo login/confirmação humana (Sign in to confirm you are not a bot). Insira seus cookies do YouTube no painel de configurações para continuar.",
            isBotBlock: true
          });
        }
        if (error.status === 429) {
          return res.status(429).json({ 
            error: "O YouTube bloqueou a requisição (Erro 429). Isso acontece porque o servidor está sendo muito solicitado. Tente novamente em instantes ou configure os cookies nas configurações." 
          });
        }
        res.status(500).json({ error: "Erro ao buscar informações do vídeo. O YouTube pode estar limitando o acesso ao servidor ou exigindo cookies." });
      }
    }
  });

  app.get("/api/download", async (req, res) => {
    const videoURL = req.query.url as string;
    const itag = req.query.itag as string;
    const cookiesInput = (req.query.cookies as string) || (req.headers["x-youtube-cookies"] as string) || globalCookiesInput;

    if (!videoURL || !ytdl.validateURL(videoURL)) {
      return res.status(400).json({ error: "URL do YouTube inválida" });
    }

    console.log(`[Download] Solicitado download de: ${videoURL}, itag: ${itag}`);

    // Try Cobalt API First (Most reliable, bypasses IP blocks and rate limits)
    try {
      const downloadUrl = await getDownloadUrlFromCobalt(videoURL, itag);
      console.log(`[Download] Sucesso Cobalt! Streamando do Cobalt: ${downloadUrl}`);
      
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`Status ${fileResponse.status} ao obter stream de download do Cobalt.`);
      }

      const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";
      const contentLength = fileResponse.headers.get("content-length");
      const contentDisposition = fileResponse.headers.get("content-disposition");

      res.setHeader("Content-Type", contentType);
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      if (contentDisposition) {
        res.setHeader("Content-Disposition", contentDisposition);
      } else {
        const isAudio = ["140", "mp3-128", "mp3-320", "audio", "mp3"].includes(itag) || (typeof itag === "string" && itag.includes("mp3"));
        res.setHeader("Content-Disposition", `attachment; filename="download.${isAudio ? "mp3" : "mp4"}"`);
      }

      if (fileResponse.body) {
        const readableStream = Readable.fromWeb(fileResponse.body as any);
        readableStream.pipe(res);
        return;
      } else {
        throw new Error("Corpo de resposta de stream do Cobalt vazio.");
      }
    } catch (cobaltError: any) {
      console.warn("[Download] Falha ao baixar via Cobalt API, tentando ytdl local como fallback...", cobaltError.message || cobaltError);
      
      // Fallback to ytdl local stream (with parsed cookies if configured)
      try {
        const agent = getAgentWithCookies(cookiesInput);
        const info = await fetchWithRetry(videoURL, {}, agent);
        const title = info.videoDetails.title.replace(/[^\w\s]/gi, "");
        
        let format;
        if (itag && !isNaN(Number(itag))) {
          format = info.formats.find((f: any) => f.itag === parseInt(itag));
        } else {
          // If we had a preset itag like 'mp3-320', map to standard filter
          const isAudio = itag && itag.includes("mp3");
          format = ytdl.chooseFormat(info.formats, { 
            quality: "highest", 
            filter: isAudio ? "audioonly" : "audioandvideo" 
          });
        }

        if (!format) {
          return res.status(404).json({ error: "Formato de fallback não encontrado" });
        }

        res.header("Content-Disposition", `attachment; filename="${title}.${format.container || 'mp4'}"`);
        ytdl(videoURL, { format, agent }).pipe(res);
      } catch (ytdlError: any) {
        console.error("[Download] Fallback ytdl também falhou:", ytdlError);
        const isBotBlock = ytdlError.message?.includes("bot") || ytdlError.message?.includes("login") || ytdlError.message?.includes("Faça login") || ytdlError.message?.includes("Sign in");
        if (isBotBlock) {
          return res.status(403).json({ error: "O YouTube bloqueou o download por suspeita de bot. Configure os cookies no painel de configurações do site." });
        }
        res.status(500).json({ error: `Falha no download: ${ytdlError.message || "Erro desconhecido"}` });
      }
    }
  });

  // Helper to scrape search results using fetch with cookies fallback
  const searchScraper = async (query: string, cookiesInput?: string) => {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    const headers: Record<string, string> = {
      "User-Agent": randomUA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1"
    };

    const cookieSource = cookiesInput || globalCookiesInput;
    if (cookieSource) {
      const cookiesArray = parseCookies(cookieSource);
      if (cookiesArray.length > 0) {
        const cookieHeader = cookiesArray.map(c => `${c.name}=${c.value}`).join("; ");
        headers["Cookie"] = cookieHeader;
      }
    }

    const response = await fetch(searchUrl, { headers });
    if (!response.ok) {
      throw new Error(`YouTube returned status ${response.status} when searching.`);
    }

    const html = await response.text();

    // Parse out ytInitialData
    let jsonStr = "";
    const startToken = "ytInitialData = ";
    const startIndex = html.indexOf(startToken);
    if (startIndex !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      let endIndex = -1;
      const startJson = startIndex + startToken.length;
      for (let i = startJson; i < html.length; i++) {
        const char = html[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === '"' || char === "'") {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") {
            depth++;
          } else if (char === "}") {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }
      if (endIndex !== -1) {
        jsonStr = html.substring(startJson, endIndex + 1);
      }
    }

    if (!jsonStr) {
      // Fallback: try simple regex match
      const match = html.match(/var ytInitialData\s*=\s*({.*?});/s) || html.match(/ytInitialData\s*=\s*({.*?});/s);
      if (match) {
        jsonStr = match[1];
      }
    }

    if (!jsonStr) {
      throw new Error("Não foi possível extrair os dados da página de resultados.");
    }

    if (jsonStr.endsWith(";")) {
      jsonStr = jsonStr.slice(0, -1);
    }

    const data = JSON.parse(jsonStr);
    const renderers: any[] = [];
    
    const findVideoRenderers = (obj: any) => {
      if (!obj || typeof obj !== "object") return;
      if (obj.videoRenderer) {
        renderers.push(obj.videoRenderer);
      }
      for (const key of Object.keys(obj)) {
        findVideoRenderers(obj[key]);
      }
    };

    findVideoRenderers(data);

    if (renderers.length === 0) {
      return [];
    }

    return renderers.map((renderer: any) => {
      const id = renderer.videoId;
      if (!id) return null;

      const url = `https://www.youtube.com/watch?v=${id}`;
      
      let title = "";
      if (renderer.title && Array.isArray(renderer.title.runs)) {
        title = renderer.title.runs.map((r: any) => r.text).join("");
      } else if (renderer.title && renderer.title.simpleText) {
        title = renderer.title.simpleText;
      }

      let authorName = "Desconhecido";
      let authorUrl = "";
      const byline = renderer.ownerText || renderer.longBylineText || renderer.shortBylineText;
      if (byline && Array.isArray(byline.runs) && byline.runs.length > 0) {
        authorName = byline.runs[0].text;
        const path = byline.runs[0].navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || byline.runs[0].navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
        if (path) {
          authorUrl = `https://www.youtube.com${path}`;
        }
      }

      const duration = renderer.lengthText?.simpleText || "";
      let seconds = 0;
      if (duration) {
        const parts = duration.split(":").map(Number);
        if (parts.length === 2) {
          seconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
          seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
      }

      let thumbnail = "";
      if (renderer.thumbnail && Array.isArray(renderer.thumbnail.thumbnails) && renderer.thumbnail.thumbnails.length > 0) {
        thumbnail = renderer.thumbnail.thumbnails[renderer.thumbnail.thumbnails.length - 1].url;
      } else {
        thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      }

      let viewsText = "";
      if (renderer.viewCountText && renderer.viewCountText.simpleText) {
        viewsText = renderer.viewCountText.simpleText;
      } else if (renderer.shortViewCountText && renderer.shortViewCountText.simpleText) {
        viewsText = renderer.shortViewCountText.simpleText;
      }
      
      let views = 0;
      if (viewsText) {
        const cleanViews = viewsText.replace(/[^\d]/g, "");
        if (cleanViews) {
          views = parseInt(cleanViews, 10);
        }
      }

      let description = "";
      if (renderer.detailedMetadataSnippets && renderer.detailedMetadataSnippets.length > 0) {
        const snippet = renderer.detailedMetadataSnippets[0];
        if (snippet.snippetText && Array.isArray(snippet.snippetText.runs)) {
          description = snippet.snippetText.runs.map((r: any) => r.text).join("");
        }
      }

      const uploadedAt = renderer.publishedTimeText?.simpleText || "";

      return {
        id,
        videoId: id,
        url,
        title,
        description,
        duration,
        timestamp: duration,
        seconds,
        views,
        uploadedAt,
        ago: uploadedAt,
        author: {
          name: authorName,
          url: authorUrl
        },
        thumbnail,
        image: thumbnail
      };
    }).filter(Boolean);
  };

  // YouTube Search API route featuring a custom scraper with yt-search fallback
  app.get("/api/search", async (req, res) => {
    const query = req.query.q as string;
    const cookiesInput = req.query.cookies as string;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Termo de busca vazio." });
    }

    try {
      console.log(`[Search] Buscando no YouTube via Scraper por: "${query}"`);
      const scrapedVideos = await searchScraper(query, cookiesInput);
      if (scrapedVideos && scrapedVideos.length > 0) {
        console.log(`[Search] Scraper retornou ${scrapedVideos.length} resultados.`);
        return res.json({ videos: scrapedVideos.slice(0, 15) });
      }
      throw new Error("Scraper retornou lista vazia de resultados.");
    } catch (scraperError: any) {
      console.warn("[Search] Scraper falhou, tentando yt-search como fallback...", scraperError.message || scraperError);
      
      try {
        console.log(`[Search] Buscando no YouTube via yt-search por: "${query}"`);
        const results = await ytSearch(query);
        const videos = (results.videos || []).slice(0, 15).map((v: any) => ({
          id: v.videoId || v.id,
          videoId: v.videoId || v.id,
          url: v.url,
          title: v.title,
          description: v.description,
          duration: v.timestamp || v.duration,
          timestamp: v.timestamp || v.duration,
          seconds: v.seconds,
          views: v.views,
          uploadedAt: v.ago || v.uploadedAt,
          ago: v.ago || v.uploadedAt,
          author: {
            name: v.author?.name || "Desconhecido",
            url: v.author?.url || ""
          },
          thumbnail: v.thumbnail || v.image,
          image: v.thumbnail || v.image
        }));
        return res.json({ videos });
      } catch (fallbackError: any) {
        console.error("[Search] Todos os métodos de busca falharam:", fallbackError);
        return res.status(500).json({ error: "Erro ao realizar busca no YouTube. Tente configurar ou atualizar os cookies nas configurações se o problema persistir." });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
