import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LeadershipApp from "./LeadershipApp";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LeadershipApp />
  </StrictMode>,
);
