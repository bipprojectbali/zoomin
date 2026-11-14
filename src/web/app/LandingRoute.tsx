import { lazy, Suspense, useEffect } from "react";
import { LANDING_META } from "@/landing/landing.copy";
import { useSession } from "@/session.context";
import { RouteLoading } from "./RouteLoading";

const LandingPage = lazy(() => import("@/landing/LandingPage"));

/** Pasang/buat `<meta name="description">`; kembalikan isi lama untuk dipulihkan. */
function setMetaDescription(content: string): string | null {
  let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const prev = el?.content ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.name = "description";
    document.head.append(el);
  }
  el.content = content;
  return prev;
}

/** `/`: landing publik (lazy) + meta SEO, selalu tampil (tamu maupun login); sesi hanya mengganti CTA ke `/app`. */
export function LandingRoute() {
  const { user } = useSession();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = LANDING_META.title;
    const prevDesc = setMetaDescription(LANDING_META.description);
    return () => {
      document.title = prevTitle;
      if (prevDesc !== null) setMetaDescription(prevDesc);
      else document.querySelector('meta[name="description"]')?.remove();
    };
  }, []);

  return (
    <Suspense fallback={<RouteLoading />}>
      <LandingPage viewer={user} />
    </Suspense>
  );
}
