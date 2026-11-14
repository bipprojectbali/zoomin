/**
 * Multi screen share per koneksi: tiap addScreen = 1 picker getDisplayMedia = 1 track `screen-N`
 * (RND/spike/02-research.md §1 & §6). Jangan pakai setScreenShareEnabled (hanya 1 share).
 */
import { ConnectionState, type Room, type TrackPublishOptions } from "livekit-client";
import { createScreenNamer } from "../../shared/track.naming";
import { applyContentHint, screenAudioPublishOptions, screenPublishOptions } from "./screen.encoding";

/** User menutup/membatalkan picker; UI menampilkan pesan lembut, bukan error. */
export class ScreenShareCancelled extends Error {
  constructor(options?: ErrorOptions) {
    super("Berbagi layar dibatalkan", options);
    this.name = "ScreenShareCancelled";
  }
}

/** Dependensi yang bisa diganti di test (default: navigator + room.localParticipant). */
export type ScreenPublisherDeps = {
  getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStream>;
  // publishTrack menerima MediaStreamTrack dan membungkusnya jadi LocalVideoTrack/LocalAudioTrack.
  publish: (track: MediaStreamTrack, options: TrackPublishOptions) => Promise<unknown>;
  unpublish: (track: MediaStreamTrack) => Promise<unknown>;
};

export type ActiveScreen = { video: string; audio?: string };

type Entry = ActiveScreen & { videoTrack: MediaStreamTrack; audioTrack?: MediaStreamTrack; onEnded: () => void };

/** Error picker yang berarti "user batal", bukan kegagalan. */
function isPickerCancel(err: unknown): boolean {
  return err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

export class ScreenPublisher {
  // Namer per instance = per koneksi; nomor tidak pernah dipakai ulang.
  private readonly namer = createScreenNamer();
  private readonly screens = new Map<string, Entry>();
  private readonly listeners = new Set<(screens: ActiveScreen[]) => void>();
  private readonly deps: ScreenPublisherDeps;

  constructor(room: Room, deps: Partial<ScreenPublisherDeps> = {}) {
    const lp = room.localParticipant;
    this.deps = {
      getDisplayMedia: (c) => navigator.mediaDevices.getDisplayMedia(c),
      publish: (t, o) => lp.publishTrack(t, o),
      // Setelah room putus LiveKit sudah melepas semua publikasi; unpublish lagi hanya memicu warning (QA-10).
      unpublish: async (t) => {
        if (room.state === ConnectionState.Disconnected) t.stop();
        else await lp.unpublishTrack(t, true);
      },
      ...deps,
    };
  }

  /** Buka picker, publish layar baru (+ audionya bila ada). Batal → ScreenShareCancelled. */
  async addScreen(): Promise<ActiveScreen> {
    let stream: MediaStream;
    try {
      stream = await this.deps.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      if (isPickerCancel(err)) throw new ScreenShareCancelled({ cause: err });
      throw new Error(`addScreen: getDisplayMedia gagal (${describe(err)})`, { cause: err });
    }

    const [videoTrack] = stream.getVideoTracks();
    const [audioTrack] = stream.getAudioTracks();
    if (!videoTrack) {
      audioTrack?.stop();
      throw new Error("addScreen: getDisplayMedia tidak mengembalikan track video");
    }

    const names = this.namer.next();
    applyContentHint(videoTrack, "detail");
    let videoPublished = false;
    try {
      await this.deps.publish(videoTrack, { ...screenPublishOptions(names.index), name: names.video });
      videoPublished = true;
      if (audioTrack) {
        await this.deps.publish(audioTrack, { ...screenAudioPublishOptions(), name: names.audio });
      }
    } catch (err) {
      // Publish setengah jalan: bereskan supaya tidak ada track yatim / capture yang tetap menyala.
      if (videoPublished) await this.deps.unpublish(videoTrack);
      videoTrack.stop();
      audioTrack?.stop();
      throw new Error(`addScreen: publish ${names.video} gagal (${describe(err)})`, { cause: err });
    }

    const entry: Entry = {
      video: names.video,
      audio: audioTrack ? names.audio : undefined,
      videoTrack,
      audioTrack,
      // Tombol "Stop sharing" bawaan browser → unpublish pasangan video+audio.
      onEnded: () => {
        this.stopScreen(names.video).catch((err: unknown) => {
          console.error(`unpublish ${names.video} setelah ended gagal`, err);
        });
      },
    };
    videoTrack.addEventListener("ended", entry.onEnded);
    this.screens.set(names.video, entry);
    this.emit();
    return { video: entry.video, audio: entry.audio };
  }

  /** Hentikan satu layar (video + audionya). Nama tak dikenal = no-op (mis. ended setelah stop). */
  async stopScreen(name: string): Promise<void> {
    const entry = this.screens.get(name);
    if (!entry) return;
    // Hapus dulu dari map agar ended yang datang belakangan tidak unpublish dua kali.
    this.screens.delete(name);
    entry.videoTrack.removeEventListener("ended", entry.onEnded);
    this.emit();
    try {
      await this.deps.unpublish(entry.videoTrack);
      if (entry.audioTrack) await this.deps.unpublish(entry.audioTrack);
    } catch (err) {
      throw new Error(`stopScreen: unpublish ${name} gagal (${describe(err)})`, { cause: err });
    }
  }

  /** Layar aktif, urut sesuai waktu ditambahkan. */
  list(): ActiveScreen[] {
    return [...this.screens.values()].map(({ video, audio }) => ({ video, audio }));
  }

  /** Langganan perubahan daftar layar; kembalikan fungsi unsubscribe. */
  onChange(cb: (screens: ActiveScreen[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Hentikan semua layar dan lepas listener. */
  async dispose(): Promise<void> {
    this.listeners.clear();
    await Promise.all([...this.screens.keys()].map((name) => this.stopScreen(name)));
  }

  private emit() {
    const screens = this.list();
    for (const cb of this.listeners) cb(screens);
  }
}
