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

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
  }
});
