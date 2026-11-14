import { LogIn } from "lucide-react";
import { AppBrand } from "@/app.brand";
import { UserAvatar } from "@/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { APP_HREF, LOGIN_HREF, NAV, SECTION_IDS } from "./landing.copy";
import type { LandingViewer } from "./LandingPage";

/** Header sticky: skip link, brand, anchor section, tombol Masuk (tamu) / Buka aplikasi (login). */
export function LandingNav({ viewer }: { viewer?: LandingViewer }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <a
        href={`#${SECTION_IDS.main}`}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        {NAV.skip}
      </a>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href={`#${SECTION_IDS.top}`} className="rounded-lg">
          <AppBrand />
        </a>
        <nav aria-label={NAV.label} className="hidden md:block">
          <ul className="flex gap-1">
            {NAV.links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* min-w: reservasi lebar agar pergantian Masuk → Buka aplikasi setelah sesi diketahui tidak menggeser layout. */}
        {viewer ? (
          <Button asChild size="sm" className="ml-auto min-w-36">
            <a href={APP_HREF} data-testid="landing-nav-app">
              <UserAvatar user={viewer} className="-ml-1 size-5" />
              {NAV.app}
            </a>
          </Button>
        ) : (
          <Button asChild size="sm" className="ml-auto min-w-36">
            <a href={LOGIN_HREF}>
              <LogIn aria-hidden="true" />
              {NAV.login}
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}
