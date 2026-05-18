# Estado actual del sistema — Peluquería Cool

Auditoría del repo a 2026-05-18, branch `claude/booking-system-architecture-PERyR`.
Objetivo: saber qué hay montado **antes** de añadir nada nuevo.

---

## 1. Stack real

- **Frontend**: HTML/CSS/JS vanilla, sin Next.js, sin React.
  - `index.html` → landing público con scrollytelling + formulario de reserva.
  - `admin.html` + `admin.js` (75 KB) + `admin.css` → panel admin completo.
- **Base de datos / Auth**: Supabase (PostgreSQL + Auth + RLS).
- **Backend serverless**: 2 Supabase Edge Functions en `supabase/functions/`.
- **Cliente Supabase en navegador**: cargado desde `js/supabase-client.js`,
  config en `js/config.prod.js` (URL y anon key, no service role).
- **Webhook saliente**: configurable desde admin, leído de
  `salon_config.webhook_url` y disparado al crear reserva.
- **Despliegue previsto**: estático en Netlify/Vercel + Supabase como
  backend. No hay `package.json`, no hay build step.

---

## 2. Schema de base de datos (resumen)

Definido en `supabase-patch-v4.sql` (idempotente, ejecutable encima de
v2/v3). Tablas activas:

| Tabla | Para qué |
|---|---|
| `reservations` | Citas. Campos: `customer_name`, `customer_phone`, `customer_email`, `service`, `service_name`, `servicio_id` (FK), `servicios_ids` (text[]), `date`, `time`, `hora_fin` (calculado por trigger), `duration_minutes`, `status` (`pending`/`confirmed`/`cancelled`/`rejected`/`completed`), `fuente` (`web`/`whatsapp`/`telefono`/`manual`), `notes`, `cliente_id` (FK), `recordatorio_enviado`, `no_show`, `cancelacion_tardia`, `precio_estimado`, `whatsapp_message_id`. |
| `clientes` | Histórico de clientas. `nombre`, `telefono` (UNIQUE), `email`, `total_visitas`, `ultima_visita`, `ultimo_servicio_*`, `cancelaciones_tardias`, `notas`. Se autoactualiza al marcar reservas como `completed`. |
| `servicios` | Catálogo. `id` (text PK), `nombre`, `duracion_minutos`, `precio`, `color_calendario`, `categoria` (`corte`/`color`/`tratamiento`/`styling`/`otro`), `requiere_preparacion`, `tiempo_preparacion_minutos`. Precargado con 16 servicios. |
| `servicios_combinados` | Combos (`tinte_corte`, `mechas_corte`, `pack_novia`...) con duración real ya optimizada (solapamientos de reposo). |
| `dias_cerrados` | Festivos y vacaciones. Calendario 2026 precargado. |
| `salon_config` | KV con `webhook_url`, `schedule`, `buffer_minutos` (10), `aviso_cancelacion_horas` (2), `timezone` (`Europe/Madrid`), `slots_intervalo_minutos` (15). |
| `products` | Catálogo e-commerce (preparado para Stripe, no enchufado todavía). |
| `admins` | Tabla pivote para validar rol admin tras login Supabase Auth. |
| `notifications` | Cola interna de avisos para el panel. |

**Triggers activos**
- `trg_set_hora_fin` → calcula `hora_fin` desde `time + duration_minutes`.
- `trg_historial_cliente` → al marcar `completed`, crea/upserts en `clientes`
  e incrementa `total_visitas`; al cancelar con <2h de antelación,
  incrementa `cancelaciones_tardias`.

**Funciones SQL** : `calc_hora_fin()`, `citas_se_solapan()`.

**Vista**: `vista_citas_hoy` con JOIN a `servicios` (color, categoría).

**RLS** activado en todas las tablas. Política general: cliente puede
INSERT en `reservations`, autenticado (admin) puede todo.

---

## 3. Endpoints ya existentes (Supabase Edge Functions)

### `POST /functions/v1/check-availability`
Calcula slots libres respetando horario semanal, lunch break, festivos,
buffer entre citas y duración del servicio. Devuelve `slots_recomendados`
(optimizados) y `slots_todos`.

```jsonc
// Request
{ "fecha": "2026-05-20", "servicio_id": "corte_mujer" }

// Response
{
  "disponible": true,
  "dia_cerrado": false,
  "fecha": "2026-05-20",
  "servicio_nombre": "Corte Mujer",
  "duracion_minutos": 45,
  "slots_recomendados": [
    { "hora": "10:00", "hora_fin": "10:45", "tipo": "optimizado",
      "motivo": "Empieza puntual y deja hueco aprovechable",
      "hueco_restante": 75 }
  ],
  "slots_todos": [ /* ... */ ]
}
```

Horario hardcodeado en la función (no lee `salon_config.schedule`):
- L 16:00–20:00
- M–J 10:00–13:00 + 16:00–20:00
- V 10:00–13:00 + 16:00–19:30
- S 09:00–13:30
- D cerrado

### `POST /functions/v1/create-appointment`
Crea la cita con detección de combos automática, verificación
anti-solapamiento con buffer, vincula con `clientes` por teléfono y
genera mensaje de confirmación listo para WhatsApp.

```jsonc
// Request
{
  "nombre": "Ana",
  "telefono": "+34600...",
  "fecha": "2026-05-20",
  "hora": "10:00",
  "servicios": ["mechas", "corte_mujer"],   // array; detecta combo
  "fuente": "whatsapp",                      // web|whatsapp|telefono|manual
  "email": "ana@...",                        // opcional
  "notas": "..."
}

// Response
{
  "success": true,
  "appointment_id": "uuid",
  "duracion_total": 150,
  "hora_fin_estimada": "12:30",
  "servicio_nombre": "Mechas + Corte",
  "mensaje_confirmacion": "¡Tu cita está confirmada! ✨\n...",
  "cliente_conocido": true
}
```

Errores: 400 (validación), 409 (`error` + `slot_sugerido` si hay solape).

**Las dos funciones aceptan `fuente: "whatsapp"`, ya están listas para
ser llamadas desde Notis u otro middleware.**

---

## 4. Webhook saliente (ya operativo)

`js/reservations.js` → tras INSERT en `reservations` desde el formulario
web, dispara:

```http
POST {salon_config.webhook_url}
Content-Type: application/json

{ "action": "new_booking", "data": { ...reservation row... } }
```

La URL se configura desde el panel admin (sección Ajustes). Pensado
para Make/n8n/Chatfuel. **Notis puede suscribirse aquí como receptor.**

⚠️ Limitación: la Edge Function `create-appointment` **no** dispara este
webhook (solo lo hace el cliente JS). Si la reserva entra por WhatsApp
via Notis llamando a la Edge Function, no se dispara el webhook saliente.
Pendiente de unificar.

---

## 5. Panel admin (`admin.html`)

Secciones funcionales:
- **Dashboard**: métricas (hoy, pendientes, semana, ingresos mes),
  mini-calendario semanal, citas de hoy, feed de notificaciones.
- **Reservas**: tabla filtrable por estado/fecha, acciones
  confirmar/rechazar/completar/cancelar/añadir nota.
- **Agenda**: timeline diaria con detección de huecos para sugerir
  citas; navegación día a día.
- **Calendario**: vistas día/semana/mes con código de color por servicio.
- **Pedidos / Productos**: scaffolding (Stripe no enchufado todavía).
- **Clientes**: pestaña funcional con historial, visitas y cancelaciones.
- **Ajustes**: editar webhook URL, perfil admin.

Auth: Supabase Auth + tabla `admins` para validar rol. Login oculto en
botón del footer del landing. Rate limiting de intentos en cliente
(`js/auth.js`, 5 intentos, 15 min de bloqueo).

---

## 6. Integraciones declaradas vs implementadas

Según `.env.example` el proyecto contempla:

| Servicio | Estado real |
|---|---|
| Supabase | ✅ Implementado (auth + DB + RLS + 2 edge functions) |
| Webhook saliente (Make/Chatfuel) | ✅ Configurable + activo en `reservations.js` |
| WhatsApp `wa.me` link | ✅ Solo botón con mensaje prerellenado desde landing |
| Twilio WhatsApp API | ❌ Solo en `.env.example`, sin código |
| Resend (emails) | ❌ Solo en `.env.example`, sin código |
| Stripe | ❌ Solo en `.env.example`, sin checkout funcional |
| EmailJS / Calendly / SimplyBook | ❌ Documentadas como alternativas, no activas |
| Google Analytics / Maps | ⚠️ Solo metaetiquetas + iframe embed |

---

## 7. Qué falta para el plan "4 endpoints + Notis"

El plan que propone Notis (5 endpoints `new-lead`, `booking-request`,
`booking-confirmed`, `booking-cancelled`, `customer-update`) **se solapa
parcialmente con lo que ya existe**:

| Endpoint del plan | Qué hay ya | Qué falta |
|---|---|---|
| `new-lead` | ❌ Nada | Crear (lead = sin fecha definida; clasificar interés). Hace falta tabla `leads` o usar `reservations.status = 'lead'`. |
| `booking-request` | ✅ Cubierto por `create-appointment` (crea con `status='pending'`) | Renombrar/aliasear si Notis prefiere otra ruta, o usar la existente. |
| `booking-confirmed` | ⚠️ Hoy se hace con `UPDATE reservations SET status='confirmed'` directo desde admin | Falta endpoint dedicado que dispare un evento saliente (recordatorio 24h). |
| `booking-cancelled` | ⚠️ Igual: `UPDATE` directo | Falta endpoint dedicado que (a) libere hueco, (b) busque clientes reactivables. |
| `customer-update` | ⚠️ Trigger ya mantiene `clientes` actualizado al completar | Falta endpoint expuesto (Notis necesita leer/escribir notas, preferencias). |

**Eventos salientes**: hoy solo hay UNO (`new_booking` via webhook desde
cliente JS). Para el modelo de Notis hacen falta también
`booking_confirmed`, `booking_cancelled`, `customer_inactive`,
`slot_available`. Hoy no existen.

---

## 8. Recomendación de siguiente paso

No reescribir lo que ya hay. **Construir encima**:

1. Renombrar el webhook saliente a un sistema de eventos con
   `event_type` en el payload (`booking.created`, `booking.confirmed`,
   `booking.cancelled`, `customer.inactive`, `slot.available`).
2. Mover el disparo de webhook **de cliente JS a un trigger Postgres o
   a las Edge Functions**, para que cualquier origen (web, Notis,
   admin manual) dispare los mismos eventos. Single source of truth.
3. Añadir Edge Functions:
   - `update-appointment` (confirm/cancel/complete) que dispare evento.
   - `lead-capture` para el caso "todavía no hay fecha".
   - `customer-update` para que Notis modifique notas/preferencias.
4. Cron Supabase para `customer_inactive` (clientas sin visita en >X
   meses) y `slot_available` (cancelaciones que dejan hueco hoy).
5. Mantener vanilla JS en frontend (cambiar a Next solo si hace falta
   por otra razón).
