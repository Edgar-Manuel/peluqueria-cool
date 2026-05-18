# Auditoría técnica — Peluquería Cool

Branch: `claude/booking-system-architecture-PERyR` · Fecha: 2026-05-18.
Encargo: Notis pide auditoría completa con formato fijo. Sin
protecciones: si hay decisiones flojas, se dicen claras.

---

## 1. Resumen ejecutivo

El proyecto **no está en cero ni mucho menos**: ya hay base de datos
montada con 9 tablas, triggers de historial de cliente, 2 Edge
Functions con smart scheduling real (buffer, lunch break, combos,
festivos) y un panel admin completo con calendario, agenda y métricas.

Pero arrastra cuatro problemas serios de cara a producción:

1. **Dos caminos paralelos crean reservas con lógica distinta**. El
   form web inserta directo en Supabase desde el navegador (anon key
   + RLS), bypasseando la Edge Function `create-appointment` que es
   la única que valida solapamientos con buffer, detecta combos y
   vincula cliente. Resultado: por la web pueden crearse reservas
   que se pisan entre sí.
2. **El webhook saliente solo se dispara desde el navegador**. Si la
   reserva entra por la Edge Function (que es lo que usará Notis),
   no hay evento. Y aunque se dispare, no hay reintentos ni log —
   un fallo de red lo pierde silencioso.
3. **El horario semanal está hardcodeado en TypeScript** dentro de
   `check-availability/index.ts`, ignorando que existe la tabla
   `salon_config.schedule`. Cambiar horarios = redeploy.
4. **Las migraciones están en 4 SQL sueltos** que hay que aplicar en
   orden manualmente. Frágil para un negocio que va a tocar esto
   poco.

Resto: faltan tablas para `leads`, `message_log` y cola de
eventos persistente; faltan endpoints para `confirm/cancel/complete`
de una cita disparando eventos; falta canal WhatsApp real (hoy es
solo `wa.me`); faltan cron jobs (`pg_cron`) para recordatorios 24h,
clientas inactivas y huecos liberados.

La arquitectura propuesta de "5 endpoints" no encaja: tres ya están
cubiertos por lo existente. Lo que hace falta es **arreglar el camino
único de creación + sistema de eventos + 1 endpoint nuevo
`update-appointment`**, no construir todo de cero.

---

## 2. Cómo está montado ahora

### Stack real

- **Frontend**: HTML/CSS/JS vanilla. No hay Next, ni React, ni build.
  - `index.html` + `script.js` + `styles.css` → landing scrollytelling.
  - `admin.html` + `admin.js` (~75 KB) + `admin.css` → panel admin SPA.
  - `js/` → módulos auxiliares (`supabase-client.js`, `auth.js`,
    `reservations.js`, `smart-scheduler.js`, `config.prod.js`).
- **Base de datos / Auth**: Supabase (PostgreSQL + Auth + RLS).
- **Backend serverless**: 2 Edge Functions Deno/TypeScript en
  `supabase/functions/`.

### Archivos y responsabilidad

| Path | Responsabilidad |
|---|---|
| `index.html`, `script.js`, `styles.css` | Landing + form de reserva pública |
| `admin.html`, `admin.js`, `admin.css` | Panel admin SPA (dashboard, reservas, agenda, calendario, clientes, productos, ajustes) |
| `js/supabase-client.js` | Bootstrap del cliente Supabase en el navegador |
| `js/config.prod.js` | URL Supabase + anon key (público) |
| `js/auth.js` | Login admin, lockout en cliente |
| `js/reservations.js` | CRUD de reservas **desde el navegador** (insert directo) + dispara webhook |
| `js/smart-scheduler.js` | Lógica de scheduling duplicada parcialmente del backend |
| `schedule-config.js` | **3ª fuente de horario** (la 1ª está en la edge fn, la 2ª en `salon_config`) |
| `supabase/functions/check-availability/index.ts` | Calcula slots libres (horario hardcodeado) |
| `supabase/functions/create-appointment/index.ts` | Crea cita con buffer/combos/cliente |
| `supabase-setup.sql` (v1) | `admins`, `reservations` base, `products`, `orders` |
| `supabase-update-v2.sql` (v2) | Parches sueltos sobre v1 |
| `supabase-setup-v3.sql` (v3) | Más parches |
| `supabase-patch-v4.sql` (v4) | Tablas restantes: `clientes`, `servicios`, `servicios_combinados`, `dias_cerrados`, `salon_config`, triggers, funciones, vista |

### Lógica visual vs lógica de negocio

| Visual puro | Lógica de negocio |
|---|---|
| Scrollytelling Canvas (`script.js`) | Form reserva → INSERT directo (`js/reservations.js`) |
| Galerías, lookbook, hero sequence | Auth admin + tabla `admins` |
| CSS / SEO / metas | Smart scheduling en Edge Functions |
| Mini-calendario visual del dashboard | Triggers Postgres: hora_fin, historial cliente, cancelación tardía |
| | Webhook saliente `new_booking` |

### Endpoints reales

Solo 2, los que pide Notis no inventar:

1. `POST /functions/v1/check-availability` — devuelve `slots_recomendados`
   y `slots_todos` respetando horario semanal + lunch break + festivos
   (`dias_cerrados`) + buffer 10min + duración del servicio o combo.
2. `POST /functions/v1/create-appointment` — crea cita con detección
   de combo, anti-solape con buffer, link a `clientes`, genera mensaje
   de confirmación. Acepta `fuente: web|whatsapp|telefono|manual`.

### Eventos salientes

UNO solo: el form web hace `POST {salon_config.webhook_url}` con
`{action:"new_booking", data: reservation}`. Pensado para Make/n8n.

---

## 3. Problemas detectados (los duros primero)

### 🔴 Críticos (bloquean producción seria)

1. **Doble camino de creación de reservas**.
   - Web: `js/reservations.js` → `supabase.from('reservations').insert(...)`.
   - WhatsApp/Notis: Edge Function `create-appointment`.
   - La inserción directa **no valida buffer entre citas**, no detecta
     combos, no vincula `cliente_id`. Solo hace un `checkAvailability`
     que mira coincidencia exacta `date+time`, ignorando duraciones.
     Una reserva de mechas a las 10:00 (2h) no impide otra a las 10:30.
   - **Fix**: el form web también debe llamar a `create-appointment`.

2. **Webhook saliente vive en el cliente JS**.
   - Cualquier reserva que entre por la Edge Function (es decir, todas
     las que vengan vía Notis/WhatsApp) **no emite evento**.
   - Y el `fetch()` del navegador no tiene reintentos: si Make está
     caído ese segundo, el evento se pierde.
   - **Fix**: mover el disparo a un trigger Postgres + cola persistente
     `event_log` + worker (`pg_cron`).

3. **No hay sistema de eventos**. Solo el `new_booking`. Faltan
   `booking.confirmed`, `booking.cancelled`, `booking.completed`,
   `booking.reminder_24h`, `customer.inactive`, `slot.available`.
   Sin esto Notis no puede "operar como cerebro".

4. **Sin idempotencia en `create-appointment`**. Si Notis reintenta
   por timeout, se crean dos citas. Falta `Idempotency-Key` o
   deduplicación por `(telefono, date, time)` en ventana corta.

### 🟠 Importantes (frenan crecimiento)

5. **Horario semanal hardcodeado** en `check-availability/index.ts`
   (L 16–20, M–J 10–13/16–20, etc.). La tabla `salon_config.schedule`
   está vacía y la función la ignora. Tres fuentes de verdad:
   función TS + `salon_config` + `schedule-config.js` en el frontend.

6. **4 archivos SQL sueltos** (v1 → v4) aplicados a mano. Sin sistema
   de migraciones, no hay forma de saber qué versión está corriendo
   en prod. Falta consolidar en `supabase/migrations/`.

7. **Sin tabla `leads`**. Hoy el form pide fecha/hora obligatoria.
   Una interesada que solo quiere info → no hay sitio donde guardarla.
   Cuando Notis quiera clasificar leads, no tiene dónde escribir.

8. **Sin `message_log`**. Para que Notis envíe recordatorios y
   reactivaciones por WhatsApp, hace falta historial de qué se envió,
   cuándo, si entregado/leído, qué respondió la clienta. Hoy no existe.

9. **Sin canal WhatsApp real**. Solo `wa.me?text=...`. Twilio /
   WhatsApp Cloud API no implementados. Toda automatización saliente
   depende de esto. Aviso: WhatsApp Business API requiere número
   verificado por Meta + plantillas aprobadas (~1-2 semanas).

10. **Sin cron jobs**. Recordatorio 24h, marcar clientas inactivas y
    detectar huecos liberados requieren `pg_cron` o un scheduler
    externo. No hay nada.

### 🟡 Menores (deuda técnica)

11. **Validación pobre**: teléfono y email sin formato server-side.
    Reservas con teléfonos basura pasan.

12. **Sin logs persistentes**. Errores del webhook solo van a
    `console.error`. Cuando falla algo, no queda traza.

13. **Solapamiento conceptual** entre `servicios` (catálogo del salón)
    y `products` (catálogo e-commerce). Pueden coexistir, pero la
    distinción no está clara en el admin.

14. **`js/smart-scheduler.js` (22 KB)** duplica parcialmente la
    lógica del backend en el cliente. Si una cambia y la otra no,
    los slots calculados en navegador difieren de los reales.

15. **El SQL define `service_name` opcional** y el código a veces lo
    rellena con el nombre, a veces con el id (`servicio` text). Falta
    consistencia: usar siempre `servicio_id` (FK) + `servicios_ids`
    (array para combos).

---

## 4. Arquitectura recomendada

Simple, encima de lo existente. **No** Next.js, **no** microservicios.

```
┌─────────────────────────────────────────────────────────────┐
│                  CLIENTES / CANALES                          │
│  Landing (index.html)   WhatsApp (Notis)   Panel admin       │
└──────────────┬─────────────────┬───────────────┬─────────────┘
               │                 │               │
               ▼                 ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│              SUPABASE EDGE FUNCTIONS (única vía)             │
│                                                              │
│   POST /check-availability   ← lee salon_config.schedule    │
│   POST /create-appointment    (existente)                    │
│   POST /update-appointment    (NUEVO: confirm/cancel/...)    │
│   POST /capture-lead          (NUEVO: lead sin fecha)        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│            POSTGRES (Supabase) — RLS estricto                │
│                                                              │
│  reservations · clientes · servicios · servicios_combinados │
│  dias_cerrados · salon_config · products · admins           │
│  leads (NUEVA) · message_log (NUEVA) · event_log (NUEVA)    │
│                                                              │
│  Triggers: cualquier cambio relevante → INSERT en event_log  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│      WORKERS (pg_cron + Edge Functions programadas)          │
│                                                              │
│  · cada 1 min: dispatch event_log → Notis webhook (reintentos)│
│  · cada 1 h:  detecta citas a 24h → emite reminder_24h       │
│  · diario:    marca clientas inactivas (>90d)                │
│  · on cancel: emite slot.available con el hueco              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                      NOTIS (externo)
              recibe eventos, decide, envía WhatsApp,
              llama de vuelta a Edge Functions
```

### Puntos clave

- **Una sola vía de entrada** a las reservas: las Edge Functions.
  El form web pasa a hacer `fetch()` a `create-appointment` en lugar
  de `INSERT` directo.
- **Eventos persistentes** en `event_log`: el navegador no envía
  nada, lo hace un worker. Cero pérdida por red caída.
- **`salon_config` como verdad** del horario. La función la lee al
  arrancar (con cache corto). Cambiar horario = `UPDATE` en SQL, no
  redeploy.
- **Notis solo recibe eventos y llama a las Edge Functions**. No
  toca la DB directamente.

### Puntos donde Notis interviene

| Evento que recibe | Qué hace Notis |
|---|---|
| `lead.captured` | Clasifica interés, contesta WhatsApp |
| `booking.created` (pending) | Confirma datos, propone alternativas si chocan |
| `booking.confirmed` | Programa recordatorio 24h |
| `booking.reminder_24h` | Envía WhatsApp recordatorio |
| `booking.cancelled` | Liberar hueco, buscar reactivables, ofrecer |
| `customer.inactive` | Mensaje reactivación personalizado |
| `slot.available` | Avisa a clientas que pidieron ese tipo de hueco |

---

## 5. Modelo de datos recomendado

Mantener lo existente. Añadir 3 tablas y 1 columna nueva.

### Nuevas tablas

```sql
-- =========================================
-- LEADS: interesadas que aún no tienen cita
-- =========================================
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT,
    telefono TEXT,
    email TEXT,
    servicio_interes TEXT,        -- texto libre o servicio_id si se conoce
    mensaje TEXT,
    canal_origen TEXT             -- web | whatsapp | instagram | telefono
        CHECK (canal_origen IN ('web','whatsapp','instagram','telefono','otro')),
    estado TEXT DEFAULT 'nuevo'   -- nuevo | contactado | convertido | descartado
        CHECK (estado IN ('nuevo','contactado','convertido','descartado')),
    cliente_id UUID REFERENCES clientes(id),
    reservation_id UUID REFERENCES reservations(id),
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_estado ON leads(estado);
CREATE INDEX idx_leads_telefono ON leads(telefono);

-- =========================================
-- MESSAGE_LOG: historial de mensajes (Notis ↔ clienta)
-- =========================================
CREATE TABLE message_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id),
    telefono TEXT NOT NULL,
    direccion TEXT NOT NULL CHECK (direccion IN ('in','out')),
    canal TEXT NOT NULL CHECK (canal IN ('whatsapp','sms','email')),
    cuerpo TEXT NOT NULL,
    external_id TEXT,             -- ID Twilio/Meta para deduplicar
    estado TEXT,                  -- sent | delivered | read | failed
    error_text TEXT,
    reservation_id UUID REFERENCES reservations(id),
    lead_id UUID REFERENCES leads(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_log_cliente ON message_log(cliente_id);
CREATE INDEX idx_message_log_telefono_created ON message_log(telefono, created_at DESC);

-- =========================================
-- EVENT_LOG: cola persistente de eventos para Notis
-- =========================================
CREATE TABLE event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,     -- booking.created, booking.confirmed,
                                  -- booking.cancelled, booking.completed,
                                  -- booking.reminder_24h,
                                  -- customer.inactive, slot.available,
                                  -- lead.captured
    payload JSONB NOT NULL,
    reservation_id UUID REFERENCES reservations(id),
    cliente_id UUID REFERENCES clientes(id),
    lead_id UUID REFERENCES leads(id),
    delivered BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_event_log_pending ON event_log(next_retry_at)
    WHERE delivered = false;
CREATE INDEX idx_event_log_type_created ON event_log(event_type, created_at DESC);
```

### Cambios mínimos a tablas existentes

```sql
-- Para detectar slot.available útiles
ALTER TABLE clientes
    ADD COLUMN IF NOT EXISTS servicios_preferidos TEXT[],
    ADD COLUMN IF NOT EXISTS quiere_aviso_huecos BOOLEAN DEFAULT false;

-- Para que las Edge Functions sepan si ya hay recordatorio enviado
-- (ya existe recordatorio_enviado, OK)

-- Idempotencia
ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
```

### Lo que NO hay que crear

- `customers` → ya existe `clientes`.
- `booking_requests` separada → `reservations.status='pending'` ya es eso.
- `appointments` separada → es la misma `reservations`.
- `services` → ya existe `servicios`.

---

## 6. Plan por fases

### Fase 1 — Reserva sólida (3-4 días)

Objetivo: cerrar el agujero de doble vía y dejar la web disparando la
Edge Function.

- [ ] Consolidar 4 SQL files en `supabase/migrations/` con nombres
      ordenados (`20260518_001_init.sql`, etc.).
- [ ] Crear tabla `admins` con migración limpia y documentación de
      cómo invitar el primer admin.
- [ ] Refactor `js/reservations.js`: la creación pasa por
      `fetch('/functions/v1/create-appointment')`, dejar de hacer
      `insert` directo. Mantener `getAll/updateStatus` para admin.
- [ ] Validar teléfono (regex internacional) y email en
      `create-appointment`.
- [ ] Añadir `idempotency_key` y deduplicación en `create-appointment`.

**Entregable**: una sola vía de creación, validada, idempotente.

### Fase 2 — Datos correctos (3-4 días)

Objetivo: que las tablas reflejen lo que el negocio necesita y que
el horario sea editable.

- [ ] Migración: añadir `leads`, `message_log`, `event_log`.
- [ ] Migración: añadir `servicios_preferidos` y `quiere_aviso_huecos`
      a `clientes`.
- [ ] Refactor `check-availability`: leer `salon_config.schedule` con
      cache; mantener fallback al hardcoded si la tabla está vacía.
- [ ] Sección Ajustes del admin: editor de horario que escribe en
      `salon_config.schedule`.
- [ ] Eliminar `js/smart-scheduler.js` (o reducir a wrapper que solo
      llama a la Edge Function): cero lógica de slots duplicada.

**Entregable**: horario editable, fuentes de verdad unificadas,
tablas nuevas listas.

### Fase 3 — Eventos y automatizaciones (4-5 días)

Objetivo: que Notis pueda enchufarse.

- [ ] Trigger Postgres: cada cambio de `reservations.status` →
      `INSERT INTO event_log(event_type, payload, ...)`.
- [ ] Edge Function nueva `update-appointment`: confirm / cancel /
      complete / reject, todo en un sitio, dispara el trigger.
- [ ] Edge Function nueva `capture-lead`: alta en `leads` + evento
      `lead.captured`.
- [ ] Edge Function programada `dispatch-events` cada 1min vía
      pg_cron: lee `event_log` no entregados, hace POST al webhook
      configurado, reintenta con backoff.
- [ ] Cron pg_cron cada 1h: detecta citas a 24h → INSERT en event_log
      con tipo `booking.reminder_24h`.
- [ ] Cron pg_cron diario: marca clientas inactivas (>90d sin visita)
      → eventos `customer.inactive` (con rate-limit por clienta).
- [ ] Trigger al cancelar: emite `slot.available` con el hueco.

**Entregable**: stream de eventos completo + endpoints para Notis.

### Fase 4 — Notis encima (depende de Notis)

Objetivo: cerrar el círculo.

- [ ] Sustituir webhook a Make por endpoint de Notis (URL en
      `salon_config.webhook_url`).
- [ ] Integración WhatsApp real (Twilio o Cloud API). Outbound desde
      Notis. Inbound vía webhook que llama a `check-availability` +
      `create-appointment`.
- [ ] Form ligero "te llamamos" en landing → `capture-lead`.
- [ ] Dashboard admin: leer `event_log` para ver tráfico real de
      automatizaciones.

---

## 7. Primeros cambios concretos a implementar ya

Ordenados por impacto/coste:

### #1 — Cerrar el doble camino de creación (CRÍTICO, ~2h)

`js/reservations.js`, función `create()`:

```js
// REEMPLAZAR todo el bloque insert directo por:
const res = await fetch(`${SUPABASE_URL}/functions/v1/create-appointment`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Idempotency-Key': crypto.randomUUID()
    },
    body: JSON.stringify({
        nombre: reservationData.nombre,
        telefono: reservationData.telefono,
        email: reservationData.email,
        fecha: reservationData.fecha,
        hora: reservationData.hora,
        servicios: [reservationData.servicio],
        fuente: 'web',
        notas: reservationData.notas
    })
});

const result = await res.json();
if (!result.success) throw new Error(result.error);
return result;
```

Y en `create-appointment/index.ts`: añadir lectura del header
`Idempotency-Key` y guardarlo en `reservations.idempotency_key` con
constraint UNIQUE.

### #2 — Consolidar SQL en migraciones (1h)

```
supabase/migrations/
├── 20260101_000_base.sql          (ex setup.sql)
├── 20260101_001_v2_patch.sql      (ex update-v2.sql)
├── 20260101_002_v3_patch.sql      (ex setup-v3.sql)
├── 20260101_003_v4_patch.sql      (ex patch-v4.sql)
└── 20260518_004_init_v5.sql       (idempotency_key + nuevas tablas)
```

Borrar los SQL del root cuando estén copiados. Documentar en
README el orden y comando `supabase db push`.

### #3 — Crear las 3 tablas nuevas (30 min)

Una sola migración con `leads`, `message_log`, `event_log` tal como
están en la sección 5.

### #4 — Trigger inicial en `reservations` (30 min)

```sql
CREATE OR REPLACE FUNCTION emit_reservation_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO event_log(event_type, payload, reservation_id, cliente_id)
        VALUES ('booking.created', row_to_json(NEW), NEW.id, NEW.cliente_id);
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO event_log(event_type, payload, reservation_id, cliente_id)
        VALUES ('booking.' || NEW.status, row_to_json(NEW), NEW.id, NEW.cliente_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_emit_reservation_event
AFTER INSERT OR UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION emit_reservation_event();
```

### #5 — Edge Function `dispatch-events` (2h)

`supabase/functions/dispatch-events/index.ts`. Programada con
`pg_cron` cada minuto. Lee `event_log WHERE delivered=false AND
(next_retry_at IS NULL OR next_retry_at < now())`. POST a
`salon_config.webhook_url`. Marca `delivered=true` o incrementa
`attempts` con backoff exponencial (1min, 5min, 30min, 2h, 12h).

---

## Decisiones dudosas que toca decir claro

1. **Twilio no es instantáneo**. Si vas a pivotar a WhatsApp como
   canal operativo, cuenta con 1-2 semanas de proceso de
   verificación con Meta + plantillas. No bloquees la fase 1-3 por
   esto: arranca con `wa.me` mejorado.

2. **El plan de 5 endpoints** (`new_lead`, `booking_request`,
   `booking_confirmed`, `booking_cancelled`, `customer_update`) que
   Notis propuso de entrada **no encaja con lo que ya hay**. Mejor:
   `check-availability`, `create-appointment` (ambos existen),
   `update-appointment` (nuevo), `capture-lead` (nuevo). Cuatro,
   no cinco, y dos ya hechos.

3. **Tres lugares definiendo el horario** (`check-availability/index.ts`,
   `salon_config.schedule`, `schedule-config.js`) es un bug esperando.
   No lo dejes para fase 3, métete en fase 2.

4. **El SPA admin de 75 KB en un solo `admin.js`** no es ideal, pero
   funciona. No es prioritario partirlo — la deuda real está en el
   backend, no en el panel.

5. **Vanilla JS está bien**. No migres a Next.js solo porque "está de
   moda". Cuesta semanas reescribir el admin y no aporta nada al
   negocio. Migra solo si necesitas SSR o app móvil.

6. **`pg_cron` no está activado por defecto en Supabase free tier**:
   compruébalo antes de la fase 3. Si tu plan no lo soporta,
   alternativa: Vercel Cron, GitHub Actions, o `setInterval` en una
   Edge Function que se llame externamente.
