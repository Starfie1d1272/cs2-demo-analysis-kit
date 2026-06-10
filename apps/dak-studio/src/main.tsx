import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@cs2dak/react/theme.css";
import "./studio.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
