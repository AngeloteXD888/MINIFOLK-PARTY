/**
 * Script de parcheo único para añadir el binding del botón dado.
 * Ejecutar con: node patch_dice.js
 * Borrar después de usarlo.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'app.js');
let content = fs.readFileSync(filePath, 'utf8');

// Buscamos la línea de activar vista inicial para insertar antes
const insertBefore = `  // Activar la vista inicial
  showView('password');`;

const newCode = `  // ── Botón "Tirar Dado" (controlador móvil en partida) ─────────────────
  $('btn-roll-dice')?.addEventListener('click', () => {
    if (!state.turnoActivo || !state.socket) return;
    state.socket.emit('dice:roll', {
      roomCode: state.roomCode,
      playerId: state.playerId,
    });
    // Deshabilitar brevemente para evitar doble clic
    const btn = $('btn-roll-dice');
    if (btn) {
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 800);
    }
  });

  `;

if (content.includes(insertBefore)) {
  content = content.replace(insertBefore, newCode + insertBefore);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ Binding de dado añadido correctamente');
} else {
  console.log('⚠️  Fragmento no encontrado. Mostrando contexto:');
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.includes('Activar la vista inicial'));
  console.log('Líneas:', lines.slice(Math.max(0, idx - 4), idx + 3).join('\n'));
}
