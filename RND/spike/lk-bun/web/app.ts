// SPIKE: halaman uji manual multi screen share LiveKit, jangan merge ke produk.
import {
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

const RESOLUTION_POLL_MS = 1000;

const $ = <T extends HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`elemen ${sel} tidak ditemukan di index.html`);
  return el;
};
const joinForm = $<HTMLFormElement>("#join");
const controls = $("#controls");
const statusEl = $("#status");
const errorEl = $("#error");
const localList = $("#local");
const grid = $("#grid");

let room: Room | undefined;
let screenCounter = 0;

function showError(context: string, err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(context, err);
  errorEl.hidden = false;
  errorEl.textContent = `[${new Date().toLocaleTimeString()}] ${context}: ${msg}\n` + errorEl.textContent;
}

/** Jalankan aksi async dari UI; error ditampilkan, tidak ditelan. */
function run(context: string, fn: () => Promise<unknown>) {
  fn().catch((err: unknown) => showError(context, err));
}

function requireRoom(): Room {
  if (!room) throw new Error("belum join room");
  return room;
}

async function join(roomName: string, identity: string) {
  const qs = new URLSearchParams({ room: roomName, identity });
  const res = await fetch(`/api/token?${qs}`);
  const body = (await res.json()) as { token?: string; url?: string; error?: string };
  if (!res.ok || !body.token || !body.url) throw new Error(`GET /api/token ${res.status}: ${body.error ?? "respons tanpa token"}`);

  const r = new Room({ adaptiveStream: true, dynacast: true });
  r.on(RoomEvent.TrackSubscribed, addRemoteTile)
    .on(RoomEvent.TrackUnsubscribed, (track) => removeRemoteTile(track))
    .on(RoomEvent.LocalTrackPublished, renderLocal)
    .on(RoomEvent.LocalTrackUnpublished, renderLocal)
    .on(RoomEvent.ParticipantConnected, renderStatus)
    .on(RoomEvent.ParticipantDisconnected, renderStatus)
    .on(RoomEvent.Disconnected, (reason) => {
      statusEl.textContent = `terputus (reason=${reason})`;
      grid.replaceChildren();
      localList.replaceChildren();
    })
    .on(RoomEvent.MediaDevicesError, (err) => showError("media device", err));
  await r.connect(body.url, body.token);
  room = r;
  await r.startAudio(); // klik Join = user gesture, buka autoplay audio
  joinForm.hidden = true;
  controls.hidden = false;
  renderStatus();
  renderLocal();
}

function renderStatus() {
  const r = requireRoom();
  statusEl.textContent = `room=${r.name} saya=${r.localParticipant.identity} remote=${r.remoteParticipants.size}`;
}

async function toggleCamera() {
  const lp = requireRoom().localParticipant;
  await lp.setCameraEnabled(!lp.isCameraEnabled);
}

async function toggleMic() {
  const lp = requireRoom().localParticipant;
  await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled);
}

/** Tiap klik = getDisplayMedia baru = screen share tambahan (screen-N). */
async function addScreen() {
  const lp = requireRoom().localParticipant;
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const name = `screen-${++screenCounter}`;
  const [video] = stream.getVideoTracks();
  if (!video) throw new Error(`${name}: getDisplayMedia tanpa track video`);
  const [audio] = stream.getAudioTracks();

  const videoPub = await lp.publishTrack(video, { source: Track.Source.ScreenShare, name });
  const audioPub = audio
    ? await lp.publishTrack(audio, { source: Track.Source.ScreenShareAudio, name: `${name}-audio` })
    : undefined;

  // User menekan "Stop sharing" bawaan browser -> unpublish pasangan video+audio.
  video.addEventListener("ended", () =>
    run(`unpublish ${name} setelah ended`, () => unpublish([videoPub, audioPub])),
  );
}

async function unpublish(pubs: (LocalTrackPublication | undefined)[]) {
  const lp = requireRoom().localParticipant;
  for (const pub of pubs) {
    // ended bisa datang setelah tombol stop -> track sudah tidak dipublish, abaikan.
    if (pub?.track && lp.trackPublications.has(pub.trackSid)) await lp.unpublishTrack(pub.track, true);
  }
}

function renderLocal() {
  if (!room) return;
  const items = [...room.localParticipant.trackPublications.values()].map((pub) => {
    const li = document.createElement("li");
    const settings = pub.track?.mediaStreamTrack.getSettings();
    const res = settings?.width ? ` ${settings.width}x${settings.height}` : "";
    li.textContent = `${pub.trackName} [${pub.source}] ${pub.kind}${res} sid=${pub.trackSid} `;
    const stop = document.createElement("button");
    stop.textContent = "stop";
    stop.onclick = () => run(`stop ${pub.trackName}`, () => unpublish([pub]));
    li.append(stop);
    return li;
  });
  localList.replaceChildren(...items);
}

function tileId(track: RemoteTrack) {
  return `tile-${track.sid}`;
}

function addRemoteTile(track: RemoteTrack, pub: RemoteTrackPublication, participant: RemoteParticipant) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.id = tileId(track);
  const el = track.attach();
  const label = document.createElement("small");
  const base = `${participant.identity} (${participant.name}) / ${pub.trackName} [${pub.source}]`;
  label.textContent = base;
  tile.append(el, label);
  grid.append(tile);

  if (el instanceof HTMLVideoElement) {
    const timer = setInterval(() => {
      if (!tile.isConnected) return clearInterval(timer);
      label.textContent = `${base} ${el.videoWidth}x${el.videoHeight}`;
    }, RESOLUTION_POLL_MS);
  }
}

function removeRemoteTile(track: RemoteTrack) {
  track.detach();
  document.getElementById(tileId(track))?.remove();
}

joinForm.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const data = new FormData(joinForm);
  run("join", () => join(String(data.get("room")), String(data.get("identity"))));
});
$("#cam").onclick = () => run("toggle kamera", toggleCamera);
$("#mic").onclick = () => run("toggle mic", toggleMic);
$("#screen").onclick = () => run("tambah layar", addScreen);
$("#leave").onclick = () =>
  run("keluar", async () => {
    await requireRoom().disconnect();
    room = undefined;
    joinForm.hidden = false;
    controls.hidden = true;
  });
