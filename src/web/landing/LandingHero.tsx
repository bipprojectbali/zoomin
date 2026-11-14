import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_HREF, HERO, LOGIN_HREF, SECTION_IDS } from "./landing.copy";
import { GoogleMark } from "./GoogleMark";
import { StageMockup } from "./StageMockup";

/** Hero: headline komparasi multi-layar, CTA, dan mockup panggung. */
export function LandingHero({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      {/* Latar grid tipis: mengingatkan pada panggung bertile, murni dekoratif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.3fr] lg:gap-12 lg:pb-24">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
            {HERO.eyebrow}
          </p>
          <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl xl:text-6xl">
            <span className="text-brand">{HERO.titleLead}</span> {HERO.titleRest}
          </h1>
          <p className="mt-5 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">{HERO.sub}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {/* min-w: lebar sama untuk kedua label supaya tidak ada layout shift saat sesi diketahui. */}
            {signedIn ? (
              <Button asChild size="lg" className="h-11 sm:min-w-56">
                <a href={APP_HREF} data-testid="landing-cta-app">
                  {HERO.ctaApp}
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            ) : (
              <Button asChild size="lg" className="h-11 sm:min-w-56">
                <a href={LOGIN_HREF} data-testid="landing-cta-login">
                  <GoogleMark />
                  {HERO.ctaLogin}
                </a>
              </Button>
            )}
            <Button asChild size="lg" variant="outline" className="h-11">
              <a href={`#${SECTION_IDS.how}`}>
                {HERO.ctaHow}
                <ArrowDown aria-hidden="true" />
              </a>
            </Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {HERO.points.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="size-4 text-brand" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:delay-150 motion-safe:duration-700 motion-safe:fill-mode-both">
          <StageMockup />
        </div>
      </div>
    </section>
  );
}
