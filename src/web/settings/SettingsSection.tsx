import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Satu blok pengaturan: judul+deskripsi di kiri (desktop) / atas (mobile), isi dalam kartu di kanan. */
export function SettingsSection(props: {
  id: string;
  title: string;
  description: string;
  tone?: "default" | "danger";
  testId?: string;
  children: ReactNode;
}) {
  const { id, title, description, tone = "default", testId, children } = props;
  return (
    <section aria-labelledby={`${id}-title`} id={id} data-testid={testId} className="grid scroll-mt-20 gap-4 md:grid-cols-[14rem_1fr] md:gap-8">
      <div>
        <h2 id={`${id}-title`} className={cn("text-base font-semibold", tone === "danger" && "text-destructive")}>
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={cn("min-w-0 rounded-xl border bg-card p-4 shadow-xs sm:p-6", tone === "danger" && "border-destructive/30")}>
        {children}
      </div>
    </section>
  );
}
