import { ArrowLeft, Eye, Mic, Video } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { AppBrand } from "@/app.brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CameraPreview } from "./CameraPreview";
import { DeviceSelect } from "./DeviceSelect";
import { loadMediaPreferences } from "./media.preferences";
import { MediaErrorNotice } from "./MediaErrorNotice";
import { MediaToggle } from "./MediaToggle";
import { MicMeter } from "./MicMeter";
import { joinButtonState, PREJOIN_TEXT } from "./prejoin.labels";
import type { PreJoinChoices } from "./prejoin.types";
import { usePreviewTrack } from "./preview.tracks";

/** Batas panjang nama di input; validasi final tetap di server. */
const NAME_MAX_LENGTH = 60;

export type PreJoinProps = {
  title: string;
  /** Mis. "Anda akan masuk sebagai Peserta". */
  subtitle?: string;
  canPublish: boolean;
  askName?: boolean;
  busy?: boolean;
  error?: string | null;
  onJoin: (choices: PreJoinChoices, name?: string) => void;
  /** Konten tambahan di bawah tombol gabung (mis. "Bukan Anda? Keluar"). */
  footer?: ReactNode;
  /**
   * Tujuan tombol "Ke lobby" (QA-09); default `/app` untuk pengguna bersesi. `null` = tanpa tombol: tamu undangan
   * tanpa sesi tidak punya lobby (lobby wajib login), dan mematikan preview cukup lewat toggle kamera/mic.
   */
  backTo?: string | null;
};

/** Layar "Siap bergabung?": preview kamera, toggle & pilih perangkat, nama, lalu Gabung sekarang. */
export function PreJoin({ title, subtitle, canPublish, askName = false, busy = false, error, onJoin, footer, backTo = "/app" }: PreJoinProps) {
  const [choices, setChoices] = useState<PreJoinChoices>(loadMediaPreferences);
  const [name, setName] = useState("");
  // Setelah klik gabung preview dilepas supaya kamera tidak menyala dua kali saat room mem-publish.
  const [released, setReleased] = useState(false);
  useEffect(() => {
    if (error) setReleased(false);
  }, [error]);

  const live = canPublish && !released;
  const video = usePreviewTrack("camera", live && choices.videoEnabled, choices.videoDeviceId);
  const audio = usePreviewTrack("mic", live && choices.audioEnabled, choices.audioDeviceId);
  const join = joinButtonState(busy, askName, name);
  const update = (patch: Partial<PreJoinChoices>) => setChoices((c) => ({ ...c, ...patch }));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (join.disabled) return;
    const final: PreJoinChoices = {
      ...choices,
      // Perangkat yang gagal dibuka tidak ikut dinyalakan di room.
      audioEnabled: canPublish && choices.audioEnabled && !audio.error,
      videoEnabled: canPublish && choices.videoEnabled && !video.error,
    };
    setReleased(true);
    onJoin(final, askName ? name.trim() : undefined);
  }

  return (
    <main data-testid="prejoin" className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <nav className="flex items-center justify-between gap-3">
        <AppBrand />
        {backTo !== null && (
          <Button asChild variant="ghost" size="sm" data-testid="prejoin-back">
            <Link to={backTo}>
              <ArrowLeft aria-hidden="true" />
              {PREJOIN_TEXT.back}
            </Link>
          </Button>
        )}
      </nav>
      <div className="my-auto grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-center">
        {canPublish ? (
          <section className="flex min-w-0 flex-col gap-3" aria-label={PREJOIN_TEXT.toggles}>
            <CameraPreview track={video.track} loading={video.loading}>
              <MediaToggle
                kind="mic"
                enabled={choices.audioEnabled}
                failed={!!audio.error}
                onToggle={() => update({ audioEnabled: !choices.audioEnabled })}
              />
              <MediaToggle
                kind="camera"
                enabled={choices.videoEnabled}
                failed={!!video.error}
                onToggle={() => update({ videoEnabled: !choices.videoEnabled })}
              />
            </CameraPreview>
            <div className="grid gap-2 sm:grid-cols-2">
              <DeviceSelect
                kind="videoinput"
                label={PREJOIN_TEXT.camera}
                icon={<Video aria-hidden />}
                value={choices.videoDeviceId}
                refreshKey={video.track}
                onChange={(videoDeviceId) => update({ videoDeviceId })}
              />
              <div className="flex min-w-0 items-center gap-2">
                <DeviceSelect
                  kind="audioinput"
                  label={PREJOIN_TEXT.mic}
                  icon={<Mic aria-hidden />}
                  value={choices.audioDeviceId}
                  refreshKey={audio.track}
                  onChange={(audioDeviceId) => update({ audioDeviceId })}
                />
                <MicMeter track={audio.track} />
              </div>
            </div>
            <MediaErrorNotice errors={{ camera: video.error, mic: audio.error }} />
          </section>
        ) : (
          <section className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted p-6 text-center text-muted-foreground">
            <Eye aria-hidden className="size-10" />
            <p className="max-w-xs text-sm">{PREJOIN_TEXT.viewerInfo}</p>
          </section>
        )}

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{PREJOIN_TEXT.ready}</p>
            <h1 className="text-2xl font-semibold break-words">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {askName && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="prejoin-name">{PREJOIN_TEXT.name}</Label>
              <Input
                id="prejoin-name"
                data-testid="prejoin-name"
                autoComplete="name"
                autoFocus
                required
                maxLength={NAME_MAX_LENGTH}
                placeholder={PREJOIN_TEXT.namePlaceholder}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "prejoin-error" : undefined}
              />
            </div>
          )}
          {error && (
            <p id="prejoin-error" className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" data-testid="prejoin-join" disabled={join.disabled} className="rounded-full">
            {join.label}
          </Button>
          {footer}
        </form>
      </div>
    </main>
  );
}
