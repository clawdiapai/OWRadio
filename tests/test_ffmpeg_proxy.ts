import { spawn } from 'node:child_process';

async function test() {
  console.log('Testing yt-dlp -> ffmpeg pipeline...');
  const ytdlp = spawn('yt-dlp', [
    '--no-warnings',
    '--no-check-certificates',
    '-f', 'bestaudio[acodec=opus]/bestaudio',
    '-o', '-',
    'https://www.youtube.com/watch?v=F6_BSFHaCDU',
  ]);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    '-vn',
    '-loglevel', 'error',
    'pipe:1',
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);

  let totalPcmBytes = 0;
  ffmpeg.stdout.on('data', (chunk) => {
    totalPcmBytes += chunk.length;
    if (totalPcmBytes > 3840 * 100) { // 2 seconds of 48kHz audio
      console.log(`🎉 SUCCESS! Decoded ${totalPcmBytes} bytes of 48kHz PCM audio directly from YouTube!`);
      ytdlp.kill('SIGKILL');
      ffmpeg.kill('SIGKILL');
      process.exit(0);
    }
  });

  ffmpeg.stderr.on('data', (err) => {
    console.error('ffmpeg err:', err.toString().trim());
  });

  ytdlp.stderr.on('data', (err) => {
    const msg = err.toString().trim();
    if (!msg.includes('Sleeping') && !msg.includes('%')) {
      console.log('ytdlp:', msg);
    }
  });
}

test();
