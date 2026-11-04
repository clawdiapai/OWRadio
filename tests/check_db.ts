import { sqlite } from '../src/db/index.js';

const songs = (sqlite.prepare('SELECT count(*) as c FROM songs').get() as any).c;
const embeddings = (sqlite.prepare('SELECT count(*) as c FROM song_embeddings').get() as any).c;

console.log(JSON.stringify({ songs, embeddings }));
