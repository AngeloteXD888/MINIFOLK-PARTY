# PROTOCOL.md — Protocolo de eventos Socket.io de Badajoz Party

> **Fase:** 1 — Acceso, salas y lobby  
> **Versión Socket.io:** 4.7.5  
> **Convención:** `dominio:acción` (snake_case)  
> **Autenticación:** La contraseña maestra se envía en el handshake (`socket.handshake.auth.password`). Todos los eventos listados aquí son de sockets ya autenticados.

---

## Resumen de flujo

```
Cliente                         Servidor
  │                                │
  │── connect({ auth:{password} })─►│  Middleware valida contraseña
  │◄── connect ────────────────────│  (o connect_error si falla)
  │                                │
  │── create_room ─────────────────►│
  │◄── room:created ────────────────│
  │◄── room:state ──────────────────│  (broadcast a todos)
  │                                │
  │── join_room ────────────────────►│
  │◄── room:joined / room:rejoined ─│
  │◄── room:state ──────────────────│
  │                                │
  │── player:set_name ─────────────►│
  │── player:select_avatar ─────────►│
  │── player:ready ─────────────────►│
  │◄── room:state ──────────────────│  (en respuesta a cada acción)
  │                                │
  │── game:start ───────────────────►│  (solo anfitrión)
  │◄── game:started ────────────────│  (broadcast)
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

| Campo      | Tipo   | Descripción |
|------------|--------|-------------|
| `estado`   | string | `'TABLERO'` |
| `jugadores`| array  | Lista de jugadores (playerId, nombre, avatarId, color, nombreColor) |

---

### `error`
Error genérico enviado solo al emisor.

| Campo    | Tipo   | Descripción |
|----------|--------|-------------|
| `mensaje`| string | Descripción del error en español |

---

## Tabla de asignación de colores

| Orden de entrada | Color    | Hex       |
|-----------------|----------|-----------|
| 1.º             | Rojo     | `#E63946` |
| 2.º             | Azul     | `#457BB5` |
| 3.º             | Verde    | `#2DC653` |
| 4.º             | Amarillo | `#F4D03F` |

---

## Caracteres de código de sala

Conjunto: `BCDEFGHJKMNPQRSTUVWXYZ23456789`  
Excluidos: `0, O, 1, I, L` (ambiguos visualmente).

---

*Este archivo se actualiza en cada fase del proyecto.*
