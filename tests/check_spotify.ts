import { sqlite } from '../src/db/index.js';

const song = sqlite.prepare("SELECT id, title, artist FROM songs WHERE id LIKE '%3s5lo6lqa39kM9A5AFsVpR%'").all();
console.log('TRACK:', song);

const spotifyCount = (sqlite.prepare("SELECT count(*) as c FROM songs WHERE id LIKE 'yt_spotify:%'").get() as any).c;
console.log('TOTAL yt_spotify SONGS IN DB:', spotifyCount);

const badCache = sqlite.prepare("SELECT * FROM stream_cache WHERE stream_url LIKE '%spotify%'").all();
console.log('BAD STREAM CACHE ENTRIES:', badCache);
