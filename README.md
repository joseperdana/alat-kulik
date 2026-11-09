# Alat Kulik

Web app sederhana untuk ngulik lagu: putar mp3, catat chord / not angka / lirik / catatan per baris,
dan tiap baris terhubung ke rentang detik di audio supaya bisa diputar ulang (dengan loop & tempo 50–100%).
Data tersinkron antar perangkat lewat Supabase (proyek `alat-kulik`).

## Jalankan lokal
```bash
npm run dev     # http://localhost:5173
npm test        # tes parser not angka
```

## Struktur
- `index.html`, `css/style.css` — tampilan
- `js/app.js` — alur halaman, lembar lagu, simpan otomatis & sinkron
- `js/player.js` — waveform (wavesurfer.js), tempo, loop, region per baris
- `js/notasi.js` — pengubah singkatan not angka → tampilan rapi
- `js/store.js` — Supabase (auth, tabel `songs`, bucket `audio`)
- `docs/superpowers/specs/` — desain

## Singkatan not angka
`1`–`7`/`0` not & istirahat · `5'` / `1,` oktaf atas/bawah · `#4` `b7` · `(5 6)` ½ ketuk ·
`((5 6 1 2))` ¼ ketuk · `5.` bertitik · `-` tahan · `5~5` ikatan · `|` birama
