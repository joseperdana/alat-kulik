import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMtcDecoder, quarterFrames } from '../js/midi.js';

// Kirim quarter frame seperti DAW: satu per (1/fps/4) detik.
function play(dec, startSec, cycles, rate = 1, t0 = 0) {
  const fps = [24, 25, 30, 30][rate];
  const qMs = 1000 / fps / 4;
  let at = t0;
  for (let c = 0; c < cycles; c++) {
    for (const msg of quarterFrames(startSec + (c * 2) / fps, rate)) {
      dec.feed(msg, at);
      at += qMs;
    }
  }
  return at - qMs; // waktu pesan terakhir
}

test('belum terkunci sebelum siklus lengkap', () => {
  const dec = createMtcDecoder({ now: () => 0 });
  quarterFrames(10).slice(0, 5).forEach((m) => dec.feed(m, 0));
  assert.equal(dec.position(0).locked, false);
});

test('quarter frame 25 fps → posisi benar dan berjalan', () => {
  const dec = createMtcDecoder({ now: () => 0 });
  const last = play(dec, 83.4, 4); // 1:23.4
  const p = dec.position(last);
  assert.ok(p.locked && p.running);
  assert.equal(p.rate, '25');
  // Siklus terakhir mulai di 83.4 + 6 frame; piece 7 = +1.75 frame.
  assert.ok(Math.abs(p.time - (83.4 + 6 / 25 + 1.75 / 25)) < 0.002, p.time);
});

test('jam & rate 30 fps terbaca', () => {
  const dec = createMtcDecoder({ now: () => 0 });
  const last = play(dec, 3600 + 61, 1, 3);
  const p = dec.position(last);
  assert.equal(p.rate, '30');
  assert.ok(Math.abs(p.time - (3661 + 1.75 / 30)) < 0.002);
});

test('tidak ada quarter frame → berhenti', () => {
  const dec = createMtcDecoder({ now: () => 0 });
  const last = play(dec, 20, 2);
  assert.equal(dec.position(last + 500).running, false);
});

test('ekstrapolasi dibatasi agar tidak kebablasan', () => {
  const dec = createMtcDecoder({ now: () => 0 });
  const last = play(dec, 20, 2);
  const a = dec.position(last).time;
  const b = dec.position(last + 100).time; // masih < batas berhenti
  assert.ok(b - a <= 2 / (25 * 4) + 1e-9);
});

test('full frame SysEx = lompat posisi, transport berhenti', () => {
  const dec = createMtcDecoder({ now: () => 0 });
  // 25 fps (rate 1 → bit 5), 00:02:05:10
  dec.feed([0xf0, 0x7f, 0x7f, 0x01, 0x01, 1 << 5, 2, 5, 10, 0xf7]);
  const p = dec.position(0);
  assert.ok(p.locked && !p.running);
  assert.ok(Math.abs(p.time - (125 + 10 / 25)) < 1e-9);
});
