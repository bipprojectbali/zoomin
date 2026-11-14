import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { LobbyPage } from "./pages/LobbyPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SessionProvider } from "./session.context";

/**
 * Room & undangan (keduanya menarik livekit-client lewat PreJoin) dimuat saat dibuka saja, supaya login/lobby ringan
 * (QA-12). Catatan: bundling HTML import saat runtime (Bun 1.4.2) belum memecah chunk; pemisahan baru terjadi bila
 * client di-prebuild dengan `bun build --splitting`. Tanpa itu lazy() tetap aman (satu chunk, resolve seketika).
 */
const RoomPage = lazy(() => import("./pages/RoomPage").then((m) => ({ default: m.RoomPage })));
const InvitePage = lazy(() => import("./pages/InvitePage").then((m) => ({ default: m.InvitePage })));

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
          <Route
            path="/invite/:invite"
            element={
              <Suspense fallback={<RouteLoading />}>
                <InvitePage />
              </Suspense>
            }
          />
          <Route
            path="/rooms/:roomId"
            element={
              <Suspense fallback={<RouteLoading />}>
                <RoomPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
    {/* top-center: tidak menabrak toolbar kontrol di bawah layar room. */}
    <Toaster position="top-center" />
  </StrictMode>,
);

function RouteLoading() {
  return (
    <p className="flex min-h-svh items-center justify-center text-muted-foreground" role="status">
      Memuat…
    </p>
  );
}
