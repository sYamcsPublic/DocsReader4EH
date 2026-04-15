import {
  TextContainerProperty,
  TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import { BasePage, type PageRenderResult, GlassViewMode } from "../page-manager";
import { ReaderPage } from "./reader-page";
import { LoadingPage } from "./loading-page";

export interface GoogleFile {
  id: string;
  name: string;
  type?: string;
}

export class FileListPage extends BasePage {
  private files: GoogleFile[];
  private onFileSelected: (file: GoogleFile) => Promise<string>;
  private selectedIndex: number = 0;
  private cachedPositions: Record<string, number> = {};

  // Use ID 2 for header to overlap with Reader's Status (ID 2) instead of Reader's Header (ID 1).
  // This forces a different name and content to be pushed to the same physical slot, 
  // which often helps reset "sticky" buffers on hardware.
  private static readonly ID_HEADER_DATE = 1;
  private static readonly ID_HEADER_BATT = 2;
  private static readonly ID_BODY = 3;
  private static readonly ID_HEADER_MODE = 4;

  constructor(files: GoogleFile[], onFileSelected: (file: GoogleFile) => Promise<string>, initialFileId?: string) {
    super();
    this.files = [...files].sort((a, b) => a.name.localeCompare(b.name));
    this.onFileSelected = onFileSelected;

    if (initialFileId) {
      const idx = this.files.findIndex(f => f.id === initialFileId);
      if (idx !== -1) {
        this.selectedIndex = idx;
      }
    }

    // Initial cache of positions to avoid expensive localStorage lookups during scroll
    this.refreshCache();
    this.pageType = "FileListPage";
    localStorage.setItem('g_last_page_type', 'list');
  }

  private refreshCache() {
    try {
      this.cachedPositions = JSON.parse(localStorage.getItem('g_reading_positions') || '{}');
    } catch (e) {
      this.cachedPositions = {};
    }
  }

  public setSelectedIndex(index: number) {
    if (index >= 0 && index < this.files.length) {
      this.selectedIndex = index;
    }
  }

  private truncateName(name: string, maxWidth: number): string {
    const SUFFIX_LEN = 8;

    // Check if total width fits
    let totalWidth = 0;
    for (const char of name) totalWidth += this.getCharWidth(char);
    if (totalWidth <= maxWidth) return name;

    const suffix = name.substring(Math.max(0, name.length - SUFFIX_LEN));
    let suffixWidth = 0;
    for (const char of suffix) suffixWidth += this.getCharWidth(char);

    const ellipsisWidth = this.getCharWidth('.') * 3;
    const availablePrefixWidth = maxWidth - ellipsisWidth - suffixWidth;

    let currentWidth = 0;
    let prefix = "";
    for (let i = 0; i < name.length - SUFFIX_LEN; i++) {
      const char = name[i];
      const w = this.getCharWidth(char);
      if (currentWidth + w > availablePrefixWidth) break;
      prefix += char;
      currentWidth += w;
    }

    return prefix + "..." + suffix;
  }

  private getFormattedDate(): string {
    const now = new Date();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const day = days[now.getDay()];
    const hh = now.getHours();
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    return `${y}/${m}/${d}(${day})${hh}:${mm}:${ss}`;
  }

  private getBatteryIcon(): string {
    return `${this.batteryLevel}%`;
  }

  private getModeText(): string {
    // g_auto_allowed: phone-level permission ("Enable Auto Mode" setting)
    // g_auto_enabled: current glasses auto state (toggled by glasses scroll)
    const isAutoAllowed = localStorage.getItem('g_auto_allowed') === 'true';
    if (!isAutoAllowed) return "M:lck";
    const isAutoActive = localStorage.getItem('g_auto_enabled') === 'true';
    return isAutoActive ? "A" : "M";
  }


  private getListText(): string {
    const DISPLAY_COUNT = 9;
    const LINE_MAX_WIDTH = 56; // Max units for full line width in 572-wide container
    let start = Math.max(0, this.selectedIndex - Math.floor(DISPLAY_COUNT / 2));
    if (start + DISPLAY_COUNT > this.files.length) start = Math.max(0, this.files.length - DISPLAY_COUNT);

    const lines = [];
    for (let i = start; i < Math.min(start + DISPLAY_COUNT, this.files.length); i++) {
      const file = this.files[i];
      const ratio = this.cachedPositions[file.id];
      const ratioStr = i === this.selectedIndex && ratio !== undefined ? ` [${(ratio * 100).toFixed(1)}%]` : "";
      const prefixStr = i === this.selectedIndex ? "> " : "  ";

      // Calculate widths of prefix and ratio to find available space for filename
      let extraWidth = 0;
      for (const char of prefixStr) extraWidth += this.getCharWidth(char);
      for (const char of ratioStr) extraWidth += this.getCharWidth(char);

      const truncatedName = this.truncateName(file.name, LINE_MAX_WIDTH - extraWidth);
      lines.push(prefixStr + truncatedName + ratioStr);
    }
    return lines.join("\n");
  }

  render(): PageRenderResult {
    return {
      containerTotalNum: 4,
      textObject: [
        new TextContainerProperty({
          xPosition: 4,
          yPosition: 2,
          width: 380, // Allow more space for date
          height: 28,
          borderWidth: 0,
          containerID: FileListPage.ID_HEADER_DATE,
          containerName: "list-hdr-date",
          isEventCapture: 0,
          content: this.getFormattedDate(),
        }),
        new TextContainerProperty({
          xPosition: 525, // Push percentage to far right edge
          yPosition: 2,
          width: 48,
          height: 28,
          borderWidth: 0,
          containerID: FileListPage.ID_HEADER_BATT,
          containerName: "list-hdr-batt",
          isEventCapture: 0,
          content: this.getBatteryIcon(),
        }),
        new TextContainerProperty({
          xPosition: 390, // Same as ReaderPage
          yPosition: 2,
          width: 130,
          height: 28,
          borderWidth: 0,
          containerID: FileListPage.ID_HEADER_MODE,
          containerName: "list-hdr-mode",
          isEventCapture: 0,
          content: this.getModeText(),
        }),
        new TextContainerProperty({
          xPosition: 4,
          yPosition: 30,
          width: 572,
          height: 256,
          borderWidth: 1,
          borderColor: 0xFFFFFFFF,
          borderRadius: 8,
          paddingLength: 2,
          containerID: FileListPage.ID_BODY,
          containerName: "list-body",
          isEventCapture: 1,
          content: this.getListText(),
        }),
      ],
    };
  }

  // Optimized update for scrolling
  async updateBodyOnly() {
    if (!this.isActive || this.viewMode !== GlassViewMode.NORMAL) return;

    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: FileListPage.ID_BODY,
      containerName: "list-body",
      contentOffset: 0,
      contentLength: 800,
      content: this.getListText(),
    }));
  }

  // Full update for page entry or periodic refresh
  async updateDisplay(forceBattery: boolean = false) {

    if (!this.isActive) return;

    // Refresh battery whenever the time/display is updated
    await this.refreshBattery(forceBattery);

    // Both Normal and AR show the header (timestamp & battery)
    if (this.viewMode === GlassViewMode.NORMAL || this.viewMode === GlassViewMode.AR) {
      await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: FileListPage.ID_HEADER_DATE,
        containerName: "list-hdr-date",
        contentOffset: 0,
        contentLength: 100,
        content: this.getFormattedDate(),
      }));

      if (!this.isActive) return;

      await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: FileListPage.ID_HEADER_BATT,
        containerName: "list-hdr-batt",
        contentOffset: 0,
        contentLength: 10,
        content: this.getBatteryIcon(),
      }));

      if (!this.isActive) return;

      await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
        containerID: FileListPage.ID_HEADER_MODE,
        containerName: "list-hdr-mode",
        contentOffset: 0,
        contentLength: 10,
        content: this.getModeText(),
      }));
    }

    if (!this.isActive || this.viewMode !== GlassViewMode.NORMAL) return;

    // Update body only in Normal mode
    await this.updateBodyOnly();
  }

  async onBatteryUpdate(_level: number): Promise<void> {
    if (!this.isActive) return;
    await this.updateDisplay();
  }

  async afterRender() {
    this.refreshCache(); // Sync latest progress before showing
    await new Promise(resolve => setTimeout(resolve, 300));
    await this.updateDisplay();
  }

  async onAutoTick() {
    if (!this.isActive) return;
    await this.updateDisplay();
  }


  async onScrollDown() {

    // In AR mode, scroll toggles the auto mode (only if phone allows it)
    if (this.viewMode === GlassViewMode.AR) {
      const isAutoAllowed = localStorage.getItem('g_auto_allowed') === 'true';
      if (!isAutoAllowed) {
        // M:lck - cannot toggle; just refresh the display to confirm state
        await this.updateDisplay(true);
        return;
      }
      const isAutoActive = localStorage.getItem('g_auto_enabled') === 'true';
      const next = !isAutoActive;
      localStorage.setItem('g_auto_enabled', next.toString());
      this.notifySettingsChanged('g_auto_enabled', next.toString());
      await this.updateDisplay(true);
      return;
    }

    if (this.selectedIndex < this.files.length - 1) {
      this.selectedIndex++;
    } else {
      this.selectedIndex = 0;
    }
    // Update display (includes header/timestamp in both NORMAL and AR mode)
    await this.updateDisplay();
  }

  async onScrollUp() {
    // In AR mode, scroll toggles the auto mode (only if phone allows it)
    if (this.viewMode === GlassViewMode.AR) {
      const isAutoAllowed = localStorage.getItem('g_auto_allowed') === 'true';
      if (!isAutoAllowed) {
        // M:lck - cannot toggle; just refresh the display to confirm state
        await this.updateDisplay(true);
        return;
      }
      const isAutoActive = localStorage.getItem('g_auto_enabled') === 'true';
      const next = !isAutoActive;
      localStorage.setItem('g_auto_enabled', next.toString());
      this.notifySettingsChanged('g_auto_enabled', next.toString());
      await this.updateDisplay(true);
      return;
    }

    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    } else {
      this.selectedIndex = this.files.length - 1;
    }
    await this.updateDisplay();
  }

  // openSelectedFile: shared logic for file open (called from both onClick and onListSelect)
  private async openSelectedFile() {
    const file = this.files[this.selectedIndex];
    await this.navigate(new LoadingPage(`Loading:\n${this.truncateName(file.name, 47)}`));

    const content = await this.onFileSelected(file);
    localStorage.setItem('g_last_page_type', 'reader');

    const readerPage = new ReaderPage(
      this.files,
      this.selectedIndex,
      content,
      this,
      this.onFileSelected,
      false
    );
    // Case 1: First navigate
    await this.navigate(readerPage);

    // Give the bridge some time to settle
    await new Promise(resolve => setTimeout(resolve, 800));

    // Case 2: Second navigate (the "magic" render that makes it visible on hardware)
    await this.navigate(readerPage);
  }

  // onClick: called via textEvent (TextContainer tap) in NORMAL mode
  async onClick() {
    if (this.viewMode !== GlassViewMode.NORMAL) return;
    await this.openSelectedFile();
  }

  // onListSelect: called via listEvent (ListContainer tap) in NORMAL mode
  async onListSelect() {
    if (this.viewMode !== GlassViewMode.NORMAL) return;
    await this.openSelectedFile();
  }
}
