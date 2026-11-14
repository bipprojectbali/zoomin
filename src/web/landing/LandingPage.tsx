import type { SessionUser } from "../../shared/api.types";
import { SECTION_IDS } from "./landing.copy";
import { LandingFaq, LandingFinalCta, LandingFooter } from "./LandingClosing";
import { LandingHero } from "./LandingHero";
import { LandingNav } from "./LandingNav";
import { LandingFeatures, LandingSteps, LandingUseCases } from "./LandingSections";

export { LANDING_META } from "./landing.copy";

/** User yang sedang login (dari sesi router); null/undefined = tamu atau sesi belum diketahui. */
export type LandingViewer = Pick<SessionUser, "name" | "image"> | null | undefined;

/** Landing page publik di `/` (statis, tanpa panggilan API); `viewer` hanya mengganti CTA Masuk → Buka aplikasi. */
export default function LandingPage({ viewer }: { viewer?: LandingViewer }) {
  return (
    <div id={SECTION_IDS.top} data-testid="landing" className="min-h-dvh bg-background">
      <LandingNav viewer={viewer} />
      <main id={SECTION_IDS.main} tabIndex={-1}>
        <LandingHero signedIn={!!viewer} />
        <LandingFeatures />
        <LandingSteps />
        <LandingUseCases />
        <LandingFaq />
        <LandingFinalCta signedIn={!!viewer} />
      </main>
      <LandingFooter signedIn={!!viewer} />
    </div>
  );
}
