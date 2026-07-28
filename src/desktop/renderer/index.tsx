import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/hanken-grotesk";

import { App } from "./App.js";

const rootElement = document.querySelector("#root");
if (rootElement === null) {
  throw new Error("The Prettifer root element is unavailable.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
