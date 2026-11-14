import { Camera, LayoutTemplate, Move, MonitorUp, Server, UserPlus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { FEATURES, SECTION_IDS, STEPS, USE_CASES } from "./landing.copy";

const FEATURE_ICONS: Record<(typeof FEATURES.items)[number]["icon"], LucideIcon> = {
  screens: MonitorUp,
  layout: LayoutTemplate,
  move: Move,
  camera: Camera,
  invite: UserPlus,
  server: Server,
};

/** Kerangka section: id anchor, heading h2, subjudul opsional. */
export function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16 border-t">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 id={`${id}-title`} className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h2>
        {sub && <p className="mt-3 max-w-2xl text-muted-foreground sm:text-lg">{sub}</p>}
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}

/** Kartu fitur 6 item. */
export function LandingFeatures() {
  return (
    <Section id={SECTION_IDS.features} title={FEATURES.title} sub={FEATURES.sub}>
      <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.items.map((f) => {
          const Icon = FEATURE_ICONS[f.icon];
          return (
            <li key={f.title} className="bg-background p-6 transition-colors hover:bg-muted/50">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Tiga langkah bernomor. */
export function LandingSteps() {
  return (
    <Section id={SECTION_IDS.how} title={STEPS.title} sub={STEPS.sub}>
      <ol className="grid gap-8 md:grid-cols-3 md:gap-6">
        {STEPS.items.map((s, i) => (
          <li key={s.title} className="relative border-l-2 border-brand/40 pl-5 md:border-t-2 md:border-l-0 md:pt-5 md:pl-0">
            <span className="font-mono text-sm text-brand" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Kartu use case dengan tag mono. */
export function LandingUseCases() {
  return (
    <Section id={SECTION_IDS.useCases} title={USE_CASES.title}>
      <ul className="grid gap-4 sm:grid-cols-2">
        {USE_CASES.items.map((u) => (
          <li key={u.title} className="rounded-2xl border bg-card p-6">
            <span className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground">{u.tag}</span>
            <h3 className="mt-4 text-lg font-semibold">{u.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{u.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

