import type { IpcMain, IpcMainInvokeEvent } from "electron";

import { DESKTOP_CHANNELS } from "../shared/index.js";
import type {
  createDesktopRequestHandlers,
  DesktopInvokeEvent,
} from "./desktop-request-handlers.js";

type DesktopRequestHandlers = ReturnType<typeof createDesktopRequestHandlers>;

export function registerDesktopRequestHandlers(
  ipcMain: Pick<IpcMain, "handle" | "removeHandler">,
  handlers: DesktopRequestHandlers,
): void {
  for (const channel of Object.values(DESKTOP_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(DESKTOP_CHANNELS.selectRepository, (event) =>
    handlers.selectRepository(toDesktopEvent(event)),
  );
  ipcMain.handle(DESKTOP_CHANNELS.openInitialRepository, (event) =>
    handlers.openInitialRepository(toDesktopEvent(event)),
  );
  ipcMain.handle(DESKTOP_CHANNELS.loadRange, (event, input) =>
    handlers.loadRange(toDesktopEvent(event), input),
  );
  ipcMain.handle(DESKTOP_CHANNELS.listCommits, (event, input) =>
    handlers.listCommits(toDesktopEvent(event), input),
  );
  ipcMain.handle(DESKTOP_CHANNELS.composeSelection, (event, input) =>
    handlers.composeSelection(toDesktopEvent(event), input),
  );
  ipcMain.handle(DESKTOP_CHANNELS.cancelComposition, (event, input) =>
    handlers.cancelComposition(toDesktopEvent(event), input),
  );
  ipcMain.handle(DESKTOP_CHANNELS.searchSymbol, (event, input) =>
    handlers.searchSymbol(toDesktopEvent(event), input),
  );
}

export function removeDesktopRequestHandlers(
  ipcMain: Pick<IpcMain, "removeHandler">,
): void {
  for (const channel of Object.values(DESKTOP_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}

function toDesktopEvent(event: IpcMainInvokeEvent): DesktopInvokeEvent {
  return {
    senderId: event.sender.id,
    frameUrl: event.senderFrame?.url ?? "",
  };
}
