import { applicationUrlsMatch } from "./application-url.js";

interface NavigationEvent {
  preventDefault(): void;
}

interface GuardedWebContents {
  setWindowOpenHandler(handler: () => { readonly action: "deny" }): void;
  on(
    event: "will-navigate",
    listener: (event: NavigationEvent, url: string) => void,
  ): void;
}

interface PermissionSession {
  setPermissionCheckHandler(handler: () => boolean): void;
  setPermissionRequestHandler(
    handler: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void,
  ): void;
}

interface ResponseDetails {
  readonly responseHeaders?: Readonly<Record<string, readonly string[]>>;
}

interface ResponseOverride {
  readonly responseHeaders: Readonly<Record<string, readonly string[]>>;
}

export function createMainWindowOptions(preload: string) {
  return {
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    show: false,
    backgroundColor: "#08101d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload,
      sandbox: true,
      webviewTag: false,
    },
  } as const;
}

export function getContentSecurityPolicy(
  isDevelopment: boolean,
  applicationUrl?: string,
): string {
  const script = isDevelopment
    ? "script-src 'self' 'unsafe-eval'"
    : "script-src 'self'";
  let connect = "connect-src 'self'";
  if (isDevelopment && applicationUrl !== undefined) {
    const origin = new URL(applicationUrl).origin;
    const webSocketOrigin = origin.replace(/^http/u, "ws");
    connect = `${connect} ${origin} ${webSocketOrigin}`;
  }
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    connect,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function configureWindowGuards(
  webContents: GuardedWebContents,
  applicationUrl: string,
): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event, url) => {
    if (!applicationUrlsMatch(url, applicationUrl)) {
      event.preventDefault();
    }
  });
}

export function configurePermissionGuards(permissionSession: PermissionSession): void {
  permissionSession.setPermissionCheckHandler(() => false);
  permissionSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

export function applyContentSecurityPolicy(
  isDevelopment: boolean,
  details: ResponseDetails,
  callback: (override: ResponseOverride) => void,
  applicationUrl?: string,
): void {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      "Content-Security-Policy": [
        getContentSecurityPolicy(isDevelopment, applicationUrl),
      ],
    },
  });
}
