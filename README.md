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
- `js/midi.js` — dekoder MIDI Time Code + Web MIDI untuk mode Ikuti DAW
- `js/store.js` — Supabase (auth, tabel `songs`, bucket `audio`)
- `docs/superpowers/specs/` — desain

## Singkatan not angka
`1`–`7`/`0` not & istirahat · `5'` / `1,` oktaf atas/bawah · `#4` `b7` · `(5 6)` ½ ketuk ·
`((5 6 1 2))` ¼ ketuk · `5.` bertitik · `-` tahan · `5~5` ikatan · `|` birama

## Ikuti DAW (Studio One)
Alat Kulik bisa mengikuti posisi transport Studio One lewat **MIDI Time Code (MTC)**.
Buka di **Chrome/Edge** (Safari belum mendukung Web MIDI).

1. **Jalur MIDI**
   - Satu Mac (uji coba): Audio MIDI Setup → Window → Show MIDI Studio → IAC Driver → centang *Device is online*.
   - Dua Mac via kabel USB‑C/Thunderbolt (atau Wi‑Fi): Audio MIDI Setup → MIDI Studio → ikon *Network* →
     buat sesi di kedua Mac lalu *Connect*. Bisa juga pakai interface USB‑MIDI di antara keduanya.
2. **Studio One**: Studio One → Options → External Devices → *Add…* → *New Keyboard* (atau perangkat MIDI apa saja),
   *Send To* = port di atas (IAC/Network), centang **Send MIDI Timecode**.
   Lalu Song → Song Setup → General → atur *Timecode Format* (mis. 25 fps) bila perlu.
3. **Alat Kulik**: buka lagu → tombol **🎛 Ikuti DAW** → pilih *Input* yang sama.
   Status berubah jadi *Mengikuti* saat Studio One diputar.
4. **Offset** (per lagu, ikut tersimpan): posisi DAW ketika audio di 0:00. Cara cepat: hentikan Studio One di
   satu titik (mis. ketukan pertama intro), klik titik yang sama di waveform, tekan **Samakan di sini**.
