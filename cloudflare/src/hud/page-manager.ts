import {
  CreateStartUpPageContainer,
  type EvenAppBridge,
  OsEventTypeList,
  StartUpPageCreateResult,
  RebuildPageContainer,
} from "@evenrealities/even_hub_sdk";

export interface PageRenderResult {
  containerTotalNum: number;
  textObject?: any[];
  listObject?: any[];
  imageObject?: any[];
}

export abstract class BasePage {
  public isActive: boolean = true;
  public viewMode: GlassViewMode = GlassViewMode.NORMAL;
  public batteryLevel: number = 100; // Default to 100
  public get isCacheEnabled(): boolean { return localStorage.getItem('g_cache_enabled') !== 'false'; }
  public pageType: string = "BasePage";
  protected bridge!: EvenAppBridge;
  protected navigate!: (page: BasePage) => Promise<boolean>;
  protected refreshBattery!: (force?: boolean) => Promise<number>;
  protected notifySettingsChanged!: (key: string, value: string) => void;
  public get isAutoMode(): boolean { return localStorage.getItem('g_auto_enabled') === 'true'; }


  init(
    navigate: (page: BasePage) => Promise<boolean>, 
    bridge: EvenAppBridge, 
    refreshBattery: (force?: boolean) => Promise<number>,
    notifySettingsChanged: (key: string, value: string) => void
  ) {
    this.navigate = navigate;
    this.bridge = bridge;
    this.refreshBattery = refreshBattery;
    this.notifySettingsChanged = notifySettingsChanged;
  }

  onDeactivate() {
    this.isActive = false;
  }

  abstract render(): PageRenderResult;

  async afterRender(): Promise<void> { }

  // Event handlers
  onListSelect(_event: any) { }
  onScrollUp(_event: any) { }
  onScrollDown(_event: any) { }
  onClick(_event: any) { }
  onDoubleClick(_event: any) { }
  
  // New: specific update for battery
  async onBatteryUpdate(_level: number): Promise<void> { }
  async onAutoTick(): Promise<void> { }
  async updateDisplay(_forceBattery?: boolean): Promise<void> { }


  protected getCharWidth(char: string): number {
    // 1. Zenkaku (Full-width)
    if (/[^\x00-\xff]/.test(char)) {
      return 2.0;
    }

    // 2. Half-width digits: Balanced for proportional font
    if (char === '1') {
      return 0.8;
    }
    if (/[02-9]/.test(char)) {
      return 1.1;
    }

    // 3. Wide half-width capitals (A-Z,%)
    // if (/[A-Z]/.test(char)) {
    if (/[A-Z%]/.test(char)) {
      return 1.2;
    }

    // 4. Narrow characters (i, l, I, and punctuation)
    if (/[ilI|!.,"';:']/.test(char)) {
      return 0.5;
    }

    // 5. Extra-wide symbols (rendered nearly full-width on hardware)
    if (char === '@') {
      return 2.0;
    }

    // 6. Symbols & Spaces
    if (/[ \-+\/*=<>()[\]{}]/.test(char)) {
      return 0.8;
    }

    // 7. Others (lowercase alpha, etc.)
    return 1.0;
  }
}

export enum GlassViewMode {
  NORMAL = "NORMAL", // Based on current page (Reader or FileList)
  AR = "AR",         // AR mode (First line only)
  HIDDEN = "HIDDEN"  // Hidden mode (Blank)
}

export class PageManager {
  private currentPage?: BasePage;
  private bridge: EvenAppBridge;
  private onStatusUpdate?: (status: string) => void;
  private onSettingsChanged?: (key: string, value: string) => void;
  private viewMode: GlassViewMode = GlassViewMode.NORMAL;
  private batteryLevel: number = 100;
  private lastRefreshTime: number = 0;
  private autoUpdateTimer: any = null;
  private silentAudio: HTMLAudioElement | null = null;
  private lastTickTime: number = 0;
  // Track all setTimeout IDs for cleanup on HIDDEN mode
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];


  constructor(bridge: EvenAppBridge, onStatusUpdate?: (status: string) => void, onSettingsChanged?: (key: string, value: string) => void) {
    this.bridge = bridge;
    this.onStatusUpdate = onStatusUpdate;
    this.onSettingsChanged = onSettingsChanged;
  }

  async refreshBattery(force: boolean = false): Promise<number> {
    const now = Date.now();
    // Throttle if refreshing too frequently (e.g. on every auto-scroll tick)
    // Default throttle 30s unless force is true (e.g. on manual interactions)
    if (!force && now - this.lastRefreshTime < 30000) return this.batteryLevel;
    this.lastRefreshTime = now;

    try {
      const info = await this.bridge.getDeviceInfo();
      if (info && info.status && typeof info.status.batteryLevel === 'number') {
        const actualLevel = info.status.batteryLevel;
        console.log(`🔋 Refreshed battery level: ${actualLevel}%`);
        this.batteryLevel = actualLevel;
        if (this.currentPage) {
          this.currentPage.batteryLevel = this.batteryLevel;
        }
      }
    } catch (e) {
      console.warn("Failed to refresh battery info:", e);
    }
    return this.batteryLevel;
  }

  async init(initialPage: BasePage): Promise<boolean> {
    // Attempt to get initial battery level from device info
    try {
      const info = await this.bridge.getDeviceInfo();
      if (info && info.status && typeof info.status.batteryLevel === 'number') {
        this.batteryLevel = info.status.batteryLevel;
      }
    } catch (e) {
      console.warn("Failed to get initial device info:", e);
    }

    // Restore saved view mode
    let savedMode = localStorage.getItem('g_glass_view_mode') as GlassViewMode;
    if (savedMode === GlassViewMode.HIDDEN) {
      savedMode = GlassViewMode.AR; // Start in 1-line mode if closed in hidden mode
    }
    if (savedMode && Object.values(GlassViewMode).includes(savedMode)) {
      this.viewMode = savedMode;
      console.log(`[PageManager] Restored viewMode: ${this.viewMode}`);
    }

    this.bridge.onDeviceStatusChanged(async (status: any) => {
      console.log(`📱 Device status changed: ${JSON.stringify(status)}`);
      
      if (!status) return;

      // Handle disconnection
      const isDisconnected = status.connectType === 'disconnected' || status.connectType === 'connectionFailed' || status === 0;
      if (isDisconnected) {
        if (this.currentPage) {
          this.currentPage.onDeactivate();
        }
        return;
      }

      // Update battery ONLY when connected to avoid "0%" during initialization
      if (status.connectType === 'connected') {
        const actualLevel = status.batteryLevel ?? status.battery_level;
        
        if (typeof actualLevel === 'number') {
          console.log(`🔋 Battery level confirmed: ${actualLevel}%`);
          this.batteryLevel = actualLevel;
          if (this.currentPage) {
            this.currentPage.batteryLevel = this.batteryLevel;
            await this.currentPage.onBatteryUpdate(this.batteryLevel);
          }
        }
      }
    });

    this.bridge.onEvenHubEvent(async (event) => {
      console.log(`🎯 Bridge received event:${JSON.stringify(event)}`);

      const handleEvent = async (ev: any, isList = false) => {
        // console.log(`[page-manager.ts]handleEvent ev:${JSON.stringify(ev)}`);

        const eventType = OsEventTypeList.fromJson(ev.eventType);
        const isClick = eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined;
        const isDoubleClick = eventType === OsEventTypeList.DOUBLE_CLICK_EVENT;

        if (isDoubleClick) {
          await this.handleGlobalDoubleClick();
          return;
        }

        if (this.viewMode === GlassViewMode.HIDDEN) return;

        if (isList) {
          if (isClick) {
            if (this.viewMode === GlassViewMode.AR) {
              await this.currentPage?.updateDisplay(true); // Single tap in AR: update time/battery
            } else if (this.viewMode === GlassViewMode.NORMAL) {
              await this.currentPage?.onListSelect(ev);
            }
          }
        } else {
          if (eventType === OsEventTypeList.SCROLL_TOP_EVENT) {
            await this.currentPage?.onScrollUp(ev);
          } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
            await this.currentPage?.onScrollDown(ev);
          } else if (isClick) {
            if (this.viewMode === GlassViewMode.AR) {
              await this.currentPage?.updateDisplay(true); // Single tap in AR: update time/battery
            } else if (this.viewMode === GlassViewMode.NORMAL) {
              await this.currentPage?.onClick(ev);
            }
          }
        }
      };


      if (event.listEvent) {
        await handleEvent(event.listEvent, true);
      } else if (event.textEvent) {
        await handleEvent(event.textEvent);
      } else if (event.sysEvent) {
        await handleEvent(event.sysEvent);
      }
    });

    return this.load(initialPage, true);
  }

  private async handleGlobalDoubleClick() {
    if (!this.currentPage) return;

    if (this.currentPage.pageType === "ReaderPage") {
      // From ReaderPage, always go back to list (Normal mode)
      this.viewMode = GlassViewMode.NORMAL;
      await this.currentPage.onDoubleClick({}); // This usually triggers navigation back to list
    } else if (this.currentPage.pageType === "FileListPage") {
      // On FileListPage, cycle: NORMAL -> AR -> HIDDEN -> NORMAL
      if (this.viewMode === GlassViewMode.NORMAL) {
        this.viewMode = GlassViewMode.AR;
      } else if (this.viewMode === GlassViewMode.AR) {
        this.viewMode = GlassViewMode.HIDDEN;
      } else {
        this.viewMode = GlassViewMode.NORMAL;
      }
      localStorage.setItem('g_glass_view_mode', this.viewMode);
      await this.renderCurrentMode();
    }
    
    this.updateStatus();
    await this.refreshAutoUpdate();

    // HIDDEN モードへ遷移した際は、残存するタイマーを全てクリアしてバッテリー消費を最小化する
    if (this.viewMode === GlassViewMode.HIDDEN) {
      this.clearAllPendingTimers();
    }
  }


  private updateStatus() {
    if (!this.onStatusUpdate || !this.currentPage) return;
    
    let status = "Glasses: ";
    if (this.currentPage.pageType === "ReaderPage") {
      status += "Reading";
    } else {
      status += "File List";
    }

    if (this.viewMode === GlassViewMode.AR) {
      status += " (1Line)";
    } else if (this.viewMode === GlassViewMode.HIDDEN) {
      status += " (Hidden)";
    }
    
    this.onStatusUpdate(status);
  }

  private applyViewModeFilter(rendered: PageRenderResult): PageRenderResult {
    if (this.viewMode === GlassViewMode.NORMAL) return rendered;

    if (this.viewMode === GlassViewMode.AR) {
        // Keep ONLY the header containers (Main header, Battery, Mode, Cache)
        if (rendered.textObject) {
            rendered.textObject = rendered.textObject.filter(o => 
              o.containerName && (
                o.containerName.includes("hdr") || 
                o.containerName.includes("header") || 
                o.containerName.includes("battery") || 
                o.containerName.includes("mode") ||
                o.containerName.includes("cache")
              )
            );
            // CRITICAL: Exactly ONE container must have isEventCapture: 1.
            let captureIdx = rendered.textObject.findIndex(o => o.containerName && o.containerName.includes("mode"));
            if (captureIdx === -1) captureIdx = 0;

            rendered.textObject.forEach((o, index) => {
              o.isEventCapture = (index === captureIdx) ? 1 : 0;
            });
        }

        rendered.listObject = [];
        rendered.imageObject = [];
        rendered.containerTotalNum = rendered.textObject?.length || 0;
    } else if (this.viewMode === GlassViewMode.HIDDEN) {
        // Must keep 1 container for evenHub to capture double tap
        rendered.textObject = [{
          xPosition: 0,
          yPosition: 0,
          width: 1,
          height: 1,
          borderWidth: 0,
          containerID: 99,
          containerName: "hidden-pad",
          isEventCapture: 1,
          content: "",
        }];
        rendered.listObject = [];
        rendered.imageObject = [];
        rendered.containerTotalNum = 1;
    }
    return rendered;
  }

  private async renderCurrentMode() {
    if (!this.currentPage) return;
    this.currentPage.viewMode = this.viewMode;
    const rendered = this.applyViewModeFilter(this.currentPage.render());

    await this.bridge.rebuildPageContainer(new RebuildPageContainer(rendered));
    await new Promise<void>(resolve => {
      const tid = setTimeout(() => { resolve(); }, 200);
      this.pendingTimeouts.push(tid);
    });
    await this.currentPage.afterRender();
  }

  async load(page: BasePage, isInitial = false) {
    console.log(`[page-manager.ts]load start, isInitial:${isInitial}`);
    if (this.currentPage) {
      this.currentPage.onDeactivate();
    }
    this.currentPage = page;
    page.isActive = true;
    page.viewMode = this.viewMode;
    page.batteryLevel = this.batteryLevel; // Sync battery level to new page
    page.init(
        this.load.bind(this), 
        this.bridge, 
        this.refreshBattery.bind(this),
        (key, value) => {
            if (key === 'g_auto_enabled') {
              this.refreshAutoUpdate();
            }
            if (this.onSettingsChanged) {
              this.onSettingsChanged(key, value);
            }
        }
    );

    this.updateStatus();

    const rendered = this.applyViewModeFilter(page.render());

    if (isInitial) {
      const result = await this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer(rendered)
      );

      if (result === StartUpPageCreateResult.success) {
        await page.afterRender();
        await this.refreshAutoUpdate();
      }
      return result === StartUpPageCreateResult.success;

    } else {
      await this.bridge.rebuildPageContainer(new RebuildPageContainer(rendered));
      await new Promise(resolve => setTimeout(() => { resolve(undefined); }, 200));
      await page.afterRender();
      await this.refreshAutoUpdate();
      return true;
    }
  }


  private async refreshAutoUpdate() {
    if (this.viewMode === GlassViewMode.HIDDEN || localStorage.getItem('g_auto_enabled') !== 'true') {
      this.stopAutoUpdate();
    } else {
      this.startAutoUpdate();
    }
  }


  private startAutoUpdate() {
    if (!this.currentPage) return;
    if (this.autoUpdateTimer) return;

    console.log("⏱️ Starting shared auto-update timer");
    this.lastTickTime = Date.now();
    this.startBackgroundMode();

    this.autoUpdateTimer = setInterval(async () => {
      if (!this.currentPage || localStorage.getItem('g_auto_enabled') !== 'true') {
        this.stopAutoUpdate();
        return;
      }

      const now = Date.now();
      if (now - this.lastTickTime >= 400) {
        this.lastTickTime = now;
        // Each page's onAutoTick() handles its own display update.
        await this.currentPage.onAutoTick();
      }
    }, 400);
  }


  private stopAutoUpdate() {
    if (this.autoUpdateTimer) {
      console.log("⏱️ Stopping shared auto-update timer (id:" + this.autoUpdateTimer + ")");
      clearInterval(this.autoUpdateTimer);
      this.autoUpdateTimer = null;
    }
    this.stopBackgroundMode();
  }

  /** 消灯モード(HIDDEN)遷移時に、残存している全setTimeoutをクリアしてバッテリー消費を最小化する */
  private clearAllPendingTimers() {
    console.log("[PageManager] 🌙 HIDDEN mode: clearing " + this.pendingTimeouts.length + " pending setTimeout(s). ids:" + JSON.stringify(this.pendingTimeouts));
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts = [];
    // autoUpdateTimer も念のため再確認してクリア
    if (this.autoUpdateTimer) {
      console.log("[PageManager] 🌙 HIDDEN mode: also clearing autoUpdateTimer id:" + this.autoUpdateTimer);
      clearInterval(this.autoUpdateTimer);
      this.autoUpdateTimer = null;
    }
    console.log("[PageManager] 🌙 HIDDEN mode: all timers cleared.");
  }

  private startBackgroundMode() {
    if (!this.silentAudio) {
      this.silentAudio = new Audio('/silent.wav');
      this.silentAudio.loop = true;
    }
    if (this.silentAudio.paused) {
      this.silentAudio.play().catch(e => console.warn("Audio play failed (user interaction may be required)", e));
    }
  }

  private stopBackgroundMode() {
    if (this.silentAudio) {
      this.silentAudio.pause();
    }
  }

  destroy() {
    this.stopAutoUpdate();
    // destroy時も全setTimeoutをクリア
    console.log("[PageManager] destroy: clearing " + this.pendingTimeouts.length + " pending timeouts. ids:" + JSON.stringify(this.pendingTimeouts));
    for (const id of this.pendingTimeouts) {
      clearTimeout(id);
    }
    this.pendingTimeouts = [];
    if (this.currentPage) {
      this.currentPage.onDeactivate();
      this.currentPage = undefined;
    }
  }
}

