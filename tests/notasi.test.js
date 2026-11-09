import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, render } from '../js/notasi.js';

const notes = (s) => parse(s).filter((t) => t.type === 'note');

test('not polos', () => {
  const n = notes('1 2 3');
  assert.deepEqual(n.map((t) => t.digit), ['1', '2', '3']);
  assert.ok(n.every((t) => t.up === 0 && t.down === 0 && t.depth === 0));
});

test('oktaf atas dan bawah', () => {
  const [a, b, c] = notes("1' 5,, 3''");
  assert.equal(a.up, 1);
  assert.equal(b.down, 2);
  assert.equal(c.up, 2);
});

test('kres, mol, bertitik', () => {
  const [a, b, c] = notes('#4 b7 5.');
  assert.equal(a.acc, '#');
  assert.equal(b.acc, 'b');
  assert.equal(c.dot, true);
});

test('grup ritme satu dan dua garis', () => {
  const n = notes('(5 6) ((1 2 3 4)) 7');
  assert.deepEqual(n.map((t) => t.depth), [1, 1, 2, 2, 2, 2, 0]);
});

test('grup nempel tanpa spasi', () => {
  const n = notes('(56)');
  assert.deepEqual(n.map((t) => [t.digit, t.depth]), [['5', 1], ['6', 1]]);
});

test('ikatan menandai not sebelumnya', () => {
  const n = notes('(5 6~) 6');
  assert.equal(n[1].tie, true);
  assert.equal(n[0].tie, false);
});

test('tahan dan garis birama', () => {
  const types = parse('5 - | 3').map((t) => t.type);
  assert.deepEqual(types, ['note', 'hold', 'bar', 'note']);
});

test('kurung tidak seimbang tidak error', () => {
  assert.doesNotThrow(() => parse('((5 6 ) ) ) 1'));
  assert.equal(notes(')) 1')[0].depth, 0);
});

test('teks tak dikenal tetap ditampilkan', () => {
  const t = parse('5 rit. 3');
  assert.ok(t.some((x) => x.type === 'text' && x.text === 'rit.'));
});

test('b tanpa angka adalah teks', () => {
  const t = parse('bend 5');
  assert.equal(t[0].type, 'text');
  assert.equal(t[0].text, 'bend');
});

test('render meng-escape HTML', () => {
  const html = render('<script> 5');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('render string kosong', () => {
  assert.equal(render(''), '');
});
