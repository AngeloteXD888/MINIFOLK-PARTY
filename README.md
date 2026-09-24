# Badajoz Party 🎉

> Juego multijugador estilo Mario Party ambientado en Badajoz.  
> Un dispositivo hace de Pantalla compartida (tablero 3D); los demás actúan como mandos desde el móvil.

---

## 🚀 Instrucciones de arranque (local)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y establece:
```
MASTER_PASSWORD=TuContraseñaSegura
PORT=3000
PUBLIC_URL=http://localhost:3000
```

### 3. Copiar las imágenes de avatares

Copia tus 8 imágenes a `public/avatars/` con **exactamente estos nombres**:

| Avatar  | Tablero (cuerpo entero)    | Selección (cabeza/hombros)    |
|---------|----------------------------|-------------------------------|
| Ángel   | `angel_tablero.png`        | `angel_seleccion.png`         |
| Lidia   | `lidia_tablero.png`        | `lidia_seleccion.png`         |
| María   | `maria_tablero.png`        | `maria_seleccion.png`         |
| Raúl    | `raul_tablero.png`         | `raul_seleccion.png`          |

> ⚠️ El archivo de Ángel tiene tilde en el nombre original (`Ángel_tablero.png`). Renómbralo a `angel_tablero.png` (sin tilde, minúscula).

### 4. Iniciar el servidor

```bash
npm start
```

Para desarrollo (reinicio automático al cambiar archivos):
```bash
npm run dev
```

### 5. Abrir en el navegador

- **Pantalla:** `http://localhost:3000` en el portátil/tablet
- **Móvil (misma red):** `http://[IP_LOCAL]:3000` (ej: `http://192.168.1.50:3000`)

---

## 🧪 Tests automatizados

```bash
npm test
```

Ejecuta 12 pruebas e2e que cubren todo el checklist de la Fase 1.

---

## ☁️ Despliegue en Render (HTTPS público permanente)

### ¿Por qué Render?

- **HTTPS automático** en `*.onrender.com` (requerido para Wake Lock y giroscopio en iOS)
- Capa gratuita con servicios web persistentes
- Fácil integración con GitHub (deploy automático en cada push)
- Sin configuración de certificados locales

### Pasos

1. **Sube el proyecto a GitHub** (asegúrate de que `.env` está en `.gitignore`)

2. **Crea una cuenta en [render.com](https://render.com)**

3. **Nuevo servicio web:**
   - Conecta tu repositorio GitHub
   - Render detectará `render.yaml` automáticamente (Blueprint)
   - O configura manualmente:
     - **Build Command:** `npm install`
     - **Start Command:** `node server.js`
     - **Runtime:** Node

4. **Variables de entorno** (en el dashboard de Render → Environment):
   ```
   MASTER_PASSWORD = TuContraseñaSegura
   PUBLIC_URL      = https://badajoz-party.onrender.com
   ```
   > ⚠️ `MASTER_PASSWORD` es **secreta**: configúrala en el dashboard, nunca en el código.

5. **Deploy** → Render da una URL como `https://badajoz-party.onrender.com`

6. **Actualiza `PUBLIC_URL`** en las variables de entorno con esa URL.

### Probar desde móvil con datos (sin WiFi)

1. Abre `https://badajoz-party.onrender.com` en el móvil con datos móviles
2. Introduce la contraseña maestra
3. Crea una sala o únete con el código QR
4. ¡El QR contendrá la URL pública de Render!

### Notas del plan gratuito de Render

- Los servicios gratuitos se **suspenden tras 15 min de inactividad** (cold start ~30s)
- Para mantenerlo activo: configura un ping periódico (ej. [cron-job.org](https://cron-job.org) haciendo GET a `/health` cada 10 min)
- Alternativa: actualiza a Starter ($7/mes) para instancias siempre activas

---

## 📁 Estructura del proyecto

```
badajoz-party/
├── .env.example          # Variables de entorno de ejemplo
├── .gitignore
├── package.json          # Dependencias con versiones fijadas
├── render.yaml           # Config declarativa para Render
├── server.js             # Servidor Express + Socket.io
├── PROTOCOL.md           # Protocolo de eventos Socket.io
├── src/
│   └── roomManager.js    # Gestión de estado de salas (sin dependencias de transporte)
├── public/
│   ├── index.html        # SPA principal
│   ├── style.css         # Sistema de diseño completo
│   ├── app.js            # Lógica cliente (ES module)
│   ├── screen.js         # Escena Three.js r167 (vista Pantalla)
│   └── avatars/
│       ├── avatars.json  # Catálogo de avatares (ampliable sin tocar código)
│       ├── angel_tablero.png
│       ├── angel_seleccion.png
│       └── ...
└── test/
    └── e2e.test.js       # Tests e2e automatizados (socket.io-client)
```

---

## ✅ Checklist de pruebas manuales

| # | Prueba | Cómo verificar |
|---|--------|----------------|
| 1 | Contraseña incorrecta | Introducir contraseña mala → mensaje de error + contador de intentos |
| 2 | Crear sala como Pantalla | Elegir "Ser la Pantalla" → aparece QR + código de sala |
| 3 | Crear sala como Jugador | Elegir "Ser Jugador" → lobby de jugador con badge de color |
| 4 | Unir 2 móviles por QR | Escanear QR → aparecen en la lista de la Pantalla |
| 5 | Sala llena (5.º rechazado) | 4 jugadores + 1 más → toast de error "sala llena" |
| 6 | Avatar duplicado | Dos jugadores intentan el mismo avatar → 2.º recibe error |
| 7 | Reconexión por playerId | Refrescar el móvil → recupera nombre, avatar, color y listo |
| 8 | Caída de la Pantalla | Cerrar la pestaña del portátil → jugadores ven aviso amarillo |
| 9 | Datos móviles | Conectar desde el móvil con datos (sin WiFi) usando URL de Render |

---

## 🔧 Añadir avatares nuevos

1. Prepara 2 imágenes PNG con fondo transparente:
   - `nuevo_tablero.png` — cuerpo entero (para el tablero 3D)
   - `nuevo_seleccion.png` — cabeza/hombros (para la galería)
2. Cópialas a `public/avatars/`
3. Añade una entrada al JSON:
   ```json
   // public/avatars/avatars.json
   {
     "id": "nuevo",
     "nombre": "Nombre",
     "tablero": "/avatars/nuevo_tablero.png",
     "seleccion": "/avatars/nuevo_seleccion.png"
   }
   ```
4. ✅ Listo. Sin tocar ningún archivo de código.

---

## 📐 Decisiones técnicas

| Decisión | Valor | Justificación |
|----------|-------|---------------|
| Three.js | r167 via importmap CDN | ES modules nativos, sin bundler |
| Socket.io | 4.7.5 | ESM client servido por el propio servidor |
| Tick rate | 20 Hz (50 ms) | Preparado para minijuegos (Fase 4) |
| Despliegue | Render | HTTPS automático, capa gratuita, integración GitHub |
| Límite contraseña | 5 por socket (no por IP) | Varios jugadores en el mismo WiFi |
| Código de sala | 4 chars, sin 0/O/1/I/L | Sin ambigüedad visual |
