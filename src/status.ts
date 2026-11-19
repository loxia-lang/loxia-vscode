import * as vscode from "vscode";

export type StatusState = "disabled" | "starting" | "ready" | "stopped" | "error" | "missing-cli";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private enabled = true;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "loxia.restartServer";
    this.item.name = "Loxia language server";
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  set(state: StatusState): void {
    switch (state) {
      case "disabled":
        this.item.text = "$(circle-slash) Loxia";
        this.item.tooltip = "Loxia language server is disabled (loxia.lsp.enabled)";
        break;
      case "starting":
        this.item.text = "$(sync~spin) Loxia";
        this.item.tooltip = "Loxia language server is starting";
        break;
      case "ready":
        this.item.text = "$(check) Loxia";
        this.item.tooltip = "Loxia language server is ready. Click to restart.";
        break;
      case "stopped":
        this.item.text = "$(circle-slash) Loxia";
        this.item.tooltip = "Loxia language server is stopped. Click to start.";
        break;
      case "missing-cli":
        this.item.text = "$(warning) Loxia";
        this.item.tooltip = "The loxia CLI was not found. Click for details.";
        break;
      case "error":
        this.item.text = "$(error) Loxia";
        this.item.tooltip = "Loxia language server failed. Click to restart.";
        break;
    }
    this.setEnabled(this.enabled);
  }

  dispose(): void {
    this.item.dispose();
  }
}
