/**
 * Test prototype for BroadcastTee PCM Pacer with drift compensation.
 */
import { spawn } from 'node:child_process';
import deezer from '../src/services/deezer.js';

const FRAME_SIZE = 3840; // 20ms at 48kHz stereo s16le

async function run() {
  console.log('Testing Deezer search...');
  const tracks = await deezer.searchTracks('Daft Punk One More Time', 1);
  if (!tracks.length || !tracks[0].previewUrl) {
    console.error('No preview URL found');
    return;
  }

  const streamUrl = tracks[0].previewUrl;
  console.log('Stream URL:', streamUrl);

  const decoder = spawn('ffmpeg', [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', streamUrl,
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    '-vn',
    '-loglevel', 'error',
    'pipe:1',
  ]);

  const pcmQueue: Buffer[] = [];
  let queueBytes = 0;
  let decoderClosed = false;

  decoder.stdout.on('data', (chunk: Buffer) => {
    pcmQueue.push(chunk);
    queueBytes += chunk.length;

    // Buffer up to 5 seconds (960KB), then pause stdout
    if (queueBytes > 48000 * 4 * 5) {
      decoder.stdout.pause();
    }
  });

  decoder.on('close', (code) => {
    decoderClosed = true;
    console.log(`\n[Decoder] ffmpeg reached EOF (code: ${code}). Buffered audio left: ${(queueBytes / (48000 * 4)).toFixed(1)}s`);
  });

  let totalFramesPushed = 0;
  const start = Date.now();

  function popFrame(): Buffer | null {
    if (queueBytes < FRAME_SIZE) return null;
    let needed = FRAME_SIZE;
    const chunksToTake: Buffer[] = [];

    while (needed > 0 && pcmQueue.length > 0) {
      const head = pcmQueue[0];
      if (head.length <= needed) {
        chunksToTake.push(head);
        needed -= head.length;
        queueBytes -= head.length;
        pcmQueue.shift();
      } else {
        chunksToTake.push(head.subarray(0, needed));
        pcmQueue[0] = head.subarray(needed);
        queueBytes -= needed;
        needed = 0;
      }
    }
    return Buffer.concat(chunksToTake);
  }

  const interval = setInterval(() => {
    const elapsedMs = Date.now() - start;
    const targetFrames = Math.floor(elapsedMs / 20);

    // Catch up if timer was delayed by event loop tick
    while (totalFramesPushed < targetFrames && queueBytes >= FRAME_SIZE) {
      const frame = popFrame();
      if (!frame) break;
      totalFramesPushed++;

      // Resume decoder if buffer dropped below 2 seconds (384KB)
      if (queueBytes < 48000 * 4 * 2 && !decoderClosed && decoder.stdout.isPaused()) {
        decoder.stdout.resume();
      }

      if (totalFramesPushed % 100 === 0) {
        const elapsedSec = elapsedMs / 1000;
        const playedSec = (totalFramesPushed * 20) / 1000;
        const driftMs = Math.round((playedSec - elapsedSec) * 1000);
        console.log(`Playback: ${playedSec.toFixed(1)}s / Elapsed: ${elapsedSec.toFixed(1)}s | Buffered: ${(queueBytes / (48000 * 4)).toFixed(1)}s | Drift: ${driftMs}ms`);
      }
    }

    if (decoderClosed && queueBytes === 0) {
      clearInterval(interval);
      const elapsedSec = (Date.now() - start) / 1000;
      const playedSec = (totalFramesPushed * 20) / 1000;
      console.log(`\n🎉 Track finished playing naturally! Total audio: ${playedSec.toFixed(1)}s in ${elapsedSec.toFixed(1)}s real-time!`);
      process.exit(0);
    }
  }, 10); // Run at 10ms for high-precision jitter-free delivery
}

run();
