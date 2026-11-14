import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { AppBrand } from "@/app.brand";
import { Button } from "@/components/ui/button";

const TEXT = {
  code: "404",
  title: "Page not found",
  body: "This address doesn't exist or has moved. Check the link, or go back to the lobby.",
  back: "Go to lobby",
};

/** Route `*`: halaman 404 dengan jalan pulang ke lobby. */
export function NotFoundPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center">
      <AppBrand />
      <div className="flex max-w-md flex-col items-center gap-3">
        <p className="text-6xl font-bold tracking-tight text-muted-foreground/60">{TEXT.code}</p>
        <h1 className="text-2xl font-semibold">{TEXT.title}</h1>
        <p className="text-muted-foreground">{TEXT.body}</p>
      </div>
      <Button asChild>
        <Link to="/app">
          <ArrowLeft />
          {TEXT.back}
        </Link>
      </Button>
    </main>
  );
}
