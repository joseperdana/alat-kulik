// Sinkron DAW lewat MIDI Time Code (MTC).
// DAW (mis. Studio One) memimpin; Alat Kulik hanya mengikuti posisinya.

// Kode rate MTC: 0=24, 1=25, 2=29.97 drop-frame, 3=30 fps.
// Label drop-frame sengaja dihitung dengan 30 fps: hasilnya sudah mendekati waktu nyata.
const FPS = [24, 25, 30, 30];
const RATE_NAMES = ['24', '25', '29.97df', '30'];
const STOP_AFTER_MS = 250; // tidak ada quarter frame selama ini = transport DAW berhenti (longgar untuk jitter Network MIDI)

const tcSeconds = (h, m, s, f, fps) => h * 3600 + m * 60 + s + f / fps;

export function createMtcDecoder({ now = () => performance.now() } = {}) {
  const pieces = new Array(8).fill(0);
  let mask = 0; // bit piece yang sudah diterima di siklus ini
  let lastPiece = -1;
  let rate = 1;
  let locked = false; // sudah pernah dapat posisi lengkap
  let running = false;
  let anchor = 0; // posisi (detik) pada saat anchorAt
  let anchorAt = 0;
  let lastQfAt = -Infinity;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  const quarter = () => 1 / (FPS[rate] * 4);

  function quarterFrame(data, at) {
    const piece = data >> 4;
    const val = data & 0x0f;
    const forward = piece === (lastPiece + 1) % 8;
    if (piece === 0) mask = 0;
    pieces[piece] = val;
    mask |= 1 << piece;
    lastPiece = piece;
    const wasRunning = running;

    if (piece === 7 && mask === 0xff) {
      // Siklus lengkap: piece 0 dikirim di awal frame F, piece 7 di F + 1,75 frame.
      rate = (pieces[7] >> 1) & 0x03;
      const fps = FPS[rate];
      const f = pieces[0] | (pieces[1] << 4);
      const s = pieces[2] | (pieces[3] << 4);
      const m = pieces[4] | (pieces[5] << 4);
      const h = pieces[6] | ((pieces[7] & 0x01) << 4);
      anchor = tcSeconds(h, m, s, f, fps) + 1.75 / fps;
      anchorAt = at;
      locked = true;
    } else if (locked && forward) {
      anchor += quarter();
      anchorAt = at;
    }
    lastQfAt = at;
    running = locked;
    if (running !== wasRunning) emit();
  }

  // Full frame: F0 7F <dev> 01 01 hr mn sc fr F7 — dikirim DAW saat locate/lompat posisi.
  function fullFrame(d) {
    if (d.length < 10 || d[1] !== 0x7f || d[3] !== 0x01 || d[4] !== 0x01) return;
    rate = (d[5] >> 5) & 0x03;
    anchor = tcSeconds(d[5] & 0x1f, d[6], d[7], d[8], FPS[rate]);
    anchorAt = now();
    mask = 0;
    lastPiece = -1;
    locked = true;
    running = false;
    emit();
  }

  return {
    // data: satu pesan MIDI (Uint8Array/array byte), at: timestamp (ms, basis performance.now).
    feed(data, at = now()) {
      if (!data?.length) return;
      if (data[0] === 0xf1 && data.length >= 2) quarterFrame(data[1], at);
      else if (data[0] === 0xf0) fullFrame(data);
    },
    // Posisi DAW saat ini (detik), diekstrapolasi halus di antara quarter frame.
    position(at = now()) {
      if (running && at - lastQfAt > STOP_AFTER_MS) {
        running = false;
        emit();
      }
      const ahead = running ? Math.min(Math.max(0, at - anchorAt) / 1000, quarter() * 2) : 0;
      return { time: anchor + ahead, running, locked, rate: RATE_NAMES[rate] };
    },
    reset() {
      mask = 0;
      lastPiece = -1;
      locked = running = false;
      anchor = 0;
      lastQfAt = -Infinity;
      emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// Pesan uji: susun quarter frame untuk posisi tertentu (dipakai test & simulasi).
export function quarterFrames(seconds, rateCode = 1) {
  const fps = FPS[rateCode];
  let total = Math.round(seconds * fps);
  const f = total % fps;
  total = (total - f) / fps;
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const vals = [f & 15, f >> 4, s & 15, s >> 4, m & 15, m >> 4, h & 15, ((h >> 4) & 1) | (rateCode << 1)];
  return vals.map((v, i) => [0xf1, (i << 4) | v]);
}

// ---------- Web MIDI ----------
export const mtc = createMtcDecoder();

export const midiSupported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;

let access = null;
let input = null;
const onMessage = (e) => mtc.feed(e.data, e.timeStamp);

export async function requestMidi() {
  if (access) return access;
  if (!midiSupported()) throw new Error('Browser ini belum mendukung Web MIDI. Pakai Chrome atau Edge.');
  try {
    access = await navigator.requestMIDIAccess({ sysex: true }); // sysex = pesan full frame saat locate
  } catch {
    try {
      access = await navigator.requestMIDIAccess(); // tanpa sysex tetap jalan lewat quarter frame
    } catch {
      throw new Error('Akses MIDI ditolak. Izinkan "MIDI devices" untuk situs ini di pengaturan browser (ikon gembok), lalu coba lagi.');
    }
  }
  return access;
}

export const listInputs = () => (access ? [...access.inputs.values()] : []);

export function connectInput(id) {
  if (input) input.removeEventListener('midimessage', onMessage);
  input = id ? (access?.inputs.get(id) ?? null) : null;
  input?.addEventListener('midimessage', onMessage);
  input?.open?.(); // addEventListener tidak selalu membuka port secara otomatis
  mtc.reset();
  return input;
}
