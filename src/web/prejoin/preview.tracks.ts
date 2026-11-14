import { createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";
import { useEffect, useState } from "react";
import type { MediaKind } from "./prejoin.labels";

type PreviewTrack<K extends MediaKind> = K extends "camera" ? LocalVideoTrack : LocalAudioTrack;

/**
 * Satu track preview lokal per jenis (kamera & mic terpisah supaya izin ditolak di satu sisi tidak mematikan sisi lain).
 * Track di-stop saat dinonaktifkan, ganti perangkat, atau unmount.
 */
export function usePreviewTrack<K extends MediaKind>(kind: K, enabled: boolean, deviceId?: string) {
  const [track, setTrack] = useState<PreviewTrack<K> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTrack(null);
    if (!enabled) {
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let created: PreviewTrack<K> | null = null;
    setLoading(true);
    const options = deviceId ? { deviceId } : {};
    const create = kind === "camera" ? createLocalVideoTrack({ ...options, facingMode: "user" }) : createLocalAudioTrack(options);
    (create as Promise<PreviewTrack<K>>).then(
      (t) => {
        // Effect sudah dibersihkan (unmount/ganti perangkat) sebelum track jadi: langsung matikan supaya lampu kamera padam.
        if (cancelled) return void t.stop();
        created = t;
        setTrack(t);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.warn(`prejoin: gagal membuat preview ${kind}`, { deviceId }, err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      created?.stop();
    };
  }, [kind, enabled, deviceId]);

  return { track, error, loading };
}

/** Daftar perangkat input/output; dimuat ulang saat `refreshKey` berubah (mis. setelah izin diberikan) & devicechange. */
export function useDevices(kind: MediaDeviceKind, refreshKey: unknown) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const md = globalThis.navigator?.mediaDevices;
    if (!md) return;
    let cancelled = false;
    const load = () =>
      md.enumerateDevices().then(
        // deviceId kosong = belum ada izin; label tidak berguna, jangan tampilkan.
        (all) => !cancelled && setDevices(all.filter((d) => d.kind === kind && d.deviceId)),
        (err: unknown) => console.warn(`prejoin: enumerateDevices ${kind} gagal`, err),
      );
    void load();
    md.addEventListener("devicechange", load);
    return () => {
      cancelled = true;
      md.removeEventListener("devicechange", load);
    };
  }, [kind, refreshKey]);

  return devices;
}
