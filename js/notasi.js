// Parser & renderer not angka.
// Singkatan: 1-7 / 0, ' (oktaf atas), , (oktaf bawah), #/b (kres/mol), . (bertitik),
// ( ) satu garis ritme, (( )) dua garis, - tahan, ~ ikatan, | garis birama.
// Potongan yang tidak dikenali dikembalikan sebagai teks, tidak pernah error.

const MUSIC_CHUNK = /^[()#b0-7',.\-~|]+$/;

export function parse(input) {
  const tokens = [];
  let depth = 0;
  let seg = 0; // naik setiap kali kedalaman grup kembali ke 0 (memisahkan garis ritme)

  for (const chunk of String(input ?? '').split(/\s+/).filter(Boolean)) {
    const parsed = MUSIC_CHUNK.test(chunk) ? parseChunk(chunk, depth, seg, tokens) : null;
    if (parsed) {
      tokens.push(...parsed.tokens);
      depth = parsed.depth;
      seg = parsed.seg;
      if (parsed.tieLast) lastNote(tokens, parsed.tokens.length).tie = true;
    } else {
      tokens.push({ type: 'text', text: chunk, depth: 0, seg: ++seg });
      seg++;
    }
  }
  return tokens;
}

function lastNote(tokens, skipTail) {
  for (let i = tokens.length - 1 - skipTail; i >= 0; i--) {
    if (tokens[i].type === 'note') return tokens[i];
  }
  return {};
}

function parseChunk(chunk, depth, seg, prior) {
  const out = [];
  let acc = '';
  let tieLast = false; // ~ di awal potongan → ikat not sebelumnya di potongan lain
  const prevNote = () => {
    for (let i = out.length - 1; i >= 0; i--) if (out[i].type === 'note') return out[i];
    return null;
  };

  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i];
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) seg++;
    } else if (c === '|') {
      out.push({ type: 'bar' });
      seg++;
    } else if (c === '-') {
      out.push({ type: 'hold', depth, seg });
    } else if (c === '~') {
      const p = prevNote();
      if (p) p.tie = true;
      else if (prior.some((t) => t.type === 'note')) tieLast = true;
      else return null;
    } else if (c === '#' || c === 'b') {
      if (!/[0-7]/.test(chunk[i + 1] ?? '')) return null;
      acc = c;
    } else if (/[0-7]/.test(c)) {
      const note = { type: 'note', digit: c, acc, up: 0, down: 0, dot: false, tie: false, depth, seg };
      acc = '';
      while (i + 1 < chunk.length && /[',.]/.test(chunk[i + 1])) {
        const m = chunk[++i];
        if (m === "'") note.up++;
        else if (m === ',') note.down++;
        else note.dot = true;
      }
      out.push(note);
    } else {
      return null; // ' , . tanpa not di depannya
    }
  }
  if (depth === 0) seg++;
  return { tokens: out, depth, seg, tieLast };
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const dots = (n) => '•'.repeat(n);

export function render(input) {
  const tokens = parse(input);
  let html = '';
  let prev = null;
  for (const t of tokens) {
    const joined =
      prev && (t.type === 'note' || t.type === 'hold') && (prev.type === 'note' || prev.type === 'hold') &&
      t.depth > 0 && prev.depth > 0 && t.seg === prev.seg;
    if (prev && !joined) html += '<span class="sp"></span>';

    if (t.type === 'note' || t.type === 'hold') {
      const glyph =
        t.type === 'hold'
          ? '–'
          : `${t.acc ? `<span class="acc">${t.acc === '#' ? '♯' : '♭'}</span>` : ''}${t.digit}${t.dot ? '<span class="dt">.</span>' : ''}`;
      html +=
        `<span class="n${t.tie ? ' tie' : ''}">` +
        `<span class="up">${dots(t.up || 0)}</span>` +
        `<span class="g">${glyph}</span>` +
        '<span class="ln"></span>'.repeat(Math.min(t.depth, 3)) +
        `<span class="dn">${dots(t.down || 0)}</span>` +
        '</span>';
    } else if (t.type === 'bar') {
      html += '<span class="bar"></span>';
    } else {
      html += `<span class="tx">${esc(t.text)}</span>`;
    }
    prev = t;
  }
  return html;
}
