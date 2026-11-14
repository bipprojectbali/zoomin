import { Loader2 } from "lucide-react";

/** Fallback Suspense rute lazy. */
export function RouteLoading() {
  return (
    <p className="flex min-h-svh items-center justify-center gap-2 text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading…
    </p>
  );
}
