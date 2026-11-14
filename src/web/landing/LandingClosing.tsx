import { ArrowUp, ChevronDown } from "lucide-react";
import { AppBrand } from "@/app.brand";
import { Button } from "@/components/ui/button";
import { FAQ, FINAL_CTA, FOOTER, LOGIN_HREF, NAV, SECTION_IDS } from "./landing.copy";
import { GoogleMark } from "./GoogleMark";
import { Section } from "./LandingSections";

/** FAQ memakai `<details>` native (aksesibel tanpa JS). */
export function LandingFaq() {
  return (
    <Section id={SECTION_IDS.faq} title={FAQ.title}>
      <div className="max-w-3xl divide-y rounded-2xl border">
        {FAQ.items.map((f) => (
          <details key={f.q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium">
              {f.q}
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground motion-safe:transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="pb-4 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/** Ajakan akhir. */
export function LandingFinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-col items-start gap-6 rounded-3xl bg-brand p-8 text-brand-foreground sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="final-cta-title" className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {FINAL_CTA.title}
            </h2>
            <p className="mt-2 opacity-90">{FINAL_CTA.sub}</p>
          </div>
          <Button asChild size="lg" variant="secondary" className="h-11">
            <a href={LOGIN_HREF}>
              <GoogleMark />
              {FINAL_CTA.cta}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** Footer: brand, anchor, © tahun berjalan. */
export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <AppBrand className="text-foreground" />
          <p>
            © {year} {FOOTER.rights}
          </p>
        </div>
        <nav aria-label={FOOTER.label}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV.links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="hover:text-foreground">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a href={LOGIN_HREF} className="hover:text-foreground">
                {NAV.login}
              </a>
            </li>
            <li>
              <a href={`#${SECTION_IDS.top}`} className="inline-flex items-center gap-1 hover:text-foreground">
                {FOOTER.top}
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
