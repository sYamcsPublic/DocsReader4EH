import React, { useState, useEffect, useRef } from 'react';
import { type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { getBridge, probeBridge } from './lib/simulator-helper';
import { GoogleDriveService, type GoogleUser } from './lib/google-drive';
import { PageManager } from './hud/page-manager';
import { FileListPage } from './hud/pages/file-list-page';
import { ReaderPage } from './hud/pages/reader-page';
import {
  LogIn,
  Glasses,
  CheckCircle2,
  Settings as SettingsIcon,
  ChevronRight,
  RefreshCw,
  Smartphone,
  ArrowLeft,
  ArrowRight,
  FileText,
  LayoutList,
  Copy,
  Check,
  HelpCircle
} from 'lucide-react';
import { setSimulatorBannerVisible } from './lib/simulator-helper';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { OsEventTypeList } from '@evenrealities/even_hub_sdk';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_CLIENT_ID = ""; // User needs to provide this

function App() {
  const [clientId, setClientId] = useState(localStorage.getItem('g_client_id') || DEFAULT_CLIENT_ID);
  const [clientSecret, setClientSecret] = useState(localStorage.getItem('g_client_secret') || "");
  const [folderId, setFolderId] = useState(localStorage.getItem('g_folder_id') || "");
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [bridge, setBridge] = useState<EvenAppBridge | null>(null);
  const [status, setStatus] = useState<string>("Ready");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(Number(localStorage.getItem('g_scroll_speed')) || 20);
  const [isPhoneReaderOpen, setIsPhoneReaderOpen] = useState(false);
  const [currentFiles, setCurrentFiles] = useState<any[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>((localStorage.getItem('g_color_theme') as any) || 'system');
  const [isAutoAllowed, setIsAutoAllowed] = useState(localStorage.getItem('g_auto_allowed') === 'true');
  const [isAutoEnabled, setIsAutoEnabled] = useState(localStorage.getItem('g_auto_enabled') === 'true');
  const [isCacheEnabled, setIsCacheEnabled] = useState(localStorage.getItem('g_cache_enabled') !== 'false');
  const [showHelp, setShowHelp] = useState(false);
  const [helpContent, setHelpContent] = useState("");
  const [isHelpLoading, setIsHelpLoading] = useState(false);

  // State for copy feedback
  const [isTokenCopied, setIsTokenCopied] = useState(false);
  const [isGlassesActive, setIsGlassesActive] = useState(false);
  const [launchSource, setLaunchSource] = useState<'appMenu' | 'glassesMenu' | null>(null);
  const [isConnectable, setIsConnectable] = useState(false);
  // EvenアプリまたはシミュレータからのURL（mode=evenhub）を検知して保存
  const isEvenHubMode = React.useMemo(() => {
    // まず現在のURLにmode=evenhubがあればlocalStorageに保存する
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'evenhub') {
      localStorage.setItem('g_launch_mode', 'evenhub');
      console.log('[App.tsx] mode=evenhub detected in URL, saved to localStorage.');
    }
    // localStorageの値を参照してボタン表示を決定
    const savedMode = localStorage.getItem('g_launch_mode');
    console.log('[App.tsx] g_launch_mode from localStorage: ' + savedMode);
    return savedMode === 'evenhub';
  }, []);
  const pageManagerRef = useRef<PageManager | null>(null);

  // Probe for bridge on startup
  useEffect(() => {
    const initProbe = async () => {
      const connectable = await probeBridge();
      setIsConnectable(connectable);
      if (connectable) {
        setStatus("Searching for bridge...");
        await connectToBridge(); // Populate 'bridge' state automatically
      }
    };
    initProbe();
  }, []);

  useEffect(() => {
    localStorage.setItem('g_color_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
      root.style.setProperty('--bg-color', '#050505');
    } else {
      root.classList.remove('dark');
      root.style.setProperty('--bg-color', '#fafafa');
    }
  }, [theme]);

  const driveService = React.useMemo(() => new GoogleDriveService(clientId, clientSecret), [clientId, clientSecret]);

  // Purge any existing "Export Error" from cache on startup
  useEffect(() => {
    const CACHE_KEY = 'g_content_cache';
    try {
      const cacheRaw = localStorage.getItem(CACHE_KEY);
      if (cacheRaw) {
        const cache: any[] = JSON.parse(cacheRaw);
        const filtered = cache.filter(c => !c.content.includes("Export Error"));
        if (filtered.length !== cache.length) {
          localStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
        }
      }
    } catch (e) {
      console.error("Cache purge failed", e);
    }
  }, []);

  const logoutGoogle = () => {
    localStorage.removeItem('g_refresh_token');
    // Removed g_access_token cleanup as it's no longer stored there
    setUser(null);
    setStatus("Logged out");
    // Reload to clear in-memory state
    window.location.reload();
  };

  const handleError = (err: any, msg: string) => {
    console.error(err);
    if (err.message === "AUTH_EXPIRED") {
      setStatus("Session expired");
      // Don't auto-logout immediately, let refresh try first in _fetch
    } else if (err instanceof TypeError && err.message === "Failed to fetch") {
      setStatus("Network Error");
    } else {
      setStatus(msg);
    }
  };

  // Sync scroll speed to HUD and persistence
  useEffect(() => {
    ReaderPage.autoScrollSpeed = scrollSpeed;
    localStorage.setItem('g_scroll_speed', scrollSpeed.toString());
  }, [scrollSpeed]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem('g_client_id', clientId);
    localStorage.setItem('g_client_secret', clientSecret);
    localStorage.setItem('g_folder_id', folderId);
    localStorage.setItem('g_auto_allowed', isAutoAllowed.toString());
    localStorage.setItem('g_cache_enabled', isCacheEnabled.toString());
  }, [clientId, clientSecret, folderId, isAutoAllowed, isCacheEnabled]);

  useEffect(() => {
    localStorage.setItem('g_auto_enabled', isAutoEnabled.toString());
  }, [isAutoEnabled]);

  // Handle Google login callback / Refresh
  useEffect(() => {
    const handleAuthCallback = async () => {
      if (!clientId) return;
      setIsLoading(true);
      try {
        const u = await driveService.handleCallback();
        if (u) {
          setUser(u);
          setStatus(`Welcome, ${u.name || 'User'}`);
        } else {
          // Check if there was an error in URL params
          const params = new URLSearchParams(window.location.search);
          const error = params.get("error");
          if (error) {
            setStatus(`Login error: ${error}`);
          } else {
            setStatus("Account not connected");
          }
        }
      } catch (err: any) {
        handleError(err, `Login callback failed: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };
    handleAuthCallback();
  }, [driveService, clientId]);


  const loginGoogle = async () => {
    if (!clientId) {
      alert("Please set Google Client ID in settings first.");
      setShowSettings(true);
      return;
    }
    setIsLoading(true);
    try {
      await driveService.login();
    } catch (err) {
      handleError(err, "Login initiation failed");
    } finally {
      setIsLoading(false);
    }
  };

  const connectToBridge = async () => {
    setStatus("Searching for bridge...");
    try {
      const b = await getBridge();
      setBridge(b);
      setStatus("Connected to glasses");
      return b;
    } catch (err) {
      handleError(err, "Failed to find bridge");
      return null;
    }
  };

  const openHelp = async () => {
    setShowHelp(true);
    if (helpContent) return;
    setIsHelpLoading(true);
    try {
      const readmeText = await (await fetch("https://raw.githubusercontent.com/sYamcsPublic/DocsReader4EH/refs/heads/main/README.md")).text();
      const response = await fetch("https://api.github.com/markdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: readmeText })
      });
      let html = await response.text();
      // Strip external links and keep only their text (with some basic styling)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const anchors = Array.from(doc.querySelectorAll('a'));
      anchors.forEach(a => {
        const href = a.getAttribute('href');
        if (href && href.startsWith('http')) {
          const span = document.createElement('span');
          span.className = 'break-all';
          span.innerHTML = a.innerHTML;
          a.replaceWith(span);
        }
      });
      const prefix = `
        <div class="text-[10px] text-zinc-500 dark:text-zinc-500 mb-6 p-3 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <p>This content is being displayed from <span class="break-all font-mono opacity-80">https://github.com/sYamcsPublic/DocsReader4EH/blob/main/README.md</span>.</p>
          <p class="mt-1">ここでは <span class="break-all font-mono opacity-80">https://github.com/sYamcsPublic/DocsReader4EH/blob/main/README.md</span> の内容を表示しています。</p>
        </div>
      `;
      setHelpContent(prefix + doc.body.innerHTML);
    } catch (err) {
      setHelpContent("<p>Failed to load help content. Please check your internet connection.</p>");
    } finally {
      setIsHelpLoading(false);
    }
  };

  // --- Automatic Bridge Connection removed (As requested: User action only) ---

  useEffect(() => {
    if (!bridge) return;

    // Listen for launch source (glasses menu vs app menu)
    const unsubLaunch = bridge.onLaunchSource((source) => {
      console.log(`[App.tsx] Launch source: ${source}`);
      setLaunchSource(source);
    });

    // Handle problem 1: Update phone UI when app is closed from glasses
    const unsubEvent = bridge.onEvenHubEvent((event) => {
      if (event.sysEvent) {
        const type = event.sysEvent.eventType;
        // Handle SYSTEM_EXIT_EVENT and ABNORMAL_EXIT_EVENT
        if (type === OsEventTypeList.SYSTEM_EXIT_EVENT || type === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
          console.log(`[App.tsx] App closed from glasses (type: ${type})`);
          setIsGlassesActive(false);
          if (pageManagerRef.current) {
            pageManagerRef.current.destroy();
          }
          setStatus("Bridge Ready"); // Back to ready/green state
        }
      }
    });

    return () => {
      unsubLaunch();
      unsubEvent();
    };
  }, [bridge]);

  // Handle problem 2: Automatic connection when opened from glasses menu
  useEffect(() => {
    if (launchSource === 'glassesMenu' && bridge) {
      // Re-trigger auth check just in case, but usually user will be set by the other effect
      const checkAndAutoSync = async () => {
        // Give some time for user state to populate from refresh token if needed
        let waitCount = 0;
        while (!user && waitCount < 10) { // Wait up to 5 seconds
          await new Promise(r => setTimeout(r, 500));
          waitCount++;
        }

        const missing: string[] = [];
        if (!clientId) missing.push("Client ID / クライアントID");
        if (!clientSecret) missing.push("Client Secret / クライアントシークレット");
        if (!folderId) missing.push("Folder ID / フォルダID");
        if (!user) missing.push("Google Login / Googleログイン");

        const pageManager = new PageManager(bridge, setStatus, (k, v) => {
          if (k === 'g_auto_enabled') setIsAutoEnabled(v === 'true');
        });
        pageManagerRef.current = pageManager;

        if (missing.length > 0) {
          const errorFiles = missing.map(m => ({
            id: `err-${m}`,
            name: `⚠️ UNSET: ${m}`,
          }));

          const initialListPage = new FileListPage(
            errorFiles,
            async () => "Please complete setup in smartphone app. / スマートフォンアプリで設定を完了してください。"
          );

          await pageManager.init(initialListPage);
          setStatus("Setup required (Error list shown on glasses)");
        } else {
          // All good, auto-sync!
          console.log(`[App.tsx] Auto-syncing triggered by glassesMenu launch`);
          await syncFilesToGlasses();
        }
      };
      checkAndAutoSync();
    }
  }, [launchSource, bridge, !!user]); // Check user once it becomes available

  const openPhoneReader = async () => {
    if (!user || !folderId) {
      alert("Please login and set Folder ID first.");
      return;
    }
    setIsLoading(true);
    try {
      const fetchedFiles = await driveService.listFiles(folderId);
      fetchedFiles.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setCurrentFiles(fetchedFiles);
      setIsPhoneReaderOpen(true);
    } catch (err) {
      handleError(err, "Failed to load files for phone");
    } finally {
      setIsLoading(false);
    }
  };

  const syncCloudData = async () => {
    if (!user) return;
    if (!confirm("Sync data with Google Drive?\n(Data will be updated with the latest version regardless of device)")) return;

    setSyncLoading(true);
    setStatus("Checking sync data...");

    try {
      const DATE_FILE = "DocsReader4EH.datetime.txt";
      const DATA_FILE = "DocsReader4EH.data.json";

      const localUpdated = localStorage.getItem('g_last_updated') || "1970/1/1 00:00:00";

      const remoteDateId = await driveService.findFileByName(DATE_FILE);
      let remoteUpdated = "1970/1/1 00:00:00";

      if (remoteDateId) {
        remoteUpdated = await driveService.readFile(remoteDateId);
      }

      const localTime = new Date(localUpdated).getTime();
      const remoteTime = new Date(remoteUpdated).getTime();

      if (localTime > remoteTime) {
        setStatus("Uploading to Cloud...");
        const syncData = {
          positions: localStorage.getItem('g_reading_positions'),
          lastFileId: localStorage.getItem('g_last_file_id'),
          lastPageType: localStorage.getItem('g_last_page_type'),
          scrollSpeed: localStorage.getItem('g_scroll_speed'),
          folderId: folderId
        };
        await driveService.saveFile(DATE_FILE, localUpdated);
        await driveService.saveFile(DATA_FILE, JSON.stringify(syncData, null, "  "));
        setStatus("Cloud updated!");
      } else if (remoteTime > localTime) {
        setStatus("Downloading from Cloud...");
        const remoteDataId = await driveService.findFileByName(DATA_FILE);
        if (remoteDataId) {
          const rawData = await driveService.readFile(remoteDataId);
          const data = JSON.parse(rawData);

          if (data.positions) localStorage.setItem('g_reading_positions', data.positions);
          if (data.lastFileId) localStorage.setItem('g_last_file_id', data.lastFileId);
          if (data.lastPageType) localStorage.setItem('g_last_page_type', data.lastPageType);
          if (data.scrollSpeed) {
            localStorage.setItem('g_scroll_speed', data.scrollSpeed);
            setScrollSpeed(Number(data.scrollSpeed));
          }
          if (data.folderId) {
            localStorage.setItem('g_folder_id', data.folderId);
            setFolderId(data.folderId);
          }
          localStorage.setItem('g_last_updated', remoteUpdated);
          setStatus("Local updated!");
          setTimeout(() => window.location.reload(), 1000);
        }
      } else {
        setStatus("Already up-to-date");
      }
    } catch (err) {
      handleError(err, "Sync failed");
    } finally {
      setSyncLoading(false);
    }
  };

  const updateTimestamp = () => {
    localStorage.setItem('g_last_updated', new Date().toLocaleString());
  };

  const onPhoneFileSelected = async (file: any) => {
    updateTimestamp();
    const CACHE_KEY = 'g_content_cache';
    const MAX_CACHE = 5;

    if (isCacheEnabled) {
      const cacheRaw = localStorage.getItem(CACHE_KEY) || '[]';
      let cache: any[] = JSON.parse(cacheRaw);
      const cachedItem = cache.find(c => c.id === file.id);
      if (cachedItem && !cachedItem.content.includes("Export Error")) return cachedItem.content;
    }

    const rawText = await driveService.getDocContent(file.id);
    if (rawText.startsWith("Export Error") || rawText.startsWith("Network Error") || rawText.startsWith("AUTH_EXPIRED")) return rawText; // Don't cache errors
    const text = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    if (isCacheEnabled) {
      const cacheRaw = localStorage.getItem(CACHE_KEY) || '[]';
      let cache: any[] = JSON.parse(cacheRaw);
      const newCache = [{ id: file.id, content: text }, ...cache.filter(c => c.id !== file.id)].slice(0, MAX_CACHE);
      localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
    }
    return text;
  };

  const handleHelpClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href) {
        if (href.startsWith('http')) {
          e.preventDefault();
          e.stopPropagation();
          // External links are disabled as requested
        } else if (href.startsWith('#')) {
          e.preventDefault();
          e.stopPropagation();
          const id = href.substring(1).toLowerCase();
          // GitHub Markdown API prepends 'user-content-' to actual IDs
          const targetId = `user-content-${id}`;
          const element = document.getElementById(targetId) ||
            document.getElementById(id) ||
            document.getElementsByName(targetId)[0];

          if (element) {
            // Find the scrollable container (the drawer)
            const container = anchor.closest('.overflow-y-auto');
            if (container) {
              const rect = element.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              const offset = rect.top - containerRect.top + container.scrollTop - 20; // 20px padding
              container.scrollTo({
                top: offset,
                behavior: 'smooth'
              });
            } else {
              element.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }
      }
    }
  };

  const syncFilesToGlasses = async (forceDemo: boolean = false) => {
    if (!bridge) {
      await connectToBridge();
      return;
    }

    const missing: string[] = [];
    if (!clientId) missing.push("Client ID / クライアントID");
    if (!clientSecret) missing.push("Client Secret / クライアントシークレット");
    if (!folderId) missing.push("Folder ID / フォルダID");
    if (!user) missing.push("Google Login / Googleログイン");

    setIsLoading(true);
    setStatus(forceDemo ? "Launching Demo Mode..." : "Syncing...");

    try {
      // Clean up previous PageManager if any to stop old timers and audio
      if (pageManagerRef.current) {
        pageManagerRef.current.destroy();
      }
      const pageManager = new PageManager(
        bridge,
        (glassesStatus) => {
          setStatus(glassesStatus);
        },
        (key, value) => {
          if (key === 'g_auto_enabled') setIsAutoEnabled(value === 'true');
        }
      );
      pageManagerRef.current = pageManager;

      if (forceDemo || missing.length > 0) {
        let displayErrorFiles = [];
        if (missing.length > 0) {
          displayErrorFiles = missing.map(m => ({
            id: `err-${m}`,
            name: `⚠️ UNSET: ${m}`,
          }));
        } else {
          displayErrorFiles = [
            { id: "demo-1", name: "✨ Demo: File 1" },
            { id: "demo-2", name: "✨ Demo: File 2" },
          ];
        }

        const initialListPage = new FileListPage(
          displayErrorFiles,
          async () => (missing.length > 0 ? "Setup required. / 設定を完了してください。" : "Demo Mode. / 体験モードです。"),
          undefined
        );

        await pageManager.init(initialListPage);
        setStatus(missing.length > 0 ? `Missing components: ${missing.length}` : "Demo HUD running");
        setIsLoading(false);
        setIsGlassesActive(true);
        return;
      }

      const fetchedFiles = await driveService.listFiles(folderId);
      fetchedFiles.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setCurrentFiles(fetchedFiles);

      const onFileSelected = async (file: any) => {
        const CACHE_KEY = 'g_content_cache';
        const MAX_CACHE = 5;

        try {
          if (isCacheEnabled) {
            const cacheRaw = localStorage.getItem(CACHE_KEY) || '[]';
            let cache: { id: string, content: string }[] = JSON.parse(cacheRaw);
            const cachedItem = cache.find(c => c.id === file.id);
            if (cachedItem && !cachedItem.content.includes("Export Error")) {
              const updatedCache = [cachedItem, ...cache.filter(c => c.id !== file.id)].slice(0, MAX_CACHE);
              localStorage.setItem(CACHE_KEY, JSON.stringify(updatedCache));
              return cachedItem.content;
            }
          }

          setStatus(`Fetching from Drive: ${file.name}...`);
          const rawText = await driveService.getDocContent(file.id);
          if (rawText.startsWith("Export Error") || rawText.startsWith("Network Error") || rawText.startsWith("AUTH_EXPIRED")) return rawText; // Don't cache errors
          const text = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');

          if (isCacheEnabled) {
            const cacheRaw = localStorage.getItem(CACHE_KEY) || '[]';
            let cache: { id: string, content: string }[] = JSON.parse(cacheRaw);
            const newCache = [{ id: file.id, content: text }, ...cache.filter(c => c.id !== file.id)].slice(0, MAX_CACHE);
            localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
            setStatus("Document loaded and cached");
          } else {
            setStatus("Document loaded (nocache)");
          }
          return text;
        } catch (err) {
          handleError(err, "Cache/Fetch error");
          throw err;
        }
      };

      const lastFileId = localStorage.getItem('g_last_file_id');
      const lastPageType = localStorage.getItem('g_last_page_type') || 'list';

      const onRefreshFiles = async () => {
        const fetchedFiles = await driveService.listFiles(folderId);
        fetchedFiles.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setCurrentFiles(fetchedFiles);
        return fetchedFiles;
      };

      const initialListPage = new FileListPage(
        fetchedFiles,
        onFileSelected,
        lastFileId || undefined,
        onRefreshFiles
      );

      let initialPage: any = initialListPage;

      if (lastPageType === 'reader' && lastFileId) {
        const lastFile = fetchedFiles.find(f => f.id === lastFileId);
        if (lastFile) {
          try {
            const content = await onFileSelected(lastFile);
            const idx = fetchedFiles.indexOf(lastFile);
            initialPage = new ReaderPage(
              fetchedFiles,
              idx,
              content,
              initialListPage,
              onFileSelected
            );
          } catch (err) {
            handleError(err, "Failed to restore reader state");
          }
        }
      }

      const success = await pageManager.init(initialPage);
      // console.log(`[App.tsx]syncFilesToGlasses Sync success:${success}`);
      if (success) {
        setStatus("List synced to glasses!");
        setIsGlassesActive(true);
      } else {
        setStatus("Sync failed (Glasses OOM?)");
        setIsGlassesActive(false);
      }
    } catch (err) {
      handleError(err, "Sync failed");
      setIsGlassesActive(false);
    } finally {
      setIsLoading(false);
    }
  };

  const closeGlassesApp = async () => {
    if (!bridge) return;
    try {
      await bridge.shutDownPageContainer(0);
      setIsGlassesActive(false);
      if (pageManagerRef.current) {
        pageManagerRef.current.destroy();
      }
      setStatus("Glasses app closed");
    } catch (err) {
      handleError(err, "Failed to close glasses app");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] text-black dark:text-white font-sans selection:bg-emerald-500/30">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-6 py-12">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white dark:bg-zinc-900 rounded-2xl flex items-center justify-center border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <img src="/icon-any.png" alt="App Icon" className="w-full h-full object-cover scale-[1.35]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Docs Reader</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-medium">for EvenHub</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={syncCloudData}
              disabled={syncLoading || !user}
              className={cn(
                "p-2 bg-white dark:bg-zinc-900/50 rounded-lg transition-all border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-emerald-400",
                syncLoading && "animate-spin"
              )}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 bg-white dark:bg-zinc-900/50 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button
              onClick={openHelp}
              className="p-2 bg-white dark:bg-zinc-900/50 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900/50 rounded-full border border-zinc-200 dark:border-zinc-800 w-fit">
            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse",
              bridge ? "bg-emerald-500" : "bg-zinc-600"
            )} />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 dark:text-zinc-400">
              {status}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {!user ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-8 rounded-3xl"
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold mb-2">Connect Google</h2>
                  <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
                    Authorize access to your Google Drive to read documents directly on your even G2 glasses.
                  </p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={loginGoogle}
                    disabled={isLoading}
                    className="w-full h-14 bg-white text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <LogIn className="w-5 h-5" />
                    Continue with Google
                  </button>

                  {(isConnectable && isEvenHubMode) ? (
                    <button
                      onClick={async () => {
                        if (!bridge) {
                          const b = await connectToBridge();
                          if (b) {
                            setIsLoading(true);
                            setTimeout(async () => {
                              await syncFilesToGlasses(true);
                              setIsLoading(false);
                            }, 300);
                          }
                        } else if (isGlassesActive) {
                          await closeGlassesApp();
                        } else {
                          await syncFilesToGlasses(true);
                        }
                      }}
                      disabled={isLoading}
                      className={cn(
                        "w-full h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                        bridge && isGlassesActive
                          ? "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20"
                          : "bg-zinc-100 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                      )}
                    >
                      <LayoutList className="w-4 h-4" />
                      {bridge && isGlassesActive ? "Close Demo HUD Mode" : "Try Demo HUD Mode"}
                    </button>
                  ) : null}

                  {!clientId && (
                    <button
                      onClick={() => setShowSettings(true)}
                      className="w-full h-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:text-black dark:text-white transition-colors"
                    >
                      Update Client ID in Settings
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                {/* User Card */}
                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-4 rounded-3xl flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full border border-zinc-300 dark:border-zinc-700 overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      {user.picture ? (
                        <img
                          src={user.picture}
                          className="w-full h-full object-cover"
                          alt="profile"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as any).nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className={cn("w-full h-full items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500", !user.picture ? "flex" : "hidden")}>
                        <LogIn className="w-5 h-5" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{user.name || "User"}</h3>
                      <p className="text-[10px] text-emerald-500 flex items-center gap-1 font-bold uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3" /> Authenticated
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={logoutGoogle}
                    className="text-[10px] text-zinc-500 dark:text-zinc-500 hover:text-red-400 uppercase tracking-widest font-bold px-3 py-2"
                  >
                    Logout
                  </button>
                </div>

                {/* Folder Sync Card */}
                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-4">

                  <div className="space-y-4">
                    <button
                      onClick={openPhoneReader}
                      disabled={isLoading}
                      className="w-full h-16 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-[0.98] disabled:opacity-30 shadow-xl"
                    >
                      <Smartphone className="w-6 h-6 text-emerald-400" />
                      Read on Device
                    </button>

                    {/* Show glass sync only if probe was successful AND launched from EvenHub/simulator,
                         or if already connected (bridge exists) */}
                    {(isConnectable && isEvenHubMode) ? (
                      <button
                        onClick={async () => {
                          if (!bridge) {
                            const b = await connectToBridge();
                            if (b) {
                              // If connecting succeeded, proceed to sync immediately
                              setIsLoading(true);
                              setTimeout(async () => {
                                await syncFilesToGlasses();
                                setIsLoading(false);
                              }, 300);
                            }
                          } else if (isGlassesActive) {
                            await closeGlassesApp();
                          } else {
                            await syncFilesToGlasses();
                          }
                        }}
                        disabled={isLoading}
                        className={cn(
                          "w-full h-16 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-30 disabled:shadow-none",
                          bridge
                            ? (isGlassesActive ? "bg-red-500 text-white hover:bg-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)]" : "bg-emerald-500 text-black hover:bg-emerald-400")
                            : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-emerald-500 hover:border-emerald-500/50"
                        )}
                      >
                        <Glasses className={cn("w-6 h-6", bridge ? (isGlassesActive ? "text-white" : "text-black") : "text-emerald-500")} />
                        {bridge
                          ? (isGlassesActive ? "Close Glasses App" : "Sync Glasses")
                          : "Detect & Sync Glasses"
                        }
                        <ChevronRight className={cn("w-5 h-5", bridge ? (isGlassesActive ? "text-white/50" : "text-black/50") : "text-emerald-500/50")} />
                      </button>
                    ) : null}

                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {isLoading && (
          <div className="fixed top-0 left-0 w-full h-1 bg-emerald-500 animate-pulse z-[60]" />
        )}
      </div>

      {/* Settings Drawer (Moved outside for better fixed positioning) */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[190]"
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              className="fixed inset-x-0 bottom-0 z-[200] bg-white dark:bg-[#0a0a0a] border-t border-zinc-200 dark:border-zinc-800 p-8 rounded-t-[32px] shadow-2xl overflow-y-auto max-h-[92vh] safe-bottom no-scrollbar"
            >
              <div className="max-w-md mx-auto">
                <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mx-auto mb-8" />
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">App Settings</h2>
                  <button onClick={() => setShowSettings(false)} className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Done</button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-2 block">Google Client ID</label>
                    <input
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="Enter Client ID from GCP"
                      className="w-full h-12 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 outline-none focus:border-emerald-500/50 transition-all text-black dark:text-white placeholder:text-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-2 block">Google Client Secret</label>
                    <input
                      type="password"
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder="Enter Client Secret"
                      className="w-full h-12 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 outline-none focus:border-emerald-500/50 transition-all text-black dark:text-white placeholder:text-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-2 block">Google Drive Folder ID</label>
                    <input
                      value={folderId}
                      onChange={(e) => setFolderId(e.target.value)}
                      placeholder="Paste folder ID here"
                      className="w-full h-12 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 outline-none focus:border-emerald-500/50 transition-all text-black dark:text-white placeholder:text-zinc-700"
                    />
                  </div>
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2 block ml-1 italic">
                        My Refresh Token (Copy from here)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={localStorage.getItem('g_refresh_token') || ""}
                          readOnly
                          className="w-full h-10 bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 pr-12 outline-none text-[9px] font-mono text-zinc-400 select-all"
                        />
                        <button
                          onClick={() => {
                            const token = localStorage.getItem('g_refresh_token');
                            if (token) {
                              navigator.clipboard.writeText(token);
                              setIsTokenCopied(true);
                              setTimeout(() => setIsTokenCopied(false), 2000);
                              setStatus("Token copied!");
                            }
                          }}
                          className={cn(
                            "absolute right-2 top-1/2 -translate-y-1/2 p-1.5 transition-all duration-200",
                            isTokenCopied ? "text-emerald-500 scale-110" : "text-zinc-400 hover:text-emerald-500"
                          )}
                        >
                          {isTokenCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2 block ml-1">
                        Paste Token from another device
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          onChange={(e) => {
                            if (e.target.value.length > 20) {
                              localStorage.setItem('g_refresh_token', e.target.value);
                              setStatus("Token ready to save");
                            }
                          }}
                          placeholder="Paste here..."
                          className="flex-1 h-12 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 outline-none focus:border-emerald-500/50 transition-all text-[10px] font-mono text-black dark:text-white"
                        />
                        <button
                          onClick={() => window.location.reload()}
                          className="px-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-[10px] font-bold uppercase hover:bg-emerald-500 hover:text-black transition-all shadow-sm"
                        >
                          Save & Reload
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-zinc-500 px-1 italic">
                      Note: Useful when standard login is blocked by browser restrictions.
                    </p>
                    <div className="pt-2">
                      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-2 block ml-1">
                        Clear Document Cache
                      </label>
                      <button
                        onClick={() => {
                          if (window.confirm('Clear the document cache. \nPerforming this operation may cause the read position in updated documents to no longer point to the correct location. \n\nAre you sure you want to clear it?')) {
                            localStorage.removeItem('g_content_cache');
                            setStatus('Cache cleared');
                          }
                        }}
                        className="w-full h-12 bg-white dark:bg-black border border-red-200 dark:border-red-900/50 text-red-500 rounded-xl px-4 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shadow-sm flex items-center justify-center mb-4"
                      >
                        Clear Cache
                      </button>

                      <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                        <div className="space-y-0.5">
                          <span className="text-sm font-bold">{isCacheEnabled ? "Cache Documents" : "No Cache Mode"}</span>
                          <p className="text-[10px] text-zinc-500">Enable/Disable Google Docs caching.</p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !isCacheEnabled;
                            setIsCacheEnabled(next);
                            localStorage.setItem('g_cache_enabled', next.toString());
                          }}
                          className={cn(
                            "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                            isCacheEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                            isCacheEnabled ? "translate-x-6" : "translate-x-0"
                          )} />
                        </button>
                      </div>
                      {!isCacheEnabled && (
                        <p className="text-[10px] text-red-500/80 mt-2 px-1 leading-relaxed">
                          * If you select "No Cache", it will take more time for communication because you always get the latest state of Google Drive. Also, reading position is saved but not used. It's always displayed from the beginning of the file. and, The file list will also always retrieve the most up-to-date information.
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-3 block mt-2">Color Theme</label>
                    <div className="grid grid-cols-3 gap-3">
                      {['system', 'light', 'dark'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t as any)}
                          className={cn(
                            "h-12 rounded-xl text-xs font-bold uppercase transition-all",
                            theme === t
                              ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                              : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-3 block">Auto Scroll Speed</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[10, 20, 30].map((s) => (
                        <button
                          key={s}
                          onClick={() => setScrollSpeed(s)}
                          className={cn(
                            "h-12 rounded-xl text-xs font-bold transition-all",
                            scrollSpeed === s
                              ? "bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                              : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-2 px-1">
                      Speed applied next time you open a document.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 dark:text-zinc-500 uppercase tracking-widest font-bold mb-3 block mt-2">Enable Auto Mode</label>
                    <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-sm font-bold">{isAutoAllowed ? "Auto Mode Allowed" : "Manual Mode (Locked)"}</span>
                        <p className="text-[10px] text-zinc-500">Enabling Auto Mode increases battery consumption.</p>
                      </div>
                      <button
                        onClick={() => {
                          const next = !isAutoAllowed;
                          setIsAutoAllowed(next);
                          if (!next) {
                            setIsAutoEnabled(false);
                            localStorage.setItem('g_auto_enabled', 'false');
                          }
                        }}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative flex items-center px-1",
                          isAutoAllowed ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                          isAutoAllowed ? "translate-x-6" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                    {isAutoAllowed && (
                      <p className="text-[10px] text-emerald-500/80 mt-2 px-1 leading-relaxed">
                        * Please enable auto-scroll on the glasses while the phone screen is active. It will continue working even if you lock the screen afterward.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Help Drawer */}
      <AnimatePresence>
        {showHelp && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHelp(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[290]"
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="fixed inset-x-0 bottom-0 z-[300] bg-white dark:bg-[#0a0a0a] border-t border-zinc-200 dark:border-zinc-800 p-8 rounded-t-[32px] shadow-2xl overflow-y-auto overflow-x-hidden max-h-[92vh] safe-bottom no-scrollbar"
            >
              <div className="max-w-md mx-auto">
                <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mx-auto mb-8" />
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Help & Guide</h2>
                  <button onClick={() => setShowHelp(false)} className="text-zinc-600 dark:text-zinc-400 text-sm font-medium">Close</button>
                </div>
                <div className="readme-content no-scrollbar help-content px-1">
                  {isHelpLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-500">
                      <RefreshCw className="w-8 h-8 animate-spin" />
                      <p className="text-[10px] uppercase tracking-widest font-black">Loading README...</p>
                    </div>
                  ) : (
                    <div
                      onClick={handleHelpClick}
                      dangerouslySetInnerHTML={{ __html: helpContent }}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Phone Reader Overlay */}
      <AnimatePresence>
        {isPhoneReaderOpen && (
          <MobileReader
            files={currentFiles}
            initialScrollSpeed={scrollSpeed}
            isAutoEnabled={isAutoEnabled}
            isAutoAllowed={isAutoAllowed}
            isCacheEnabled={isCacheEnabled}
            onAutoModeChange={(mode: boolean) => setIsAutoEnabled(mode)}
            onClose={() => setIsPhoneReaderOpen(false)}
            onFetch={onPhoneFileSelected}
            onUpdateProgress={() => setStatus("Updated Progress")}
            handleError={handleError}
            onRefreshFiles={async () => {
              const fetchedFiles = await driveService.listFiles(folderId);
              fetchedFiles.sort((a: any, b: any) => a.name.localeCompare(b.name));
              setCurrentFiles(fetchedFiles);
            }}
          />
        )}
      </AnimatePresence>

      {/* Footer Branding */}
      <footer className="relative z-10 text-center py-12 opacity-30 select-none grayscale hover:grayscale-0 transition-all">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase">Docs Reader for EvenHub</p>
      </footer>
    </div >
  );
}

// --- Mobile Reader Component ---
function MobileReader({ files, onClose, onFetch, initialScrollSpeed, isAutoEnabled, isAutoAllowed, isCacheEnabled, onUpdateProgress, handleError, onRefreshFiles, onAutoModeChange }: any) {
  const [viewMode, setViewMode] = useState<'list' | 'reader'>(() => {
    const lastPageType = localStorage.getItem('g_last_page_type');
    return (lastPageType === 'reader') ? 'reader' : 'list';
  });

  const [currentIdx, setCurrentIdx] = useState(() => {
    const lastId = localStorage.getItem('g_last_file_id');
    const idx = files.findIndex((f: any) => f.id === lastId);
    return idx !== -1 ? idx : 0;
  });

  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAuto, setIsAuto] = useState(isAutoEnabled && isAutoAllowed);
  const [timeLeft, setTimeLeft] = useState(initialScrollSpeed);
  const [currentRatio, setCurrentRatio] = useState<number | undefined>(undefined);

  // Sync internal state with prop changes (e.g. from glasses)
  useEffect(() => {
    setIsAuto(isAutoEnabled && isAutoAllowed);
  }, [isAutoEnabled, isAutoAllowed]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const selectedRef = React.useRef<HTMLButtonElement>(null);
  const isJumpingRef = React.useRef(false);

  // Load content
  const loadFile = async (idx: number, scrollType: 'top' | 'bottom' | 'ratio' = 'ratio') => {
    setIsLoading(true);
    isJumpingRef.current = true;
    try {
      const file = files[idx];
      const text = await onFetch(file);
      setContent(text);
      setCurrentIdx(idx);
      localStorage.setItem('g_last_file_id', file.id);
      localStorage.setItem('g_last_page_type', 'reader');
      onUpdateProgress();

      setTimeout(() => {
        if (!scrollRef.current) return;
        const { scrollHeight, clientHeight } = scrollRef.current;
        if (scrollType === 'top') {
          scrollRef.current.scrollTop = 0;
        } else if (scrollType === 'bottom') {
          scrollRef.current.scrollTop = scrollHeight - clientHeight;
        } else {
          const positions = JSON.parse(localStorage.getItem('g_reading_positions') || '{}');
          const ratio = isCacheEnabled ? (positions[file.id] || 0) : 0;
          setCurrentRatio(ratio);
          // Compensate for layout differences: scroll to (ratio * depth) - half screen
          const targetScroll = ratio * (scrollHeight - clientHeight);
          scrollRef.current.scrollTop = Math.max(0, targetScroll - (clientHeight * 0.5));
        }
        // Wait longer for heavy text layouts to finish settling before unlocking the scroll listener
        setTimeout(() => { isJumpingRef.current = false; }, 800);
      }, 150);
    } catch (err) {
      handleError(err, "Failed to load document");
      isJumpingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setSimulatorBannerVisible(false);
    if (viewMode === 'reader') {
      loadFile(currentIdx);
    } else {
      // List view: scroll selected into view
      setTimeout(() => {
        selectedRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 300);
    }
    return () => setSimulatorBannerVisible(true);
  }, [viewMode]);

  useEffect(() => {
    if (!isAuto || isLoading || viewMode !== 'reader') return;
    const timer = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            if (scrollTop + clientHeight < scrollHeight - 5) {
              scrollRef.current.scrollBy({ top: clientHeight * 0.8, behavior: 'smooth' });
              return initialScrollSpeed;
            } else {
              const nextIdx = (currentIdx + 1) % files.length;
              loadFile(nextIdx, 'top');
              return initialScrollSpeed;
            }
          }
          return initialScrollSpeed;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAuto, isLoading, files.length, initialScrollSpeed, currentIdx, viewMode]);

  const onScroll = () => {
    if (!scrollRef.current || isLoading || viewMode !== 'reader' || isJumpingRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight <= clientHeight + 10) return; // Wait for layout to expand
    const file = files[currentIdx];
    const ratio = scrollTop / (scrollHeight - clientHeight || 1);
    setCurrentRatio(ratio);

    // Throttle localStorage writes minimally to save I/O if needed, but for now we write directly
    const pos = JSON.parse(localStorage.getItem('g_reading_positions') || '{}');
    pos[file.id] = ratio;
    localStorage.setItem('g_reading_positions', JSON.stringify(pos));
    onUpdateProgress();
  };

  const handleNextFile = () => {
    if (isLoading) return;
    const nextIdx = (currentIdx + 1) % files.length;
    loadFile(nextIdx, 'top');
  };

  const handlePrevFile = () => {
    if (isLoading) return;
    const prevIdx = (currentIdx - 1 + files.length) % files.length;
    loadFile(prevIdx, 'bottom');
  };

  if (viewMode === 'list') {
    const positions = JSON.parse(localStorage.getItem('g_reading_positions') || '{}');
    return (
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-[100] bg-zinc-50 dark:bg-[#050505] flex flex-col font-['Noto_Sans_JP'] border-x border-zinc-200 dark:border-zinc-900 shadow-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="p-4 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between shadow-sm relative z-10 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={async () => {
                onClose();
              }}
              className="p-1 -ml-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Documents List</h2>
          </div>
          <LayoutList className="text-emerald-500 w-5 h-5 opacity-50" />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar max-w-2xl mx-auto w-full">
          {files.map((file: any, idx: number) => {
            const ratio = positions[file.id];
            return (
              <button
                key={file.id}
                ref={currentIdx === idx ? selectedRef : null}
                onClick={() => {
                  setCurrentIdx(idx);
                  setViewMode('reader');
                }}
                className={cn(
                  "w-full p-4 rounded-xl flex items-center justify-between transition-all active:scale-[0.98]",
                  currentIdx === idx ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800"
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden text-left flex-1 min-w-0 pr-4">
                  <FileText className={cn("w-5 h-5 flex-shrink-0", currentIdx === idx ? "text-emerald-400" : "text-zinc-500 dark:text-zinc-500")} />
                  <span className={cn("font-bold truncate", currentIdx === idx ? "text-emerald-400" : "text-zinc-800 dark:text-zinc-300")}>{file.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {currentIdx === idx && ratio !== undefined && isCacheEnabled && (
                    <span className="text-[10px] text-zinc-600 dark:text-zinc-300 font-bold tracking-wider bg-zinc-200 dark:bg-zinc-700/80 px-2 py-1 rounded-md border border-zinc-300 dark:border-zinc-600">
                      {(ratio * 100).toFixed(1)}%
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-zinc-700" />
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-900 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
          {files.length} Documents
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-[100] bg-zinc-50 dark:bg-[#050505] flex flex-col font-['Noto_Sans_JP'] border-x border-zinc-200 dark:border-zinc-900 shadow-2xl"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="p-4 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur-md">
        <div className="flex items-center gap-3 overflow-hidden">
          <button
            onClick={async () => {
              setViewMode('list');
              localStorage.setItem('g_last_page_type', 'list');
              if (!isCacheEnabled && onRefreshFiles) {
                await onRefreshFiles();
              }
            }}
            className="p-1 -ml-1 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="overflow-hidden">
            <h2 className="text-base font-bold truncate text-zinc-900 dark:text-zinc-100 flex items-baseline gap-2">
              {files[currentIdx]?.name}
              <span className="text-xs font-normal text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                {currentRatio !== undefined && isCacheEnabled ? `[${(currentRatio * 100).toFixed(1)}%]` : ''}
              </span>
            </h2>
            {isAuto && (
              <div className="flex gap-2 mt-0.5">
                <span className="text-[10px] text-emerald-500 font-bold uppercase animate-pulse">Auto Scroll Active</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (!isAutoAllowed) {
              alert("Auto mode is locked in settings.");
              return;
            }
            const nextMode = !isAuto;
            setIsAuto(nextMode);
            localStorage.setItem('g_auto_enabled', nextMode.toString());
            if (onAutoModeChange) onAutoModeChange(nextMode);
            if (nextMode) {
              setTimeLeft(initialScrollSpeed);
            }
          }}
          className={cn("px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all outline-none",
            isAuto ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
            !isAutoAllowed && "opacity-50"
          )}
        >
          {!isAutoAllowed ? "Manual(Locked)" : (isAuto ? `Auto (${timeLeft}s)` : "Manual")}
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-6 py-8 text-zinc-800 dark:text-zinc-300 leading-relaxed text-lg scroll-smooth no-scrollbar"
        style={{ fontFamily: "'Noto Sans JP', sans-serif !important" }}
      >
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-zinc-500 dark:text-zinc-500">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-xs uppercase tracking-widest font-bold">Synchronizing...</p>
          </div>
        ) : (
          <div className="whitespace-pre-wrap max-w-2xl mx-auto pb-40" style={{ fontFamily: "'Noto Sans JP', sans-serif !important" }}>
            {content}
          </div>
        )}
      </div>

      <div className="p-4 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-900">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-4">
          <button
            onClick={handlePrevFile}
            className="h-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400 active:bg-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>
          <button
            onClick={handleNextFile}
            className="h-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 text-zinc-600 dark:text-zinc-400 active:bg-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default App;
