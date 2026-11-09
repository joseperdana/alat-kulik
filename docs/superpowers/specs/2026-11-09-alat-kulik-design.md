# Alat Kulik — Design

Tanggal: 2026-11-09 · Pengguna: satu orang (pemilik)

## Tujuan
Mempermudah ngulik lagu: putar mp3, catat chord / not angka / lirik / catatan per baris,
dan setiap baris terhubung ke rentang waktu di mp3 sehingga bisa diputar ulang kapan saja.
Bisa diakses dari laptop dan HP dengan data yang tersinkron otomatis.

## Arsitektur
- Web app statis: `index.html` + modul ES (`js/*.js`) + `css/style.css`, tanpa build step.
- Library dari CDN dengan versi terkunci: `@supabase/supabase-js@2`, `wavesurfer.js@7` (+ plugin Regions).
- Supabase (proyek baru "alat-kulik"):
  - Auth: email + kata sandi (diganti dari magic link supaya tidak bergantung pada pengaturan
    redirect URL; login sekali per perangkat, sesi tersimpan).
  - Tabel `songs` dengan RLS `user_id = auth.uid()`.
  - Storage bucket privat `audio`, path `<user_id>/<song_id>.<ext>`, RLS per folder user.
- Hosting statis gratis; di HP bisa "Add to Home Screen".

## Data
```
songs(
  id uuid pk, user_id uuid -> auth.users, title text, artist text,
  song_key text, bpm numeric, audio_path text,
  sheet jsonb,           -- { sections: [ { id, name, lines: [ {id, start, end, chords, melody, lyrics, note} ] } ] }
  created_at, updated_at timestamptz
)
```
`start`/`end` dalam detik (float, boleh null).

## Tampilan
1. Login (email + kata sandi; tombol Daftar untuk pertama kali).
2. Daftar lagu + tombol "Lagu baru" (judul, artis, file mp3).
3. Halaman lagu:
   - Pemutar sticky: waveform, play/pause, posisi waktu, kecepatan 50–100% (pitch dipertahankan), toggle loop.
   - Tombol tandai: [Mulai] / [Selesai] mengisi rentang baris aktif dari posisi pemutar; nudge ±0.1 s.
   - Drag di waveform membuat/mengubah rentang baris aktif.
   - Bagian (tambah, ganti nama, naik/turun, hapus); baris (tambah, hapus, naik/turun).
   - Tiap baris: rentang waktu, ▶ (putar rentang, ikut toggle loop), chord, not angka (input + pratinjau rapi), lirik, catatan.

## Notasi not angka (input → tampilan)
| Ketik | Arti |
|---|---|
| `1`–`7`, `0` | not, istirahat |
| `'` setelah not (boleh berulang) | titik atas / oktaf naik |
| `,` setelah not (boleh berulang) | titik bawah / oktaf turun |
| `#` / `b` sebelum not | kres / mol |
| `( … )` | grup 1 garis ritme (½ ketuk) |
| `(( … ))` | grup 2 garis (¼ ketuk) |
| `.` setelah not | not bertitik |
| `-` | tahan 1 ketuk |
| `~` di antara not | ikatan (sinkop) |
| `\|` | garis birama |
Teks yang tidak dikenali tetap ditampilkan apa adanya (tidak pernah error).

## Sinkron & error
- Autosave debounce 1 s; indikator Tersimpan / Menyimpan… / Gagal (klik untuk coba lagi).
- Sebelum menyimpan, bandingkan `updated_at` server dengan versi yang dimuat; bila server lebih baru, tanya: timpa atau muat ulang.
- mp3 diunduh lewat signed URL dan di-cache di Cache Storage browser.

## Pengujian
- Unit test parser notasi (Node `node --test`).
- Uji manual lewat browser: desktop & ukuran HP — login, upload, tandai, putar rentang, loop, tempo, sinkron.

## Di luar cakupan (YAGNI)
Transpose audio, pre-roll, kolaborasi, offline-first, ekspor PDF.
