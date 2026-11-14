import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { InvitePage } from "./pages/InvitePage";
import { LobbyPage } from "./pages/LobbyPage";
import { LoginPage } from "./pages/LoginPage";
import { RoomPage } from "./pages/RoomPage";

const root = document.getElementById("root");
if (!root) throw new Error("main.tsx: elemen #root tidak ditemukan di index.html");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:invite" element={<InvitePage />} />
        <Route path="/rooms/:roomId" element={<RoomPage />} />
      </Routes>
    </BrowserRouter>
    <Toaster />
  </StrictMode>,
);
