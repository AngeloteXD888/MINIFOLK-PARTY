const fs = require('fs');
const path = require('path');

const brainDir = 'C:\\Users\\angel\\.gemini\\antigravity-ide\\brain\\2f2d89be-abe3-4167-880d-905f85d232fd';

async function main() {
  const res = await fetch('http://localhost:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.title && t.title.includes('Preview Minijuegos 3D'));
  if (!page) {
    console.error('Page target not found:', targets);
    process.exit(1);
  }

  console.log('Connecting to:', page.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onopen = async () => {
    console.log('Connected to CDP!');

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    const minigames = [
      'reaccion_luces',
      'carrera_guadiana',
      'carrera_coches',
      'memory_monumentos',
      'pulso_fuerza',
      'carnaval_caramelos',
      'esquivar_muralla',
      'equilibrio_puente',
      'lluvia_bellotas'
    ];

    for (const mgId of minigames) {
      console.log(`\n--- Switching to ${mgId} ---`);
      await send('Runtime.evaluate', {
        expression: `
          (function() {
            const sel = document.getElementById('select-game');
            sel.value = '${mgId}';
            sel.dispatchEvent(new Event('change'));
          })()
        `
      });

      // Wait 1.5 seconds for scene to render and animate
      await new Promise(r => setTimeout(r, 1800));

      const ss = await send('Page.captureScreenshot', { format: 'png' });
      const imgPath = path.join(brainDir, `preview_${mgId}.png`);
      fs.writeFileSync(imgPath, Buffer.from(ss.data, 'base64'));
      console.log(`Saved screenshot: preview_${mgId}.png (${fs.statSync(imgPath).size} bytes)`);
    }

    console.log('\nAll 9 minigames captured successfully!');
    ws.close();
    process.exit(0);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value || a.description).join(' ');
      console.log(`[Browser Console ${data.params.type}]`, args);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[Browser Exception]', data.params.exceptionDetails);
    }
  };

  ws.onerror = (err) => console.error('WS Error:', err);
}

main().catch(err => console.error('Main error:', err));
