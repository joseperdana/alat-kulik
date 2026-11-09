import * as store from './store.js';
import { render as renderNotasi } from './notasi.js';
import { createPlayer } from './player.js';

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

// ---------- Format waktu ----------
export function fmt(t, withTenth = true) {
  if (t == null || Number.isNaN(t)) return '';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return withTenth ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
}
export function parseTime(str) {
  const v = String(str ?? '').trim().replace(',', '.');
  if (!v) return null;
  const parts = v.split(':');
  const n = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : undefined;
}

// ---------- State ----------
const state = {
  session: null,
  song: null, // baris lengkap dari tabel songs
  loadedAt: null, // updated_at versi yang sedang diedit
  activeId: null,
  dirty: false,
  saving: false,
  saveTimer: null,
  audioUrl: null,
  audioPath: null,
};
let player = null;

// ---------- UI kecil ----------
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}
function setSync(kind) {
  const el = $('#sync');
  el.hidden = !kind;
  el.dataset.kind = kind || '';
  el.textContent = { saved: 'Tersimpan ✓', saving: 'Menyimpan…', error: 'Gagal simpan — ketuk untuk coba lagi' }[kind] || '';
}
function show(view) {
  for (const v of ['login', 'list', 'song']) $(`#view-${v}`).hidden = v !== view;
  $('#logout').hidden = view === 'login';
  if (view !== 'song') setSync(null);
}

// ---------- Routing ----------
async function route() {
  if (!state.session) return show('login');
  const m = location.hash.match(/^#\/song\/([\w-]+)/);
  if (state.song && (!m || m[1] !== state.song.id)) await leaveSong();
  if (m) await openSong(m[1]);
  else await openList();
}

// ---------- Login ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const act = e.submitter?.dataset.act || 'in';
  const fd = new FormData(e.target);
  const msg = $('#login-msg');
  msg.textContent = act === 'in' ? 'Masuk…' : 'Mendaftar…';
  try {
    if (act === 'in') {
      await store.signIn(fd.get('email'), fd.get('password'));
      msg.textContent = '';
    } else {
      const res = await store.signUp(fd.get('email'), fd.get('password'));
      msg.textContent = res.session
        ? ''
        : 'Akun dibuat. Buka email konfirmasi dari Supabase dan klik link-nya, lalu kembali ke sini dan tekan Masuk.';
    }
  } catch (err) {
    msg.textContent = /confirm/i.test(err.message)
      ? 'Email belum dikonfirmasi. Klik link di email konfirmasi dulu.'
      : /invalid/i.test(err.message)
        ? 'Email atau kata sandi salah.'
        : `Gagal: ${err.message}`;
  }
});
$('#logout').addEventListener('click', async () => {
  await leaveSong();
  await store.signOut();
});

// ---------- Daftar lagu ----------
async function openList() {
  show('list');
  const ul = $('#song-list');
  try {
    const songs = await store.listSongs();
    ul.innerHTML = songs
      .map(
        (s) => `<li><a href="#/song/${s.id}">
          <span class="s-title">${esc(s.title)}</span>
          <span class="s-sub">${esc([s.artist, s.song_key && `Kunci ${s.song_key}`].filter(Boolean).join(' · '))}</span>
          ${s.audio_path ? '' : '<span class="s-warn">tanpa audio</span>'}
        </a></li>`,
      )
      .join('');
    $('#song-empty').hidden = songs.length > 0;
  } catch (err) {
    ul.innerHTML = '';
    toast(`Gagal memuat daftar: ${err.message}`);
  }
}
$('#new-song-btn').addEventListener('click', () => {
  $('#new-song-form').hidden = false;
  $('#new-song-form [name=title]').focus();
});
$('#new-song-cancel').addEventListener('click', () => {
  $('#new-song-form').reset();
  $('#new-song-form').hidden = true;
});
$('#new-song-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const file = fd.get('file');
  const msg = $('#new-song-msg');
  if (file.size > 50 * 1024 * 1024) return (msg.textContent = 'File lebih dari 50 MB.');
  form.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    msg.textContent = 'Membuat lagu…';
    const song = await store.createSong({
      title: fd.get('title').trim() || 'Tanpa judul',
      artist: fd.get('artist').trim(),
      sheet: { sections: [newSection('Intro')] },
    });
    msg.textContent = 'Mengunggah audio…';
    const path = await store.uploadAudio(song.id, file);
    await store.updateSong(song.id, { audio_path: path });
    form.reset();
    form.hidden = true;
    msg.textContent = '';
    location.hash = `#/song/${song.id}`;
  } catch (err) {
    msg.textContent = `Gagal: ${err.message}`;
  } finally {
    form.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
});

// ---------- Model lembar lagu ----------
const newLine = (start = null) => ({ id: uid(), start, end: null, chords: '', melody: '', lyrics: '', note: '' });
const newSection = (name) => ({ id: uid(), name, lines: [newLine()] });
const sections = () => state.song.sheet.sections;
const allLines = () => sections().flatMap((s) => s.lines);
function findLine(id) {
  for (const s of sections()) {
    const i = s.lines.findIndex((l) => l.id === id);
    if (i >= 0) return { section: s, line: s.lines[i], index: i };
  }
  return null;
}
const lastEnd = () => {
  const ends = allLines().map((l) => l.end).filter((t) => t != null);
  return ends.length ? Math.max(...ends) : null;
};

// ---------- Halaman lagu ----------
async function openSong(id) {
  if (state.song?.id === id) return;
  show('song');
  ensurePlayer();
  let song;
  try {
    song = await store.getSong(id);
  } catch (err) {
    toast(`Lagu tidak ditemukan: ${err.message}`);
    location.hash = '#/';
    return;
  }
  song.sheet ||= { sections: [] };
  song.sheet.sections ||= [];
  state.song = song;
  state.loadedAt = song.updated_at;
  state.activeId = null;
  state.dirty = false;
  setSync('saved');
  fillMeta();
  renderSheet();
  await loadAudio();
}

async function leaveSong() {
  if (!state.song) return;
  await flushSave();
  player?.pause();
  player?.empty();
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  Object.assign(state, { song: null, activeId: null, audioUrl: null, audioPath: null });
}

function fillMeta() {
  const s = state.song;
  $('#f-title').value = s.title;
  $('#f-artist').value = s.artist;
  $('#f-key').value = s.song_key;
  $('#f-bpm').value = s.bpm ?? '';
  document.title = `${s.title} · Alat Kulik`;
}

async function loadAudio() {
  const path = state.song.audio_path;
  const msg = $('#wave-msg');
  if (!path) {
    player.empty();
    msg.textContent = 'Belum ada audio. Pakai menu ⋯ → Ganti audio.';
    return;
  }
  if (path === state.audioPath) return redraw();
  msg.textContent = 'Memuat audio…';
  try {
    const url = await store.audioBlobUrl(path);
    if (state.song?.audio_path !== path) return URL.revokeObjectURL(url); // sudah pindah lagu
    await player.load(url);
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = url;
    state.audioPath = path;
    msg.textContent = '';
    updateTime(0);
    redraw();
  } catch (err) {
    msg.textContent = `Gagal memuat audio: ${err.message}`;
  }
}

function ensurePlayer() {
  if (player) return;
  player = createPlayer($('#wave'), {
    onTime: updateTime,
    onState: ({ playing }) => {
      $('#play').textContent = playing ? '❚❚' : '▶';
      $('#play').setAttribute('aria-label', playing ? 'Jeda' : 'Putar');
    },
    onRangeEdit: (id, start, end) => {
      let hit = id && findLine(id);
      if (!hit) {
        // Belum ada baris aktif: buat baris baru di bagian terakhir.
        if (!sections().length) sections().push({ id: uid(), name: 'Bagian 1', lines: [] });
        const sec = sections()[sections().length - 1];
        const line = newLine();
        sec.lines.push(line);
        state.activeId = line.id;
        renderSheet();
        hit = findLine(line.id);
      }
      hit.line.start = start;
      hit.line.end = end;
      refreshTimes(hit.line);
      redraw();
      markDirty();
    },
    onRegionClick: (id) => {
      setActive(id);
      document.querySelector(`[data-line="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
}

function updateTime(t) {
  $('#time').textContent = `${fmt(t)} / ${fmt(player?.duration || 0, false)}`;
}

// ---------- Render lembar ----------
function lineHtml(l, n) {
  const tm = (f) => `<span class="tm">
      <button class="nudge" data-a="nudge" data-f="${f}" data-d="-0.1" aria-label="Geser ${f} mundur">−</button>
      <input class="t" data-t="${f}" value="${fmt(l[f])}" placeholder="${f === 'start' ? 'mulai' : 'selesai'}" inputmode="decimal" aria-label="${f === 'start' ? 'Detik mulai' : 'Detik selesai'}" />
      <button class="nudge" data-a="nudge" data-f="${f}" data-d="0.1" aria-label="Geser ${f} maju">+</button>
    </span>`;
  return `<article class="line${l.id === state.activeId ? ' active' : ''}" data-line="${l.id}">
    <div class="line-head">
      <button class="lplay" data-a="play" aria-label="Putar baris ${n}">▶</button>
      <span class="range">${tm('start')}<span class="dash">–</span>${tm('end')}</span>
      <span class="lact">
        <button class="ghost small" data-a="lup" aria-label="Naikkan baris">↑</button>
        <button class="ghost small" data-a="ldown" aria-label="Turunkan baris">↓</button>
        <button class="ghost small" data-a="ldel" aria-label="Hapus baris">✕</button>
      </span>
    </div>
    <input class="f chords" data-f="chords" value="${esc(l.chords)}" placeholder="Chord  (Am  F  C  G)" autocapitalize="off" autocomplete="off" spellcheck="false" />
    <div class="notasi" data-preview>${renderNotasi(l.melody)}</div>
    <input class="f melody" data-f="melody" value="${esc(l.melody)}" placeholder="Not angka  (5 6 (1' 7) 6 -)" autocapitalize="off" autocomplete="off" spellcheck="false" inputmode="text" />
    <input class="f lyrics" data-f="lyrics" value="${esc(l.lyrics)}" placeholder="Lirik" />
    <input class="f note" data-f="note" value="${esc(l.note)}" placeholder="Catatan" />
  </article>`;
}

function renderSheet() {
  const el = $('#sheet');
  el.innerHTML = sections()
    .map(
      (s) => `<section class="sec" data-sec="${s.id}">
      <div class="sec-head">
        <input class="sec-name" data-sf="name" value="${esc(s.name)}" aria-label="Nama bagian" />
        <span class="lact">
          <button class="ghost small" data-a="sup" aria-label="Naikkan bagian">↑</button>
          <button class="ghost small" data-a="sdown" aria-label="Turunkan bagian">↓</button>
          <button class="ghost small" data-a="sdel" aria-label="Hapus bagian">✕</button>
        </span>
      </div>
      ${s.lines.map((l, i) => lineHtml(l, i + 1)).join('')}
      <button class="ghost add-line" data-a="addline">+ Baris</button>
    </section>`,
    )
    .join('');
  if (!sections().length) el.innerHTML = '<p class="muted center">Tambah bagian (Intro, Verse, Reff…) untuk mulai mencatat.</p>';
  updateActiveLabel();
  redraw();
}

function refreshTimes(line) {
  const art = document.querySelector(`[data-line="${line.id}"]`);
  if (!art) return;
  art.querySelector('[data-t=start]').value = fmt(line.start);
  art.querySelector('[data-t=end]').value = fmt(line.end);
}

function setActive(id) {
  if (state.activeId === id) return;
  state.activeId = id;
  document.querySelectorAll('.line.active').forEach((a) => a.classList.remove('active'));
  document.querySelector(`[data-line="${id}"]`)?.classList.add('active');
  updateActiveLabel();
  redraw();
}

function updateActiveLabel() {
  const hit = state.activeId && findLine(state.activeId);
  $('#active-label').textContent = hit ? `${hit.section.name || 'Bagian'} · baris ${hit.index + 1}` : 'Pilih baris untuk ditandai';
}

function redraw() {
  if (player && state.song && player.duration) player.drawRegions(allLines(), state.activeId);
}

// ---------- Event lembar ----------
const sheetEl = $('#sheet');
sheetEl.addEventListener('focusin', (e) => {
  const art = e.target.closest('[data-line]');
  if (art) setActive(art.dataset.line);
});
sheetEl.addEventListener('input', (e) => {
  const t = e.target;
  const art = t.closest('[data-line]');
  if (t.dataset.f && art) {
    const { line } = findLine(art.dataset.line);
    line[t.dataset.f] = t.value;
    if (t.dataset.f === 'melody') art.querySelector('[data-preview]').innerHTML = renderNotasi(t.value);
    markDirty();
  } else if (t.dataset.sf) {
    const sec = sections().find((s) => s.id === t.closest('[data-sec]').dataset.sec);
    sec.name = t.value;
    updateActiveLabel();
    markDirty();
  }
});
sheetEl.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.dataset.t) return;
  const { line } = findLine(t.closest('[data-line]').dataset.line);
  const v = parseTime(t.value);
  if (v === undefined) {
    toast('Format waktu: 1:23.4 atau 83.4');
  } else {
    line[t.dataset.t] = v;
    markDirty();
  }
  refreshTimes(line);
  redraw();
});
sheetEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const art = b.closest('[data-line]');
  const secEl = b.closest('[data-sec]');
  const sec = secEl && sections().find((s) => s.id === secEl.dataset.sec);
  const hit = art && findLine(art.dataset.line);
  if (art) setActive(art.dataset.line);
  const a = b.dataset.a;

  if (a === 'play') {
    const { line } = hit;
    if (line.start == null) return toast('Tandai detik mulai dulu (tombol ⇤ Mulai atau drag di waveform).');
    if (!player.duration) return toast('Audio belum siap.');
    player.playRange(line.start, line.end);
  } else if (a === 'nudge') {
    const f = b.dataset.f;
    const base = hit.line[f] ?? player.time;
    hit.line[f] = Math.max(0, Math.round((base + Number(b.dataset.d)) * 10) / 10);
    refreshTimes(hit.line);
    redraw();
    markDirty();
  } else if (a === 'lup' || a === 'ldown') {
    const j = hit.index + (a === 'lup' ? -1 : 1);
    if (j < 0 || j >= hit.section.lines.length) return;
    const ls = hit.section.lines;
    [ls[hit.index], ls[j]] = [ls[j], ls[hit.index]];
    renderSheet();
    markDirty();
  } else if (a === 'ldel') {
    const l = hit.line;
    const filled = l.chords || l.melody || l.lyrics || l.note;
    if (filled && !confirm('Hapus baris ini?')) return;
    hit.section.lines.splice(hit.index, 1);
    if (state.activeId === l.id) state.activeId = null;
    renderSheet();
    markDirty();
  } else if (a === 'addline') {
    const prev = sec.lines[sec.lines.length - 1];
    const line = newLine(prev?.end ?? (sec.lines.length ? null : lastEnd()));
    sec.lines.push(line);
    state.activeId = line.id;
    renderSheet();
    document.querySelector(`[data-line="${line.id}"] .chords`)?.focus();
    markDirty();
  } else if (a === 'sup' || a === 'sdown') {
    const ss = sections();
    const i = ss.indexOf(sec);
    const j = i + (a === 'sup' ? -1 : 1);
    if (j < 0 || j >= ss.length) return;
    [ss[i], ss[j]] = [ss[j], ss[i]];
    renderSheet();
    markDirty();
  } else if (a === 'sdel') {
    const used = sec.lines.some((l) => l.chords || l.melody || l.lyrics || l.note);
    if (used && !confirm(`Hapus bagian "${sec.name}" beserta semua barisnya?`)) return;
    sections().splice(sections().indexOf(sec), 1);
    if (!findLine(state.activeId)) state.activeId = null;
    renderSheet();
    markDirty();
  }
});

$('#add-section').addEventListener('click', () => {
  const names = ['Intro', 'Verse', 'Pre-chorus', 'Reff', 'Interlude', 'Bridge', 'Outro'];
  const used = new Set(sections().map((s) => s.name));
  const name = names.find((n) => !used.has(n)) || `Bagian ${sections().length + 1}`;
  const sec = newSection(name);
  sec.lines[0].start = lastEnd();
  sections().push(sec);
  state.activeId = sec.lines[0].id;
  renderSheet();
  const input = document.querySelector(`[data-sec="${sec.id}"] .sec-name`);
  input?.focus();
  input?.select();
  markDirty();
});

// ---------- Pemutar ----------
$('#play').addEventListener('click', () => player?.toggle());
$('#speed').addEventListener('change', (e) => player?.setRate(Number(e.target.value)));
$('#loop').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  player?.setLoop(on);
});
$('#zoom-in').addEventListener('click', () => player?.duration && player.zoomBy(2));
$('#zoom-out').addEventListener('click', () => player?.duration && player.zoomBy(0.5));

function mark(field) {
  const hit = state.activeId && findLine(state.activeId);
  if (!hit) return toast('Pilih (ketuk) baris dulu, baru tandai.');
  if (!player?.duration) return toast('Audio belum siap.');
  const t = Math.round(player.time * 10) / 10;
  hit.line[field] = t;
  if (field === 'start' && hit.line.end != null && hit.line.end <= t) hit.line.end = null;
  if (field === 'end' && hit.line.start != null && hit.line.start >= t) return toast('Detik selesai harus setelah detik mulai.');
  refreshTimes(hit.line);
  redraw();
  markDirty();
}
$('#mark-start').addEventListener('click', () => mark('start'));
$('#mark-end').addEventListener('click', () => mark('end'));

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || $('#view-song').hidden) return;
  if (e.target.closest('input, textarea, select, button, summary')) return;
  e.preventDefault();
  player?.toggle();
});

// ---------- Meta lagu ----------
for (const [sel, key] of [['#f-title', 'title'], ['#f-artist', 'artist'], ['#f-key', 'song_key'], ['#f-bpm', 'bpm']]) {
  $(sel).addEventListener('input', (e) => {
    if (!state.song) return;
    const v = e.target.value;
    state.song[key] = key === 'bpm' ? (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v)) : v;
    if (key === 'title') document.title = `${v} · Alat Kulik`;
    markDirty();
  });
}

$('#replace-audio').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  e.target.closest('details').open = false;
  if (!file || !state.song) return;
  if (file.size > 50 * 1024 * 1024) return toast('File lebih dari 50 MB.');
  const song = state.song;
  const old = song.audio_path;
  $('#wave-msg').textContent = 'Mengunggah audio…';
  try {
    await flushSave();
    const path = await store.uploadAudio(song.id, file);
    const { updated_at } = await store.updateSong(song.id, { audio_path: path });
    song.audio_path = path;
    state.loadedAt = updated_at;
    await store.removeAudio(old);
    await loadAudio();
    toast('Audio diganti.');
  } catch (err) {
    $('#wave-msg').textContent = `Gagal mengunggah: ${err.message}`;
  }
});

$('#delete-song').addEventListener('click', async () => {
  const song = state.song;
  if (!song || !confirm(`Hapus lagu "${song.title}" beserta audio dan semua catatannya? Tidak bisa dibatalkan.`)) return;
  try {
    clearTimeout(state.saveTimer);
    state.dirty = false;
    await store.deleteSong(song);
    await leaveSong();
    location.hash = '#/';
    toast('Lagu dihapus.');
  } catch (err) {
    toast(`Gagal menghapus: ${err.message}`);
  }
});

// ---------- Simpan otomatis & sinkron ----------
function markDirty() {
  state.dirty = true;
  setSync('saving');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(save, 1000);
}

async function save() {
  clearTimeout(state.saveTimer);
  const song = state.song;
  if (!song || !state.dirty) return;
  if (state.saving) return void (state.saveTimer = setTimeout(save, 500));
  state.saving = true;
  state.dirty = false;
  try {
    const serverAt = await store.getUpdatedAt(song.id);
    if (serverAt !== state.loadedAt) {
      const overwrite = confirm(
        'Lagu ini sudah diubah dari perangkat lain.\n\nOK = timpa dengan versi di layar ini\nBatal = buang perubahan di sini dan muat versi terbaru',
      );
      if (!overwrite) {
        state.saving = false;
        await reloadSong();
        return;
      }
    }
    const { updated_at } = await store.updateSong(song.id, {
      title: song.title.trim() || 'Tanpa judul',
      artist: song.artist,
      song_key: song.song_key,
      bpm: song.bpm,
      sheet: song.sheet,
    });
    state.loadedAt = updated_at;
    setSync(state.dirty ? 'saving' : 'saved');
  } catch (err) {
    state.dirty = true;
    setSync('error');
    console.error(err);
  } finally {
    state.saving = false;
  }
}

async function flushSave() {
  if (state.dirty) await save();
}

async function reloadSong() {
  const id = state.song.id;
  const fresh = await store.getSong(id);
  if (state.song?.id !== id) return;
  fresh.sheet ||= { sections: [] };
  state.song = fresh;
  state.loadedAt = fresh.updated_at;
  state.dirty = false;
  if (!findLine(state.activeId)) state.activeId = null;
  setSync('saved');
  fillMeta();
  renderSheet();
  await loadAudio();
  toast('Dimuat versi terbaru.');
}

$('#sync').addEventListener('click', () => {
  if ($('#sync').dataset.kind === 'error') save();
});

// Saat kembali ke tab/aplikasi: ambil perubahan dari perangkat lain.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') return flushSave();
  if (!state.song || state.dirty || state.saving) return;
  try {
    const at = await store.getUpdatedAt(state.song.id);
    if (at !== state.loadedAt) await reloadSong();
  } catch {
    /* offline: biarkan */
  }
});
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    save();
    e.preventDefault();
  }
});

// ---------- Mulai ----------
window.addEventListener('hashchange', route);
store.onAuth((session) => {
  const changed = !!session !== !!state.session;
  state.session = session;
  if (changed) route();
});
state.session = await store.getSession();
route();
