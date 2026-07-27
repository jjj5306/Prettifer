import { contextBridge, ipcRenderer } from "electron";

import { createDesktopApi } from "./desktop-api.js";

const desktopApi = createDesktopApi((channel, input) =>
  input === undefined ? ipcRenderer.invoke(channel) : ipcRenderer.invoke(channel, input),
);

contextBridge.exposeInMainWorld("prettifer", desktopApi);
