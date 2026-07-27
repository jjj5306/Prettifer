import type { DesktopApi } from "../shared/index.js";

declare global {
  interface Window {
    readonly prettifer: DesktopApi;
  }
}

export {};
