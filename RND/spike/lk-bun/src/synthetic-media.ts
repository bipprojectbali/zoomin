import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  LocalVideoTrack,
  VideoBufferType,
  VideoFrame,
  VideoSource,
} from "@livekit/rtc-node";

/** Warna RGB solid; dipakai untuk membedakan isi tiap track di sisi penerima. */
export type Rgb = readonly [number, number, number];

/** Track video sintetis (warna solid) beserta penghentinya. */
export interface SyntheticVideo {
  track: LocalVideoTrack;
  stop: () => Promise<void>;
}

/** Buat track video yang terus mengirim frame RGBA warna solid via interval. */
export function startSyntheticVideo(
  name: string,
  color: Rgb,
  width = 640,
  height = 360,
  fps = 15,
): SyntheticVideo {
  const source = new VideoSource(width, height);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 255;
  }
  const frame = new VideoFrame(data, width, height, VideoBufferType.RGBA);
  const timer = setInterval(() => source.captureFrame(frame), 1000 / fps);
  const track = LocalVideoTrack.createVideoTrack(name, source);
  return {
    track,
    stop: async () => {
      clearInterval(timer);
      await source.close();
    },
  };
}

/** Track audio sintetis (nada sinus 440 Hz, frame 10 ms) beserta penghentinya. */
export interface SyntheticAudio {
  track: LocalAudioTrack;
  stop: () => Promise<void>;
}

const SAMPLE_RATE = 48000;
const FRAME_MS = 10;

export function startSyntheticAudio(name: string): SyntheticAudio {
  const source = new AudioSource(SAMPLE_RATE, 1);
  const samples = (SAMPLE_RATE * FRAME_MS) / 1000;
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 8000);
  }
  let running = true;
  // captureFrame menunggu queue source, jadi loop berurutan = laju real-time.
  const loop = (async () => {
    while (running) {
      await source.captureFrame(new AudioFrame(pcm, SAMPLE_RATE, 1, samples));
    }
  })();
  const track = LocalAudioTrack.createAudioTrack(name, source);
  return {
    track,
    stop: async () => {
      running = false;
      await loop;
      await source.close();
    },
  };
}

/** Ambil warna piksel tengah frame (dikonversi ke RGBA) untuk verifikasi isi track. */
export function centerRgb(frame: VideoFrame): Rgb {
  const rgba = frame.type === VideoBufferType.RGBA ? frame : frame.convert(VideoBufferType.RGBA);
  const idx = (Math.floor(rgba.height / 2) * rgba.width + Math.floor(rgba.width / 2)) * 4;
  return [rgba.data[idx]!, rgba.data[idx + 1]!, rgba.data[idx + 2]!];
}

/** True bila dua warna berbeda maksimal `tol` per kanal (kompresi codec bikin tidak eksak). */
export function rgbClose(a: Rgb, b: Rgb, tol = 40): boolean {
  return a.every((v, i) => Math.abs(v - b[i]!) <= tol);
}
