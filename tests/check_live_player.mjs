import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const http = require('http');

http.get('http://127.0.0.1:8091/api/nowplaying', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('State:', json.state);
    console.log('Track:', json.track?.artist, '-', json.track?.title);
    console.log('Elapsed / Duration:', json.track?.elapsedSec, '/', json.track?.durationSec);
    console.log('AudioMeter:', json.audioMeter);
  });
});
