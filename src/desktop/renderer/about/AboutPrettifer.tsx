import { useEffect, useRef } from "react";

import type { AppInfoState } from "../state/app-state.js";
import styles from "./AboutPrettifer.module.css";

interface AboutPrettiferProps {
  readonly isOpen: boolean;
  readonly appInfo: AppInfoState;
  readonly onClose: () => void;
}

const REPOSITORY_URL = "https://github.com/jjj5306/Prettifer";

/**
 * What Prettifer is and which build is running. A native dialog carries the modal
 * behaviour the screen needs — the first focus, Escape and returning focus to the
 * control that opened it — so none of that is rebuilt here. Closing always goes
 * through the element, so the one `close` event reports every way out.
 */
export const AboutPrettifer = ({ isOpen, appInfo, onClose }: AboutPrettiferProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    }
    if (!isOpen && dialog.open) {
      dialog.close();
    }
    return undefined;
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="about-prettifer-heading"
      onClose={onClose}
    >
      <h2 id="about-prettifer-heading">About Prettifer</h2>
      <p className={styles.tagline}>
        Review the commits you choose as one diff, without touching the working tree.
      </p>
      <dl className={styles.facts}>
        <dt>Version</dt>
        <dd>{versionLabel(appInfo)}</dd>
        <dt>Repository</dt>
        <dd>{REPOSITORY_URL}</dd>
      </dl>
      <button
        type="button"
        onClick={() => { dialogRef.current?.close(); }}
      >
        Close
      </button>
    </dialog>
  );
};

/**
 * The rest of the screen stands on its own, so a version that could not be read
 * says so instead of leaving the reader with an empty line.
 */
function versionLabel(appInfo: AppInfoState): string {
  switch (appInfo.status) {
    case "ready":
      return appInfo.version;
    case "loading":
      return "Reading…";
    case "error":
      return "Not available";
    case "idle":
      return "Not available";
  }
}
