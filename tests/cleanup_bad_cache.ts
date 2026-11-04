import { sqlite } from '../src/db/index.js';

const res = sqlite.prepare("DELETE FROM stream_cache WHERE stream_url LIKE '%spotify%' OR youtube_id LIKE '%spotify%'").run();
console.log(`Deleted ${res.changes} bad entries from stream_cache.`);
