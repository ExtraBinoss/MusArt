import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts.css";
import { Studio } from "./bootstrap/Studio";
const root = document.getElementById("root");
if (!root) throw new Error("Point de montage #root absent.");
createRoot(root).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
