// Mengubah catatan chord teks bebas (dari WhatsApp/Notes) menjadi bagian-bagian lagu.
// Hasil: { title, key, sections: [ { name, lines: [ { chords, lyrics } ] } ] }

const CHORD = /^[A-G][#b♯♭]?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+)?(?:\d+|sus\d*|add\d+|maj\d*|dim\d*|aug|[#b+-]\d+|\([^)]*\))*(?:\/[A-G][#b♯♭]?)?$/;
const FILLER = /^(?:[.…|%\-–—~/]+|\(?x\d+\)?|N\.?C\.?)$/i;
const KEYWORD =
  /^(?:intro|verse|reff?|chorus|pre[- ]?(?:chorus|reff?)|bridge|interlude|coda|outro|ending|solo|instrumen(?:tal)?|musik)\b.{0,15}$/i;
const NAV = /^(?:back\s+to|kembali\s+ke|balik\s+ke|repeat|ulangi?(?:\s+ke)?)\s+(.+)$/i;
const KEY_LINE = /^(?:do|nada\s+dasar|key|kunci)\s*[=:]\s*([A-G][#b]?m?)\s*$/i;
const TITLE_KEY = /^(.*?)\s*\(\s*(?:do\s*=\s*)?([A-G][#b]?m?)\s*\)\s*$/i;

function isChordToken(tok) {
  const t = tok.replace(/[.…,]+$/, '');
  if (!t) return 'filler';
  if (FILLER.test(t)) return 'filler';
  const parts = t.split(/[-–]/).filter(Boolean);
  return parts.length && parts.every((p) => CHORD.test(p.replace(/[.…]+$/, ''))) ? 'chord' : null;
}

export function isChordLine(line) {
  const toks = String(line).trim().split(/\s+/).filter(Boolean);
  let chords = 0;
  for (const t of toks) {
    const k = isChordToken(t);
    if (!k) return false;
    if (k === 'chord') chords++;
  }
  return chords > 0;
}

function header(line) {
  let m = line.match(/^\[([^\]]{1,40})\]\s*(.*)$/);
  if (m) return { name: m[1].trim(), rest: m[2].trim() };
  m = line.match(/^([^:]{1,30}):\s*(.*)$/);
  if (m && m[1].trim().split(/\s+/).length <= 4 && !isChordLine(m[1])) return { name: m[1].trim(), rest: m[2].trim() };
  if (KEYWORD.test(line) && !isChordLine(line)) return { name: line.trim(), rest: '' };
  return null;
}

// "Verse-Reff-Reff 2" → ['Verse','Reff','Reff 2'], tetap mengenali nama bertanda hubung (Pre-chorus).
function splitNames(text, known) {
  const pieces = text.split(/\s*(?:-|–|,|→|>|\+|\blalu\b|\bthen\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < pieces.length; i++) {
    let took = false;
    for (let j = pieces.length - 1; j > i; j--) {
      const cand = pieces.slice(i, j + 1).join('-');
      if (known.has(cand.toLowerCase())) {
        out.push(cand);
        i = j;
        took = true;
        break;
      }
    }
    if (!took) out.push(pieces[i]);
  }
  return out;
}

export function parseChordSheet(text) {
  const rows = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''));

  let title = '';
  let key = '';
  const items = []; // { section } | { nav: string }
  let cur = null;
  let pending = null; // baris chord yang menunggu lirik
  let seenContent = false;

  const ensureSection = () => {
    if (!cur) {
      cur = { name: 'Bagian 1', lines: [] };
      items.push({ section: cur });
    }
    return cur;
  };
  const flush = () => {
    if (pending != null) ensureSection().lines.push({ chords: pending, lyrics: '' });
    pending = null;
  };

  for (const raw of rows) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }

    if (!seenContent && !items.length) {
      const km = line.match(KEY_LINE);
      if (km) {
        key = km[1];
        continue;
      }
      if (!title && !header(line) && !isChordLine(line) && !NAV.test(line)) {
        const tm = line.match(TITLE_KEY);
        if (tm) {
          title = tm[1].trim();
          key = tm[2];
        } else title = line;
        continue;
      }
    }

    const nav = line.match(NAV);
    if (nav) {
      flush();
      items.push({ nav: nav[1] });
      continue;
    }

    const h = header(line);
    if (h) {
      flush();
      cur = { name: h.name, lines: [] };
      items.push({ section: cur });
      seenContent = true;
      if (h.rest) {
        if (isChordLine(h.rest)) pending = h.rest;
        else cur.lines.push({ chords: '', lyrics: h.rest });
      }
      continue;
    }

    seenContent = true;
    if (isChordLine(line)) {
      flush();
      pending = raw.trim();
    } else {
      ensureSection().lines.push({ chords: pending ?? '', lyrics: line });
      pending = null;
    }
  }
  flush();

  // Susun urutan akhir; "Back to X-Y" menyalin bagian yang sudah ada sebelumnya.
  const known = new Set(items.filter((i) => i.section).map((i) => i.section.name.toLowerCase()));
  const sections = [];
  const count = new Map();
  for (const it of items) {
    if (it.section) {
      sections.push(it.section);
      const k = it.section.name.toLowerCase();
      count.set(k, (count.get(k) || 0) + 1);
      continue;
    }
    for (const name of splitNames(it.nav, known)) {
      const k = name.toLowerCase();
      const src = sections.find((s) => s.name.toLowerCase() === k);
      if (!src) break; // bagian yang disebut belum muncul → itu bagian berikutnya, berhenti di sini
      const n = (count.get(k) || 1) + 1;
      count.set(k, n);
      sections.push({ name: `${src.name} (${n})`, lines: src.lines.map((l) => ({ ...l })) });
    }
  }

  return { title, key, sections };
}
