# PROTOCOL.md — Protocolo de eventos Socket.io de Badajoz Party

> **Fases cubiertas:** 1 (Lobby y salas) + 2 (Tablero 3D, dado, turnos)  
> **Versión Socket.io:** 4.7.5  
> **Convención:** `dominio:acción` (snake_case)  
> **Autenticación:** La contraseña maestra se envía en el handshake (`socket.handshake.auth.password`). Todos los eventos listados aquí son de sockets ya autenticados.

---

## Máquina de estados del servidor

```
LOBBY → TABLERO → MINIJUEGO → RESULTADOS_RONDA → FIN
         (Fase 2)   (Fase 4+)      (Fase 4+)
```

---

## Flujo Fase 1 (Lobby y Sala)

```
Cliente                         Servidor
  │── connect({ auth:{password} })─►│  Middleware valida contraseña
  │◄── connect / connect_error ─────│
  │── create_room ─────────────────►│
  │◄── room:created + room:state ───│
  │── join_room ────────────────────►│
  │◄── room:joined / room:rejoined ─│
  │── player:set_name ─────────────►│
  │── player:select_avatar ─────────►│
  │── player:ready ─────────────────►│
  │◄── room:state ──────────────────│
  │── game:start ───────────────────►│
  │◄── game:started ────────────────│
```

---

## Flujo Fase 2 (Tablero y Turnos)

```
Cliente                         Servidor
  │◄── game:started ────────────────│  estado='TABLERO'
  │◄── board:init ─────────────────│  grafo de 22 casillas + jugadores
  │◄── turn:start ─────────────────│  quién tira + tiempoLimiteMs=30000
  │── dice:roll ────────────────────►│  (solo jugador activo)
  │◄── dice:rolled ─────────────────│  (broadcast: valor 1-6)
  │◄── player:step ─────────────────│  (broadcast por cada casilla)
  │◄── player:step ─────────────────│  (pausa 550ms entre cada evento)
  │◄── player:landed ───────────────│  (última casilla + efectoCasilla)
  │   [si bifurcación]              │
  │◄── branch:choice_request ───────│  (opciones de camino)
  │── branch:choice_submit ─────────►│  (jugador elige)
  │◄── player:step … ───────────────│  (movimiento continúa)
  │◄── turn:start ─────────────────│  (siguiente jugador)
  │◄── round:ended ─────────────────│  (fin de ronda)
  │◄── game:ended ─────────────────│  (tras MAX_RONDAS rondas)
```

---

## Eventos de conexión (handshake Socket.io)

### `connect` (sistema)
| Campo       | Valor |
|-------------|-------|
| **Dirección** | Servidor → Cliente |
| **Cuándo**  | Socket autenticado correctamente |
| **Payload** | *(ninguno, evento nativo de Socket.io)* |

### `connect_error` (sistema)
| Campo       | Valor |
|-------------|-------|
| **Dirección** | Servidor → Cliente |
| **Cuándo**  | Middleware rechaza la conexión |
| **Payload** | `Error` cuyo `message` es uno de: |

```
CONTRASENA_INCORRECTA:<intentos_restantes>    // contraseña wronge
DEMASIADOS_INTENTOS                            // superado el límite (5)
```

---

## Eventos emitidos por el CLIENTE

### `create_room`
Crea una nueva sala. El cliente elige si quiere ser Pantalla o Jugador (anfitrión).

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `rol`      | string | `'pantalla'` o `'jugador'` |

**Ejemplo:**
```json
{ "rol": "jugador" }
```

---

### `join_room`
Unirse a una sala existente, o reconectarse a ella con playerId previo.

| Campo       | Tipo   | Requerido | Descripción |
|-------------|--------|-----------|-------------|
| `roomCode`  | string | ✅        | Código de sala (4 caracteres, mayúsculas) |
| `rol`       | string | ✅        | `'pantalla'` o `'jugador'` |
| `playerId`  | string | ❌        | Si se incluye, el servidor intenta reconexión |

**Ejemplo (unión nueva):**
```json
{ "roomCode": "BCDF", "rol": "jugador" }
```

**Ejemplo (reconexión):**
```json
{ "roomCode": "BCDF", "rol": "jugador", "playerId": "p_a8b3k9z1" }
```

---

### `screen:reconnect`
Reconecta el dispositivo Pantalla tras una desconexión.

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `roomCode` | string | Código de la sala |

---

### `player:set_name`
Establece o actualiza el nombre del jugador.

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `roomCode` | string | Código de sala |
| `playerId` | string | ID del jugador |
| `nombre`   | string | Nombre (máx. 12 caracteres) |

---

### `player:select_avatar`
Selecciona un avatar de la galería.

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `roomCode` | string | Código de sala |
| `playerId` | string | ID del jugador |
| `avatarId` | string | ID del avatar (de avatars.json) |

---

### `player:ready`
Marca o desmarca al jugador como "listo".

| Campo      | Tipo    | Descripción |
|------------|---------|-------------|
| `roomCode` | string  | Código de sala |
| `playerId` | string  | ID del jugador |
| `listo`    | boolean | `true` = listo, `false` = no listo |

---

### `game:start`
Solicita iniciar la partida. Solo el anfitrión puede hacerlo con efecto.

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `roomCode` | string | Código de sala |
| `playerId` | string | ID del anfitrión |

---

## Eventos emitidos por el SERVIDOR

### `room:created`
Respuesta directa a `create_room`. Solo al emisor.

| Campo        | Tipo        | Descripción |
|--------------|-------------|-------------|
| `roomCode`   | string      | Código de la sala creada |
| `role`       | string      | `'pantalla'` o `'jugador'` |
| `playerId`   | string\|null| null si es Pantalla |
| `color`      | string\|null| Color hex del jugador |
| `nombreColor`| string\|null| Nombre del color en español |
| `esAnfitrion`| boolean     | true si es el primer jugador |

---

### `room:joined`
Respuesta directa a `join_room` (unión nueva). Solo al emisor.

| Campo        | Tipo        | Descripción |
|--------------|-------------|-------------|
| `roomCode`   | string      | Código de sala |
| `role`       | string      | `'pantalla'` o `'jugador'` |
| `playerId`   | string\|null| null si es Pantalla |
| `color`      | string\|null| Color hex asignado |
| `nombreColor`| string\|null| Nombre del color |
| `esAnfitrion`| boolean     | ¿Es anfitrión? |

---

### `room:rejoined`
Respuesta a `join_room` cuando se detecta reconexión por playerId.

| Campo        | Tipo   | Descripción |
|--------------|--------|-------------|
| `roomCode`   | string | Código de sala |
| `playerId`   | string | ID del jugador reconectado |
| `role`       | string | `'jugador'` |
| `nombre`     | string\|null | Nombre previo |
| `avatarId`   | string\|null | Avatar previo |
| `color`      | string | Color hex |
| `nombreColor`| string | Nombre del color |
| `listo`      | boolean| Estado de listo previo |
| `esAnfitrion`| boolean| ¿Es anfitrión? |

---

### `screen:reconnected`
Respuesta a `screen:reconnect`. Solo al emisor (Pantalla).

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `roomCode` | string | Código de sala |

---

### `room:state`
**Evento principal de sincronización.** Se emite a todos los sockets de la sala tras cada cambio de estado.

| Campo          | Tipo    | Descripción |
|----------------|---------|-------------|
| `codigo`       | string  | Código de sala |
| `estado`       | string  | Estado de la máquina: `LOBBY`, `TABLERO`, `MINIJUEGO`, `RESULTADOS_RONDA`, `FIN` |
| `tienePantalla`| boolean | ¿Hay un dispositivo Pantalla conectado? |
| `puedeEmpezar` | boolean | ¿Hay ≥2 jugadores listos? |
| `jugadores`    | array   | Lista de jugadores (ver abajo) |

**Objeto jugador en `room:state`:**
```typescript
{
  playerId:    string,
  nombre:      string | null,
  avatarId:    string | null,
  color:       string,           // hex, ej. "#E63946"
  nombreColor: string,           // ej. "Rojo"
  listo:       boolean,
  esAnfitrion: boolean,
  conectado:   boolean,
}
```

---

### `room:screen_disconnected`
Broadcast a toda la sala cuando la Pantalla se desconecta.

| Payload | *(ninguno)* |
|---------|------------|

---

### `room:screen_reconnected`
Broadcast cuando la Pantalla vuelve a conectarse.

| Payload | *(ninguno)* |
|---------|------------|

---

### `room:player_disconnected`
Broadcast cuando un jugador se desconecta (puede reconectarse).

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `playerId` | string | ID del jugador desconectado |
| `nombre`   | string\|null | Nombre del jugador |

---

### `room:player_reconnected`
Broadcast cuando un jugador se reconecta.

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `playerId` | string | ID del jugador |
| `nombre`   | string\|null | Nombre del jugador |

---

### `avatar:error`
Enviado solo al emisor cuando el avatar seleccionado ya está ocupado.

| Campo    | Tipo   | Descripción |
|----------|--------|-------------|
| `mensaje`| string | Mensaje de error en español |

---

### `game:started`
Broadcast a toda la sala cuando la partida comienza.

| Campo | Tipo | Descripción |
|---|---|---|
| `estado` | string | `'TABLERO'` |
| `jugadores` | array | Lista de jugadores (playerId, nombre, avatarId, color, nombreColor) |
| `tablero` | object | Estado inicial del tablero |

---

### `board:init` *(Fase 2)*
Broadcast inmediatamente después de `game:started`. La Pantalla lo usa para inicializar la escena 3D.

| Campo | Tipo | Descripción |
|---|---|---|
| `roomCode` | string | Código de sala |
| `rondaActual` | number | Empieza en 1 |
| `maxRondas` | number | 10 por defecto |
| `ordenTurnos` | string[] | playerIds en orden de turno (mezclado aleatoriamente) |
| `turnoIndex` | number | Índice del jugador activo en ordenTurnos |
| `playerIdActivo` | string | PlayerId del jugador que tira primero |
| `grafoCasillas` | array | Grafo completo de 22 casillas |
| `jugadores` | array | Estado inicial de cada jugador en el tablero |

**Objeto casilla en `grafoCasillas`:**
```typescript
{
  id: number,        // 0-21
  x: number,         // Posición X en Three.js
  z: number,         // Posición Z en Three.js
  tipo: 'inicio' | 'azul' | 'roja' | 'evento' | 'minijuego' | 'bifurcacion',
  nombre: string,    // Ej. "Plaza Alta (Salida)"
  siguientes: number[],   // IDs de casillas siguientes (>1 = bifurcación)
  bifurcacionNombres?: Record<number, string>
}
```

**Objeto jugador en tablero:**
```typescript
{
  playerId: string, nombre: string, avatarId: string,
  color: string, nombreColor: string,
  casillaActualId: number, monedas: number, soles: number,
  pasosRestantes: number,
  estadoTurno: 'TURNO_DADO' | 'MOVIENDO' | 'ELIGE_BIFURCACION' | 'ESPERANDO',
  esMiTurno: boolean
}
```

---

### `turn:start` *(Fase 2)*
Broadcast al inicio de cada turno. Indica qué jugador debe tirar y cuánto tiempo tiene.

| Campo | Tipo | Descripción |
|---|---|---|
| `playerId` | string | ID del jugador activo |
| `nombre` | string | Nombre del jugador activo |
| `tiempoLimiteMs` | number | 30 000 ms máximo para tirar |
| `tablero` | object | Snapshot completo del tablero |

> **Anti-bloqueo:** Si el jugador no emite `dice:roll` antes de que expire, el servidor tira automáticamente (`esAutoTirada: true`).

---

### `dice:rolled` *(Fase 2)*
Broadcast cuando el dado se ha tirado (manual o automáticamente).

| Campo | Tipo | Descripción |
|---|---|---|
| `playerId` | string | ID del jugador que tiró |
| `valor` | number | Resultado del dado (1-6) |
| `esAutoTirada` | boolean | true si fue tirada automática por timeout |
| `tiempoAnimacionMs` | number | 2 200 ms — duración sugerida de la animación 3D |

---

### `player:step` *(Fase 2)*
Broadcast por cada casilla que el peón atraviesa. Se emite una vez por casilla con una pausa de 550 ms entre cada uno para sincronizar la animación de salto.

| Campo | Tipo | Descripción |
|---|---|---|
| `playerId` | string | ID del jugador que se mueve |
| `casillaActual` | object | Casilla en la que acaba de entrar `{id, x, z, tipo, nombre}` |
| `pasosRestantes` | number | Pasos que le quedan por recorrer |

---

### `player:landed` *(Fase 2)*
Broadcast cuando el peón llega a la casilla de destino final. Incluye el efecto aplicado.

| Campo | Tipo | Descripción |
|---|---|---|
| `playerId` | string | ID del jugador |
| `casillaActual` | object | Casilla de aterrizaje |
| `efectoCasilla` | object | Efecto aplicado (ver abajo) |
| `tablero` | object | Snapshot con monedas/soles actualizados |

**Objeto `efectoCasilla`:**
```typescript
{
  tipoCasilla: string,     // 'azul' | 'roja' | 'evento' | 'minijuego' | ...
  nombreCasilla: string,
  titulo: string,          // Ej. "¡Casilla Azul!"
  descripcion: string,     // Ej. "+3 monedas para tu saca."
  deltaMonedas: number,    // Positivo = ganancia, negativo = pérdida
  monedasActuales: number, // Saldo actualizado del jugador
  solesActuales: number,
  casillaId: number
}
```

---

### `branch:choice_request` *(Fase 2)*
Broadcast cuando el peón llega a una bifurcación y el jugador debe elegir camino.

| Campo | Tipo | Descripción |
|---|---|---|
| `playerId` | string | ID del jugador que debe elegir |
| `casillaId` | number | ID de la casilla de bifurcación |
| `opciones` | array | `[{ casillaId, nombre, tipo, descripcion }]` |

> Si el jugador no responde en 15 s, el servidor elige la primera opción automáticamente.

---

### `round:ended` *(Fase 2)*
Broadcast al completar una ronda completa (todos los jugadores han tirado).

| Campo | Tipo | Descripción |
|---|---|---|
| `rondaCompletada` | number | Ronda que acaba de terminar |
| `siguienteRonda` | number | Próxima ronda |
| `tablero` | object | Snapshot con puntuaciones actualizadas |

> En Fase 4 irá seguido de un minijuego antes del siguiente `turn:start`. En Fase 2, `turn:start` sigue directamente tras 2 500 ms.

---

### `game:ended` *(Fase 2)*
Broadcast al terminar todas las rondas. Contiene la clasificación final.

| Campo | Tipo | Descripción |
|---|---|---|
| `clasificacion` | array | Jugadores ordenados: Soles desc, Monedas desc |
| `tablero` | object | Estado final del tablero |

**Objeto jugador en `clasificacion`:**
```typescript
{ playerId, nombre, avatarId, color, monedas, soles }
```

---

### `error`
Error genérico enviado solo al emisor.

| Campo | Tipo | Descripción |
|---|---|---|
| `mensaje` | string | Descripción del error en español |

---

## Tabla de efectos de casillas

| Tipo | Efecto | Descripción |
|---|---|---|
| `inicio` | +3 monedas | Casilla de salida / vuelta completa |
| `azul` | +3 monedas | Casilla estándar positiva |
| `roja` | -3 monedas | Casilla estándar negativa |
| `evento` | Variable | Evento pacense al azar |
| `minijuego` | +5 monedas | Bonus hasta Fase 4 |
| `bifurcacion` | — | El jugador elige qué camino tomar |

---

## Tabla de asignación de colores

| Orden de entrada | Color | Hex |
|---|---|---|
| 1.º | Rojo | `#E63946` |
| 2.º | Azul | `#457BB5` |
| 3.º | Verde | `#2DC653` |
| 4.º | Amarillo | `#F4D03F` |

---

## Parámetros de tiempo

| Constante | Valor | Descripción |
|---|---|---|
| TIMEOUT_TURNO_MS | 30 000 ms | Tiempo máximo para tirar antes de auto-tirada |
| TIEMPO_ANIMACION_DADO_MS | 2 200 ms | Duración animación 3D del dado |
| MAX_RONDAS | 10 | Rondas por partida |
| Pausa entre pasos | 550 ms | Entre eventos `player:step` |
| Pausa efecto casilla | 2 800 ms | Banner de efecto antes de pasar turno |
| Pausa entre rondas | 2 500 ms | Banner de ronda terminada |

---

## Caracteres de código de sala

Conjunto: `BCDEFGHJKMNPQRSTUVWXYZ23456789`  
Excluidos: `0, O, 1, I, L` (ambiguos visualmente).

---

---

## Flujo Fase 4 (Minijuegos en Tiempo Real)

```
Cliente                         Servidor
  │◄── round:ended ─────────────────│  (fin de ronda en tablero)
  │◄── minigame:intro ──────────────│  (reglas, controles, cuenta atrás 4s)
  │◄── minigame:start ──────────────│  (arranca bucle a 20 Hz)
  │                                 │
  │── minigame:input ──────────────►│  (inputs móviles a 20 Hz)
  │◄── minigame:state ──────────────│  (snapshot autoritativo cada 50ms / 20 Hz)
  │                                 │
  │◄── minigame:results ────────────│  (podio de minijuego + monedas ganadas)
  │◄── board:update ────────────────│  (vuelve al tablero con saldos actualizados)
  │◄── turn:start ──────────────────│  (siguiente ronda)
```

### Eventos de Minijuegos

#### `minigame:intro` (Servidor → Cliente)
| Campo | Tipo | Descripción |
|---|---|---|
| `minijuego` | object | `{ id, nombre, subtitulo, descripcion, controlesTexto, tipoControl, duracionSegundos }` |
| `jugadores` | Array | Lista de participantes en el minijuego |
| `cuentaAtrasMs` | number | Duración de la cuenta atrás (4 000 ms) |

#### `minigame:start` (Servidor → Cliente)
| Campo | Tipo | Descripción |
|---|---|---|
| `minijuegoId` | string | ID del minijuego activo |
| `duracionTotalMs` | number | Duración total de la partida |

#### `minigame:input` (Cliente Jugador → Servidor)
| Campo | Tipo | Descripción |
|---|---|---|
| `roomCode` | string | Código de sala |
| `playerId` | string | ID del jugador |
| `action` | string | Acción (`remo_izq`, `remo_der`, `mover`, `tap_izq`, `tap_der`) |
| `payload` | object | Datos opcionales (`{ dir: -1|0|1, turbo: bool }`) |

#### `minigame:state` (Servidor → Cliente, 20 Hz / cada 50 ms)
| Campo | Tipo | Descripción |
|---|---|---|
| `minijuegoId` | string | ID del minijuego |
| `tiempoRestanteMs` | number | Tiempo restante de partida |
| `jugadores` | Array | Posiciones interpolables (`posicionX`, `posicionY`, `velocidad`, `puntos`) |
| `objetos` | Array | Objetos dinámicos en juego (bellotas, piedras) |

#### `minigame:results` (Servidor → Cliente)
| Campo | Tipo | Descripción |
|---|---|---|
| `minijuegoId` | string | ID del minijuego |
| `clasificacion` | Array | Ranking de jugadores con `monedasGanadas` (1.º: 10🪙, 2.º: 6🪙, 3.º: 3🪙, 4.º: 1🪙) |

---

*Fase 1 completada: Lobby, salas, autenticación, reconexión, galería de avatares.*  
*Fase 2 completada: Tablero 3D, dado autoritativo, movimiento paso a paso, bifurcaciones, turnos, rondas, fin de partida.*  
*Fase 3 completada: Soles de Badajoz, peones con nombres 3D flotantes, celebraciones y podio.*  
*Fase 4 completada: Minijuegos en tiempo real con bucle de estado a 20 Hz (Regata en el Guadiana y Lluvia de Bellotas en la Dehesa).*
