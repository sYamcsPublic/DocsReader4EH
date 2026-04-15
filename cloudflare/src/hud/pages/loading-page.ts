import {
  TextContainerProperty,
} from "@evenrealities/even_hub_sdk";
import { BasePage, type PageRenderResult } from "../page-manager";

export class LoadingPage extends BasePage {
  private message: string;

  constructor(message: string = "Loading content...\nPlease wait.") {
    super();
    this.message = message;
    this.pageType = "LoadingPage";
  }

  render(): PageRenderResult {
    return {
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 0,
          containerID: 1,
          containerName: "loading-text",
          isEventCapture: 1,
          content: this.message,
        }),
      ],
    };
  }
}
