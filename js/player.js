// Pemutar: waveform, tempo (nada tetap), loop rentang, region per baris.
import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7.12.12/dist/wavesurfer.esm.js';
import RegionsPlugin from 'https://unpkg.com/wavesurfer.js@7.12.12/dist/plugins/regions.esm.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function createPlayer(container, { onTime, onState, onRangeEdit, onRegionClick }) {
  const regions = RegionsPlugin.create();
  const ws = WaveSurfer.create({
    container,
    height: 72,
    waveColor: css('--wave'),
    progressColor: css('--wave-progress'),
    cursorColor: css('--accent'),
    cursorWidth: 2,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    normalize: true,
    autoCenter: true,
    autoScroll: true,
    dragToSeek: true,
    plugins: [regions],
  });

  let range = null; // { start, end } yang sedang diputar
  let loop = false;
  let rate = 1;
  let zoom = 0;
  let activeId = null;
  let suppressCreate = false;

  regions.enableDragSelection({ color: css('--region-active') }, 4);

  ws.on('timeupdate', (t) => {
    if (range && t >= range.end) {
      // setTime() memicu timeupdate lagi secara sinkron, jadi ubah state dulu.
      const r = range;
      if (loop) {
        if (t > r.start + 0.05) ws.setTime(r.start);
      } else {
        range = null;
        ws.pause();
        ws.setTime(r.end);
      }
    }
    onTime?.(t);
  });
  ws.on('play', () => onState?.({ playing: true }));
  ws.on('pause', () => onState?.({ playing: false }));
  ws.on('finish', () => {
    if (range && loop) {
      ws.setTime(range.start);
      ws.play();
    } else range = null;
  });
  ws.on('interaction', () => {
    range = null; // klik/geser waveform = keluar dari mode rentang
  });

  regions.on('region-created', (r) => {
    if (suppressCreate) return;
    // Region baru hasil drag → jadi rentang baris aktif.
    r.remove();
    onRangeEdit?.(activeId, round(r.start), round(r.end));
  });
  regions.on('region-updated', (r) => {
    if (r.id === `r-${activeId}`) onRangeEdit?.(activeId, round(r.start), round(r.end));
  });
  regions.on('region-clicked', (r, e) => {
    e.stopPropagation();
    onRegionClick?.(r.id.replace(/^r-/, ''));
  });

  const api = {
    ws,
    async load(url) {
      range = null;
      await ws.load(url);
      ws.setPlaybackRate(rate, true);
      if (zoom) ws.zoom(zoom);
    },
    empty() {
      ws.empty();
      regions.clearRegions();
    },
    get duration() {
      return ws.getDuration() || 0;
    },
    get time() {
      return ws.getCurrentTime();
    },
    get playing() {
      return ws.isPlaying();
    },
    toggle() {
      range = null;
      ws.playPause();
    },
    pause() {
      ws.pause();
    },
    seek(t) {
      ws.setTime(Math.max(0, Math.min(t, api.duration)));
    },
    playRange(start, end) {
      if (start == null) return;
      const s = Math.max(0, start);
      const e = end != null && end > s ? end : api.duration;
      range = { start: s, end: e };
      ws.setTime(s);
      ws.play();
    },
    get rangeActive() {
      return !!range;
    },
    setLoop(v) {
      loop = v;
    },
    setRate(r) {
      rate = r;
      ws.setPlaybackRate(r, true);
    },
    zoomBy(factor) {
      const base = zoom || container.clientWidth / Math.max(api.duration, 1);
      zoom = Math.min(400, Math.max(container.clientWidth / Math.max(api.duration, 1), base * factor));
      ws.zoom(zoom);
    },
    // Gambar semua rentang (bagian & baris); hanya yang aktif bisa digeser/diubah ukurannya.
    // Rentang yang tidak aktif tidak digambar agar waveform tidak penuh tumpukan.
    drawRegions(items, active) {
      activeId = active;
      suppressCreate = true;
      regions.clearRegions();
      for (const l of items) {
        if (l.start == null || l.end == null || l.end <= l.start) continue;
        const isActive = l.id === active;
        if (!isActive && !l.lines) continue; // tampilkan semua bagian, baris hanya saat aktif
        regions.addRegion({
          id: `r-${l.id}`,
          content: l.lines ? l.name : undefined,
          start: l.start,
          end: l.end,
          color: isActive ? css('--region-active') : css('--region'),
          drag: isActive,
          resize: isActive,
        });
      }
      suppressCreate = false;
    },
  };
  return api;
}

const round = (t) => Math.round(t * 10) / 10;
