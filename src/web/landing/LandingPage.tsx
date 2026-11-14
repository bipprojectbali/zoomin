import { SECTION_IDS } from "./landing.copy";
import { LandingFaq, LandingFinalCta, LandingFooter } from "./LandingClosing";
import { LandingHero } from "./LandingHero";
import { LandingNav } from "./LandingNav";
import { LandingFeatures, LandingSteps, LandingUseCases } from "./LandingSections";

export { LANDING_META } from "./landing.copy";

/** Landing page publik di `/` (statis, tanpa panggilan API). */
export default function LandingPage() {
  return (
    <div id={SECTION_IDS.top} data-testid="landing" className="min-h-dvh bg-background">
      <LandingNav />
      <main id={SECTION_IDS.main} tabIndex={-1}>
        <LandingHero />
        <LandingFeatures />
        <LandingSteps />
        <LandingUseCases />
        <LandingFaq />
        <LandingFinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
