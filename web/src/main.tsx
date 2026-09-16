import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ArticlePage } from "@/pages/Article";
import { Backoffice } from "@/pages/Backoffice";
import { Contents } from "@/pages/Contents";
import { Demo } from "@/pages/Demo";
import { Landing } from "@/pages/Landing";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/conteudos" element={<Contents />} />
          <Route path="/conteudos/:slug" element={<ArticlePage />} />
          <Route path="/app/:slug" element={<Backoffice />} />
          <Route path="/demo/:slug" element={<Demo />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
