import { BasePage, type PageRenderResult } from "../page-manager";

export class MessagePage extends BasePage {
  constructor(private message: string) {
    super();
    this.pageType = "MessagePage";
  }

  render(): PageRenderResult {
    return {
      containerTotalNum: 1,
      textObject: [
        {
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          content: this.message,
          containerID: 1,
          containerName: "message",
        },
      ],
    };
  }
}
