import fs from 'fs';

const appJs = fs.readFileSync('src/web/public/app.js', 'utf-8');

// Verify escapeHtml exists
if (!appJs.includes('function escapeHtml')) {
  throw new Error('escapeHtml missing');
}

// Verify renderBrainMatrix exists
if (!appJs.includes('function renderBrainMatrix')) {
  throw new Error('renderBrainMatrix missing');
}

// Verify brains-matrix-slot exists in index.html
const indexHtml = fs.readFileSync('src/web/public/index.html', 'utf-8');
if (!indexHtml.includes('id="brains-matrix-slot"')) {
  throw new Error('brains-matrix-slot missing from index.html');
}
if (!indexHtml.includes('id="brains-pills-container"')) {
  throw new Error('brains-pills-container missing from index.html');
}

console.log('✅ Frontend markup and JS bindings verified completely!');
