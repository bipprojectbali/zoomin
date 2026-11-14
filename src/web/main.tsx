import { lazy, StrictMode, Suspense, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { LandingRoute } from "@/app/LandingRoute";
import { RouteLoading } from "@/app/RouteLoading";
import { Toaster } from "@/components/ui/sonner";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireRole, RequireSession, SessionProvider } from "./session.context";

/**
 * Halaman berat dimuat saat dibuka (QA-12): room/undangan menarik livekit-client, admin/dev/settings jarang dibuka.
 * Catatan: bundling HTML import saat runtime (Bun 1.4.2) belum memecah chunk; pemisahan baru terjadi bila client
 * di-prebuild dengan `bun build --splitting`. Tanpa itu lazy() tetap aman (satu chunk, resolve seketika).
 */
const LobbyPage = lazy(() => import("./pages/LobbyPage").then((m) => ({ default: m.LobbyPage })));
const RoomPage = lazy(() => import("./pages/RoomPage").then((m) => ({ default: m.RoomPage })));
const InvitePage = lazy(() => import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const DevPage = lazy(() => import("./pages/DevPage"));

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<RouteLoading />}>{children}</Suspense>;

const root = document.getElementById("root");
if (!root) throw new Error("main.tsx: elemen #root tidak ditemukan di index.html");

// Rute A10 (RND/plan/05-auth-roles.md).
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      {/* Satu provider global: sesi tidak di-fetch ulang tiap pindah halaman. */}
      <SessionProvider>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<RequireSession><Lazy><LobbyPage /></Lazy></RequireSession>} />
          <Route path="/rooms/:roomId" element={<RequireSession><Lazy><RoomPage /></Lazy></RequireSession>} />
          <Route path="/invite/:invite" element={<Lazy><InvitePage /></Lazy>} />
          <Route path="/settings" element={<RequireSession><Lazy><SettingsPage /></Lazy></RequireSession>} />
          <Route path="/admin" element={<RequireRole min="admin"><Lazy><AdminPage /></Lazy></RequireRole>} />
          <Route path="/dev" element={<RequireRole min="super_admin"><Lazy><DevPage /></Lazy></RequireRole>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
    {/* top-center: tidak menabrak toolbar kontrol di bawah layar room. */}
    <Toaster position="top-center" />
  </StrictMode>,
);
