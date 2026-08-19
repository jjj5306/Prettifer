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
 * control that opened it — so none of that is rebuilt here.
 */
export const AboutPrettifer = ({ isOpen, appInfo, onClose }: AboutPrettiferProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /*
   * Read through a ref so the listeners below stay attached for the element's
   * whole life instead of being replaced on every render.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return undefined;
    }
    /*
     * Escape is answered here instead of by the element, because the element
     * closes first and reports it in a later task. Between those two moments the
     * state would still say the screen is open, and a request to open it again
     * would change nothing and leave the screen closed for good. Refusing the
     * element's own close keeps the state the only thing that decides.
     */
    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onCloseRef.current();
    };
    /*
     * A close the element started anyway still has to reach the state. The report
     * arrives a task late, so a screen already opened again by then is left alone:
     * otherwise this stale report would close what the reader just opened.
     */
    const handleClose = (): void => {
      if (!dialog.open) {
        onCloseRef.current();
      }
    };
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, []);

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
      <button type="button" onClick={onClose}>Close</button>
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
