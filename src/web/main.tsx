import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { InvitePage } from "./pages/InvitePage";
import { LobbyPage } from "./pages/LobbyPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RoomPage } from "./pages/RoomPage";
import { SessionProvider } from "./session.context";

const root = document.getElementById("root");
if (!root) throw new Error("main.tsx: elemen #root tidak ditemukan di index.html");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      {/* Satu provider global: sesi tidak di-fetch ulang tiap pindah halaman. */}
      <SessionProvider>
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite/:invite" element={<InvitePage />} />
          <Route path="/rooms/:roomId" element={<RoomPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
    {/* top-center: tidak menabrak toolbar kontrol di bawah layar room. */}
    <Toaster position="top-center" />
  </StrictMode>,
);
