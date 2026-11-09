import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseChordSheet, isChordLine } from '../js/impor.js';

const sample = readFileSync(new URL('./fixtures/nastalaya.txt', import.meta.url), 'utf8');
const sheet = parseChordSheet(sample);
const sec = (name) => sheet.sections.find((s) => s.name === name);

test('judul dan kunci dari baris pertama', () => {
  assert.equal(sheet.title, 'NASTALAYA');
  assert.equal(sheet.key, 'F');
});

test('urutan bagian termasuk salinan dari "Back to"', () => {
  assert.deepEqual(
    sheet.sections.map((s) => s.name),
    ['Intro', 'Verse', 'Reff', 'Interlude 1', 'Verse (2)', 'Reff (2)', 'Reff 2', 'Interlude 2A', 'Interlude 2B', 'Coda'],
  );
});

test('chord dipasangkan dengan lirik di bawahnya', () => {
  const v = sec('Verse').lines;
  assert.deepEqual(v[0], { chords: 'Dm Am', lyrics: 'Inikah?' });
  assert.deepEqual(v[1], { chords: 'Bb', lyrics: 'Petaka yang Kutakuti' });
  assert.deepEqual(v[2], { chords: '', lyrics: 'Hadir dan tampakkan diri' });
  assert.equal(v.at(-1).chords, 'E              A               D');
  assert.equal(v.at(-1).lyrics, 'Harap Mimpi Belaka');
  assert.equal(v.length, 6);
});

test('baris chord tanpa lirik jadi baris sendiri', () => {
  assert.deepEqual(sec('Intro').lines, [
    { chords: 'Dm… Bb…', lyrics: '' },
    { chords: 'Gm…', lyrics: '' },
  ]);
  assert.equal(sec('Interlude 2B').lines.length, 6);
  assert.equal(sec('Coda').lines[1].chords, 'D   G D/F# G Gm');
});

test('salinan berisi baris yang sama tapi objek terpisah', () => {
  assert.deepEqual(sec('Verse (2)').lines, sec('Verse').lines);
  assert.notEqual(sec('Verse (2)').lines[0], sec('Verse').lines[0]);
});

test('deteksi baris chord', () => {
  for (const l of ['Dm… Bb…', 'Gm-A', 'C#dim-Edim-Gdim-Bbdim', 'D …………….', 'A/C# G#dim', 'F#m  Gm', 'Cmaj7 Dsus4 G7 Am7/G', 'N.C. | G x2'])
    assert.ok(isChordLine(l), l);
  for (const l of ['Inikah?', 'Realita', 'Dan bila kau pergi', 'Back to Verse', 'Coda:', 'Do = G'])
    assert.ok(!isChordLine(l), l);
});

test('nada dasar gaya "Do = G"', () => {
  const s = parseChordSheet('Judul Lagu\nDo = G\nVerse:\nG D\nhalo');
  assert.equal(s.title, 'Judul Lagu');
  assert.equal(s.key, 'G');
  assert.deepEqual(s.sections.map((x) => x.name), ['Verse']);
});

test('nama bagian bertanda hubung pada "Back to"', () => {
  const s = parseChordSheet('Pre-chorus:\nC\nReff:\nG\nBack to Pre-chorus-Reff\nCoda:\nC');
  assert.deepEqual(s.sections.map((x) => x.name), ['Pre-chorus', 'Reff', 'Pre-chorus (2)', 'Reff (2)', 'Coda']);
});

test('header kurung siku dan header dengan chord di baris yang sama', () => {
  const s = parseChordSheet('Lagu Tes\n[Verse 1]\nC G\nhalo dunia\nChorus: F G C\n');
  assert.deepEqual(s.sections.map((x) => x.name), ['Verse 1', 'Chorus']);
  assert.deepEqual(s.sections[1].lines, [{ chords: 'F G C', lyrics: '' }]);
  assert.equal(s.title, 'Lagu Tes');
  assert.equal(s.key, '');
});

test('teks tanpa header masuk ke satu bagian', () => {
  const s = parseChordSheet('C G\nla la la');
  assert.equal(s.sections.length, 1);
  assert.equal(s.sections[0].lines[0].lyrics, 'la la la');
});

test('teks kosong', () => {
  assert.deepEqual(parseChordSheet('   \n').sections, []);
});
