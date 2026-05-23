import {
  TextContainerProperty,
  TextContainerUpgrade,
} from "@evenrealities/even_hub_sdk";
import { BasePage, type PageRenderResult } from "../page-manager";
import { LoadingPage } from "./loading-page";
import { ReaderPage } from "./reader-page";

export interface GoogleFileForPrompt {
  id: string;
  name: string;
}

/**
 * ResumePromptPage: A dialog-like HUD page displayed on glasses.
 * Asks the user "Resume reading?" with Yes/No options.
 * Uses a smaller bordered container than the normal file list
 * to visually distinguish it as a dialog overlay.
 */
export class ResumePromptPage extends BasePage {
  private static readonly ID_LOADING = 1;
  private static readonly ID_DIALOG = 2;

  private files: GoogleFileForPrompt[];
  private fileIndex: number;
  private onFileSelected: (file: GoogleFileForPrompt) => Promise<string>;
  private listPage: BasePage;
  private selectedOption: 0 | 1 = 0; // 0 = Yes, 1 = No
  private loadingMessage: string;

  constructor(
    files: GoogleFileForPrompt[],
    fileIndex: number,
    onFileSelected: (file: GoogleFileForPrompt) => Promise<string>,
    listPage: BasePage
  ) {
    super();
    this.files = files;
    this.fileIndex = fileIndex;
    this.onFileSelected = onFileSelected;
    this.listPage = listPage;
    this.pageType = "ResumePromptPage";

    const file = this.files[this.fileIndex];
    const truncatedName = file.name.length > 40
      ? file.name.substring(0, 37) + "..."
      : file.name;
    this.loadingMessage = `Loading:\n${truncatedName}`;
  }

  private getDialogText(): string {
    const yesPrefix = this.selectedOption === 0 ? "> " : "  ";
    const noPrefix = this.selectedOption === 1 ? "> " : "  ";

    return [
      "  Resume reading?",
      "",
      `           ${yesPrefix}Yes`,
      `           ${noPrefix}No`,
    ].join("\n");
  }

  render(): PageRenderResult {
    // Dialog container: inset from the normal body area (4,30,572,256)
    // by ~50px on each side for a dialog feel, with larger border radius
    return {
      containerTotalNum: 2,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 0,
          containerID: ResumePromptPage.ID_LOADING,
          containerName: "loading-text",
          isEventCapture: 0,
          content: this.loadingMessage,
        }),
        new TextContainerProperty({
          xPosition: 200,
          yPosition: 70,
          width: 180,
          height: 140,
          borderWidth: 1,
          borderColor: 0xFFFFFFFF,
          borderRadius: 16,
          paddingLength: 4,
          containerID: ResumePromptPage.ID_DIALOG,
          containerName: "resume-dialog",
          isEventCapture: 1,
          content: this.getDialogText(),
        }),
      ],
    };
  }

  private async updateDialogDisplay() {
    if (!this.isActive) return;

    await this.bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: ResumePromptPage.ID_DIALOG,
      containerName: "resume-dialog",
      contentOffset: 0,
      contentLength: 200,
      content: this.getDialogText(),
    }));
  }

  async afterRender() {
    // Initial display is handled by render()
  }

  async onScrollUp() {
    this.selectedOption = this.selectedOption === 0 ? 1 : 0;
    await this.updateDialogDisplay();
  }

  async onScrollDown() {
    this.selectedOption = this.selectedOption === 0 ? 1 : 0;
    await this.updateDialogDisplay();
  }

  async onClick() {
    const resumeFromPosition = this.selectedOption === 0; // Yes = resume
    const file = this.files[this.fileIndex];

    // Truncate name for loading display
    const truncatedName = file.name.length > 40
      ? file.name.substring(0, 37) + "..."
      : file.name;

    await this.navigate(new LoadingPage(`Loading:\n${truncatedName}`));

    try {
      const content = await this.onFileSelected(file);
      localStorage.setItem('g_last_page_type', 'reader');

      const readerPage = new ReaderPage(
        this.files,
        this.fileIndex,
        content,
        this.listPage,
        this.onFileSelected,
        resumeFromPosition ? true : false // explicit resume choice
      );

      // Case 1: First navigate
      await this.navigate(readerPage);

      // Give the bridge some time to settle
      await new Promise(resolve => setTimeout(resolve, 800));

      // Case 2: Second navigate (the "magic" render that makes it visible on hardware)
      await this.navigate(readerPage);
    } catch (err) {
      console.error("Failed to load file from resume prompt", err);
      localStorage.setItem('g_last_page_type', 'list');
      await this.navigate(this.listPage);
    }
  }

  async onDoubleClick() {
    // Double-tap returns to file list
    localStorage.setItem('g_last_page_type', 'list');
    await this.navigate(this.listPage);
    await new Promise(resolve => setTimeout(resolve, 800));
    await this.navigate(this.listPage);
  }
}
