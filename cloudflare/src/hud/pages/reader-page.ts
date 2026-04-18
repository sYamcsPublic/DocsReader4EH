import {
  TextContainerProperty,
  TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import { BasePage, type PageRenderResult, GlassViewMode } from "../page-manager";
import { LoadingPage } from "./loading-page";

const VISIBLE_LINES_LIMIT = 9; // Lines 2 to 10 (Header takes 1)
const MAX_LINE_WIDTH = 56;     // Keep at 56 to prevent body text overflow and hardware auto-wrap conflicts

function getReadingPositions(): Record<string, number> {
  try {
    const data = localStorage.getItem('g_reading_positions');
    return data ? JSON.parse(data) : {};
  } catch (e) {
    console.error("Failed to parse g_reading_positions", e);
    return {};
  }
}

export interface GoogleFileShort {
  id: string;
  name: string;
}

export class ReaderPage extends BasePage {
  private static readonly ID_HEADER_DATE = 1;
  private static readonly ID_HEADER_BATT = 2;
  private static readonly ID_BODY = 3;
  private static readonly ID_HEADER_MODE = 4;

  // Static config for auto-scroll speed (seconds)
  public static autoScrollSpeed: number = 20;

  private allFiles: GoogleFileShort[];
  private currentFileIndex: number;
  private pages: string[];
  private currentPageIndex: number;
  private listPage: BasePage;
  private onFileSelected: (file: any) => Promise<string>;

  private static isAutoMode: boolean = false;
  private remainingSeconds: number = 0;
  private lastTickTime: number = 0;
  private userHasScrolled: boolean = false;


  constructor(
    allFiles: GoogleFileShort[],
    currentIndex: number,
    content: string,
    listPage: BasePage,
    onFileSelected: (file: any) => Promise<string>
  ) {
    super();
    this.allFiles = allFiles;
    this.currentFileIndex = currentIndex;
    this.listPage = listPage;
    this.onFileSelected = onFileSelected;

    const file = allFiles[currentIndex];
    this.pages = this.paginate(content || "No content found.");

    const positions = getReadingPositions();
    const storedVal = positions[file.id] || 0;

    if (storedVal > 1.1) {
      // Old format (page index). Use as is.
      this.currentPageIndex = Math.min(Math.round(storedVal), this.pages.length - 1);
      this.userHasScrolled = true; // Mark as scrolled to allow overwriting old page index with ratio later
    } else {
      // New format (ratio)
      const ratio = (this.isCacheEnabled && storedVal <= 1.1) ? storedVal : 0;
      this.currentPageIndex = Math.round(ratio * (this.pages.length - 1));
      this.userHasScrolled = false;
    }
    // Determine initial mode from settings
    const isAutoEnabled = localStorage.getItem('g_auto_enabled') === 'true';
    ReaderPage.isAutoMode = isAutoEnabled;
    this.remainingSeconds = ReaderPage.autoScrollSpeed;
    this.lastTickTime = Date.now();

    if (this.currentPageIndex >= this.pages.length) this.currentPageIndex = Math.max(0, this.pages.length - 1);
    this.pageType = "ReaderPage";
    localStorage.setItem('g_last_page_type', 'reader');
  }


  private wrapLine(text: string): string[] {
    if (!text) return [""];
    const lines: string[] = [];
    let currentLine = "";
    let currentWidth = 0;

    const isHalfWidthAlphaSym = (char: string) => {
      // Check for half-width alphanumeric and symbols (ASCII 33-126)
      return char >= '\u0021' && char <= '\u007e';
    };

    for (const char of text) {
      const w = this.getCharWidth(char);
      if (currentWidth + w > MAX_LINE_WIDTH + 0.01) {
        let splitPos = currentLine.length;

        // If current character and last character of currentLine are both alpha-sym,
        // backtrack to the last non-alpha-sym character to avoid breaking words.
        if (currentLine.length > 0 && isHalfWidthAlphaSym(currentLine[currentLine.length - 1]) && isHalfWidthAlphaSym(char)) {
          for (let j = currentLine.length - 1; j >= 0; j--) {
            if (!isHalfWidthAlphaSym(currentLine[j])) {
              splitPos = j + 1;
              break;
            }
          }
        }

        if (splitPos > 0 && splitPos < currentLine.length) {
          const finishedLine = currentLine.substring(0, splitPos);
          const remaining = currentLine.substring(splitPos);
          lines.push(finishedLine);
          currentLine = remaining + char;
          // Recalculate width for the new line starting with backtracked text
          currentWidth = 0;
          for (const c of currentLine) {
            currentWidth += this.getCharWidth(c);
          }
        } else {
          // Standard break if no suitable split point is found
          lines.push(currentLine);
          currentLine = char;
          currentWidth = w;
        }
      } else {
        currentLine += char;
        currentWidth += w;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  private paginate(text: string): string[] {
    // Normalize text: 2+ empty lines -> 1 empty line
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    const rawLines = normalizedText.split("\n");

    // Convert to visual lines using width-based wrapping
    let allVisualLines: string[] = [];
    for (const line of rawLines) {
      if (line === "") {
        allVisualLines.push("");
      } else {
        allVisualLines = allVisualLines.concat(this.wrapLine(line));
      }
    }

    const pages: string[] = [];
    let currentPage: string[] = [];

    for (const line of allVisualLines) {
      // Avoid empty line at very top of a page
      if (currentPage.length === 0 && line.trim() === "") continue;

      currentPage.push(line);

      if (currentPage.length === VISIBLE_LINES_LIMIT) {
        pages.push(currentPage.join("\n"));
        currentPage = [];
      }
    }

    if (currentPage.length > 0) {
      // Trim trailing empty lines
      while (currentPage.length > 0 && currentPage[currentPage.length - 1].trim() === "") {
        currentPage.pop();
      }
      if (currentPage.length > 0) {
        pages.push(currentPage.join("\n"));
      }
    }

    return pages.length > 0 ? pages : ["(No content)"];
  }

  private getHeaderText(): string {
    const MAX_HEADER_WIDTH = 32; // Standard width limit for 380-wide header (approx units)
    const file = this.allFiles[this.currentFileIndex];
    const pageInfo = ` (${this.currentPageIndex + 1}/${this.pages.length})`;
    const ratio = this.pages.length > 1 ? this.currentPageIndex / (this.pages.length - 1) : 1;
    const ratioStr = ` [${(ratio * 100).toFixed(1)}%]`;
    const suffix = `${ratioStr}${pageInfo}`;

    // Calculate suffix width to find available space for name
    let suffixWidth = 0;
    for (const char of suffix) suffixWidth += this.getCharWidth(char);

    const ellipsisWidth = this.getCharWidth('.') * 3;
    const availableNameWidth = MAX_HEADER_WIDTH - suffixWidth;

    // Fast return if everything fits
    let totalNameWidth = 0;
    for (const char of file.name) totalNameWidth += this.getCharWidth(char);
    if (totalNameWidth + suffixWidth <= MAX_HEADER_WIDTH) return `${file.name}${suffix}`;

    // Truncate name
    let currentWidth = 0;
    let name = "";
    for (const char of file.name) {
      const w = this.getCharWidth(char);
      if (currentWidth + w > availableNameWidth - ellipsisWidth) break;
      name += char;
      currentWidth += w;
    }

    return `${name}...${suffix}`;
  }

  private getBodyText(): string {
    return this.pages[this.currentPageIndex] || "";
  }

  private getModeText(): string {
    // M:lck when phone has not allowed Auto Mode
    const isAutoAllowed = localStorage.getItem('g_auto_allowed') === 'true';
    if (!isAutoAllowed) return "M:lck";
    if (!ReaderPage.isAutoMode) return "M";
    return `A:${this.remainingSeconds}s`;
  }

  private getCacheText(): string {
    return this.isCacheEnabled ? "C" : "NC";
  }

  private getCacheBattText(): string {
    const cache = this.getCacheText();
    const batt = this.getBatteryText();
    const pad = cache === "C" ? "       " : "     ";
    return `${cache}${pad}${batt}`;
  }

  private getBatteryText(): string {
    return `${this.batteryLevel}%`;
  }

  render(): PageRenderResult {
    return {
      containerTotalNum: 4,
      textObject: [
        new TextContainerProperty({
          xPosition: 4,
          yPosition: 2,
          width: 380,
          height: 28,
          borderWidth: 0,
          containerID: ReaderPage.ID_HEADER_DATE,
          containerName: "reader-hdr-main",
          isEventCapture: 0,
          content: this.getHeaderText(),
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
          containerID: ReaderPage.ID_BODY,
          containerName: "reader-body",
          isEventCapture: 1,
          content: this.getBodyText(),
        }),
        new TextContainerProperty({
          xPosition: 390,
          yPosition: 2,
          width: 83,
          height: 28,
          borderWidth: 0,
          containerID: ReaderPage.ID_HEADER_MODE,
          containerName: "reader-hdr-mode",
          isEventCapture: 0,
          content: this.getModeText(),
        }),
        new TextContainerProperty({
          xPosition: 474,
          yPosition: 2,
          width: 98,
          height: 28,
          borderWidth: 0,
          containerID: ReaderPage.ID_HEADER_BATT,
          containerName: "reader-hdr-batt",
          isEventCapture: 0,
          content: this.getCacheBattText(),
        }),
      ],
    };
  }

  async updateDisplay(forceBattery: boolean = false) {
    if (!this.isActive) return;

    if (forceBattery) {
      await this.refreshBattery(true);
    }

    // Upgrade header
    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: ReaderPage.ID_HEADER_DATE,
      containerName: "reader-hdr-main",
      contentOffset: 0,
      contentLength: 100,
      content: this.getHeaderText(),
    }));

    if (!this.isActive) return;

    // Upgrade body
    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: ReaderPage.ID_BODY,
      containerName: "reader-body",
      contentOffset: 0,
      contentLength: 1000,
      content: this.getBodyText(),
    }));

    if (!this.isActive) return;

    // Upgrade mode
    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: ReaderPage.ID_HEADER_MODE,
      containerName: "reader-hdr-mode",
      contentOffset: 0,
      contentLength: 40,
      content: this.getModeText(),
    }));

    if (!this.isActive) return;

    // Upgrade batt
    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: ReaderPage.ID_HEADER_BATT,
      containerName: "reader-hdr-batt",
      contentOffset: 0,
      contentLength: 30,
      content: this.getCacheBattText(),
    }));

    const file = this.allFiles[this.currentFileIndex];
    const ratio = this.pages.length > 1 ? this.currentPageIndex / (this.pages.length - 1) : 1;

    const positions = getReadingPositions();
    positions[file.id] = ratio;

    localStorage.setItem('g_last_file_id', file.id);
    localStorage.setItem('g_reading_positions', JSON.stringify(positions));
    localStorage.setItem('g_last_updated', new Date().toLocaleString());
  }

  async onBatteryUpdate(_level: number): Promise<void> {
    if (!this.isActive) return;
    await this.updateDisplay();
  }

  async afterRender() {
    await this.updateDisplay();
  }


  async onScrollUp() {
    // In AR mode, scroll toggles the scroll mode
    if (this.viewMode === GlassViewMode.AR) {
      await this.toggleModeAndRefresh();
      return;
    }

    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.userHasScrolled = true;
      this.remainingSeconds = ReaderPage.autoScrollSpeed; // Reset timer
      await this.updateDisplay();
      await this.savePosition();
    } else {
      // Jump to previous file (circular)
      let prevIndex = (this.currentFileIndex - 1 + this.allFiles.length) % this.allFiles.length;
      this.remainingSeconds = ReaderPage.autoScrollSpeed;
      await this.loadNewFile(prevIndex, true);
    }
  }

  async onScrollDown() {
    // In AR mode, scroll toggles the scroll mode
    if (this.viewMode === GlassViewMode.AR) {
      await this.toggleModeAndRefresh();
      return;
    }

    if (this.currentPageIndex < this.pages.length - 1) {
      this.currentPageIndex++;
      this.userHasScrolled = true;
      this.remainingSeconds = ReaderPage.autoScrollSpeed; // Reset timer
      await this.updateDisplay();
      await this.savePosition();
    } else {
      // Jump to next file (circular)
      let nextIndex = (this.currentFileIndex + 1) % this.allFiles.length;
      this.remainingSeconds = ReaderPage.autoScrollSpeed;
      await this.loadNewFile(nextIndex, false);
    }
  }


  private async loadNewFile(index: number, startAtEnd: boolean) {

    const file = this.allFiles[index];
    localStorage.setItem('g_last_file_id', file.id);
    await this.navigate(new LoadingPage(`Loading:\n${file.name}`));

    try {
      const content = await this.onFileSelected(file);
      // Removed isActive check here because navigate(LoadingPage) deactivates this instance.
      // We want to proceed and reactivate via navigate(this) below.

      this.currentFileIndex = index;
      this.pages = this.paginate(content || "No content found.");
      this.currentPageIndex = startAtEnd ? this.pages.length - 1 : 0;

      // Save initial position for the new file (ratio-only)
      const ratio = this.pages.length > 1 ? this.currentPageIndex / (this.pages.length - 1) : 1;
      const positions = getReadingPositions();
      positions[file.id] = ratio;
      localStorage.setItem('g_last_file_id', file.id);
      localStorage.setItem('g_reading_positions', JSON.stringify(positions));

      localStorage.setItem('g_last_page_type', 'reader');
      localStorage.setItem('g_last_updated', new Date().toLocaleString());

      // Case 1: First navigate
      await this.navigate(this);

      // Give the bridge some time to settle
      await new Promise(resolve => setTimeout(resolve, 800));

      // Case 2: Second navigate (the "magic" render that makes it visible on hardware)
      await this.navigate(this);
    } catch (err) {

      console.error("Failed to load file", err);
      localStorage.setItem('g_last_page_type', 'list');
      await this.navigate(this.listPage);
    }
  }

  async onClick() {
    // Single tap in AR mode: update display (handled by PageManager calling updateDisplay)
    if (this.viewMode === GlassViewMode.AR) {
      return;
    }
    return;
  }


  private async toggleModeAndRefresh() {
    // Cannot toggle if phone has not allowed Auto Mode
    const isAutoAllowed = localStorage.getItem('g_auto_allowed') === 'true';
    if (!isAutoAllowed) {
      await this.updateDisplay();
      return;
    }

    const nextMode = !ReaderPage.isAutoMode;
    localStorage.setItem('g_auto_enabled', nextMode.toString());
    this.notifySettingsChanged('g_auto_enabled', nextMode.toString());

    ReaderPage.isAutoMode = nextMode;
    if (nextMode) {
      this.remainingSeconds = ReaderPage.autoScrollSpeed;
      this.lastTickTime = Date.now();
    }
    await this.updateDisplay();
  }


  async onAutoTick() {
    if (!this.isActive || !ReaderPage.isAutoMode) {
      return;
    }

    // Special check for Global Settings (e.g. if disabled from Smartphone UI)
    const isAutoAllowed = localStorage.getItem('g_auto_allowed') === 'true';
    const isAutoEnabled = localStorage.getItem('g_auto_enabled') === 'true';
    if (!isAutoAllowed || !isAutoEnabled) {
      ReaderPage.isAutoMode = false;
      await this.updateDisplay();
      return;
    }

    const now = Date.now();
    const elapsed = Math.floor((now - this.lastTickTime) / 1000);

    if (elapsed >= 1) {
      this.remainingSeconds -= elapsed;
      this.lastTickTime += elapsed * 1000;

      if (this.remainingSeconds <= 0) {
        // Time to move!
        if (this.currentPageIndex < this.pages.length - 1) {
          this.currentPageIndex++;
          this.userHasScrolled = true;
          this.remainingSeconds = ReaderPage.autoScrollSpeed;
          await this.updateDisplay();
          await this.savePosition();
        } else {
          // Next file in auto mode
          let nextIndex = (this.currentFileIndex + 1) % this.allFiles.length;
          this.remainingSeconds = ReaderPage.autoScrollSpeed;
          await this.loadNewFile(nextIndex, false);
        }
      } else {
        // Just update the countdown
        await this.updateDisplay();
      }
    } else if (this.viewMode === GlassViewMode.AR) {
      // Periodic update for AR Mode specifically to keep time/battery current
      await this.updateDisplay();
    }
  }

  async onDoubleClick() {
    // console.log(`[render-page.ts]onDoubleClick start`);
    ReaderPage.isAutoMode = false; // Ensure auto mode is cleared to avoid CLICK sequence conflict
    localStorage.setItem('g_auto_mode_active', 'false');
    // Sync selected index back to list
    if ((this.listPage as any).setSelectedIndex) {
      (this.listPage as any).setSelectedIndex(this.currentFileIndex);
    }
    localStorage.setItem('g_last_page_type', 'list');

    console.log(`[render-page.ts]onDoubleClick navigate(listPage) before`);

    // Case 1: First navigate
    await this.navigate(this.listPage);

    // Give the bridge some time to settle
    await new Promise(resolve => setTimeout(resolve, 800));

    // Case 2: Second navigate (the "magic" render that makes it visible on hardware)
    await this.navigate(this.listPage);

    console.log(`[render-page.ts]onDoubleClick navigate(listPage) after`);
  }

  onDeactivate() {
    console.log(`[ReaderPage] Deactivating instance.`);
    this.savePosition();
    super.onDeactivate();
  }

  private async savePosition() {
    if (!this.isActive) return;
    // In NC mode, only save if explicitly scrolled/moved
    if (!this.isCacheEnabled && !this.userHasScrolled) return;

    const file = this.allFiles[this.currentFileIndex];
    if (!file || !file.id) return;
    const ratio = this.pages.length > 1 ? this.currentPageIndex / (this.pages.length - 1) : 0;
    const positions = getReadingPositions();
    positions[file.id] = ratio;
    localStorage.setItem('g_reading_positions', JSON.stringify(positions));
  }
}
