// Semua akses ke Supabase (auth, tabel songs, storage audio) ada di sini.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.100.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY, AUDIO_BUCKET } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// ---------- Auth ----------
export const getSession = async () => must(await sb.auth.getSession()).session;
export const onAuth = (cb) => sb.auth.onAuthStateChange((_e, session) => cb(session));
export const signIn = async (email, password) => must(await sb.auth.signInWithPassword({ email, password }));
export const signUp = async (email, password) =>
  must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
export const signOut = () => sb.auth.signOut();

// ---------- Songs ----------
const LIST_COLS = 'id,title,artist,song_key,bpm,audio_path,updated_at';

export const listSongs = async () =>
  must(await sb.from('songs').select(LIST_COLS).order('updated_at', { ascending: false }));

export const getSong = async (id) => must(await sb.from('songs').select('*').eq('id', id).single());

export const getUpdatedAt = async (id) =>
  must(await sb.from('songs').select('updated_at').eq('id', id).single()).updated_at;

export const createSong = async (fields) => must(await sb.from('songs').insert(fields).select('*').single());

export const updateSong = async (id, fields) =>
  must(await sb.from('songs').update(fields).eq('id', id).select('updated_at').single());

export async function deleteSong(song) {
  if (song.audio_path) await sb.storage.from(AUDIO_BUCKET).remove([song.audio_path]);
  must(await sb.from('songs').delete().eq('id', song.id));
  await dropCachedAudio(song.audio_path);
}

// ---------- Audio ----------
export async function uploadAudio(songId, file) {
  const { user } = await getSession();
  const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
  const path = `${user.id}/${songId}-${Date.now()}.${ext}`;
  must(
    await sb.storage.from(AUDIO_BUCKET).upload(path, file, {
      contentType: file.type || 'audio/mpeg',
      upsert: true,
    }),
  );
  return path;
}

export async function removeAudio(path) {
  if (!path) return;
  await sb.storage.from(AUDIO_BUCKET).remove([path]);
  await dropCachedAudio(path);
}

// mp3 disimpan di Cache Storage supaya pemutaran berikutnya tidak menyedot kuota.
const CACHE = 'alat-kulik-audio-v1';
const cacheKey = (path) => new Request(`./__audio/${encodeURIComponent(path)}`);
const hasCache = () => typeof caches !== 'undefined';

export async function audioBlobUrl(path) {
  if (hasCache()) {
    try {
      const hit = await (await caches.open(CACHE)).match(cacheKey(path));
      if (hit) return URL.createObjectURL(await hit.blob());
    } catch {
      /* cache tidak tersedia, lanjut unduh */
    }
  }
  const blob = must(await sb.storage.from(AUDIO_BUCKET).download(path));
  if (hasCache()) {
    try {
      await (await caches.open(CACHE)).put(cacheKey(path), new Response(blob));
    } catch {
      /* abaikan */
    }
  }
  return URL.createObjectURL(blob);
}

async function dropCachedAudio(path) {
  if (!path || !hasCache()) return;
  try {
    await (await caches.open(CACHE)).delete(cacheKey(path));
  } catch {
    /* abaikan */
  }
}
