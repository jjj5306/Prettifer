import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// jsdom does not implement pointer capture, which drag interactions rely on.
if (typeof Element !== "undefined") {
  const elementPrototype: Partial<Element> = Element.prototype;
  if (elementPrototype.setPointerCapture === undefined) {
    elementPrototype.setPointerCapture = function setPointerCapture() { /* no-op */ };
    elementPrototype.releasePointerCapture = function releasePointerCapture() { /* no-op */ };
    elementPrototype.hasPointerCapture = function hasPointerCapture() { return false; };
  }
}

/*
 * jsdom has no modal dialog behaviour. Only opening, closing and the close event
 * are stood in for, so a test can drive the wiring; Escape and the focus trap
 * belong to the browser and are checked in the Electron run instead.
 */
if (typeof HTMLDialogElement !== "undefined") {
  const dialogPrototype: Partial<HTMLDialogElement> = HTMLDialogElement.prototype;
  if (dialogPrototype.showModal === undefined) {
    dialogPrototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    dialogPrototype.close = function close(this: HTMLDialogElement) {
      if (this.open) {
        this.open = false;
        this.dispatchEvent(new Event("close"));
      }
    };
  }
}

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});
