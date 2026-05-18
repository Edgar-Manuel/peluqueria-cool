/**
 * Peluquería Cool - Edge Function: create-appointment
 *
 * Única vía de creación de reservas. La llaman:
 *   - El formulario web (js/reservations.js)
 *   - El panel admin (admin.js, fuente="manual")
 *   - WhatsApp / Notis (fuente="whatsapp")
 *
 * POST /functions/v1/create-appointment
 * Headers:
 *   Idempotency-Key: <uuid>   ← recomendado; permite reintentos seguros
 * Body: {
 *   nombre: string,
 *   telefono: string,
 *   fecha: "YYYY-MM-DD",
 *   hora: "HH:MM",
 *   servicios: string[],          // array de servicio_ids
 *   fuente?: "web"|"whatsapp"|"telefono"|"manual",
 *   email?: string,
 *   notas?: string,
 *   status?: "pending"|"confirmed",   // override sólo para fuente=manual
 *   duracion?: number                  // override en minutos (admin)
 * }
 *
 * Response 200: {
 *   success: true,
 *   appointment_id: string,
 *   duracion_total: number,
 *   hora_fin_estimada: string,
 *   servicio_nombre: string,
 *   mensaje_confirmacion: string,
 *   cliente_conocido: boolean,
 *   reservation: <row completa>,
 *   idempotent_replay: boolean        // true si vino por Idempotency-Key existente
 * }
 *
 * Errores:
 *   400  validación (formato, día cerrado, hora fuera de horario, en el pasado)
 *   409  hueco ocupado (overlap con buffer); incluye slot_sugerido
 *   500  fallo inesperado
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, Idempotency-Key',
    'Content-Type': 'application/json',
};

const TIMEZONE = 'Europe/Madrid';
const BUFFER_MINUTES = 10;

// ─── Horario semanal del salón ──────────────────────────────────────────────
// Duplicado intencionado con check-availability/index.ts.
// TODO Fase 2: mover a salon_config.schedule y leer una sola vez con cache.
// Si tocas esto, toca también supabase/functions/check-availability/index.ts.
const WEEKLY_SCHEDULE: Record<number, { open: string; close: string } | null> = {
    0: null,                                  // Domingo
    1: { open: '16:00', close: '20:00' },     // Lunes
    2: { open: '10:00', close: '20:00' },     // Martes
    3: { open: '10:00', close: '20:00' },     // Miércoles
    4: { open: '10:00', close: '20:00' },     // Jueves
    5: { open: '10:00', close: '19:30' },     // Viernes
    6: { open: '09:00', close: '13:30' },     // Sábado
};
const LUNCH_DAYS = [2, 3, 4, 5];
const LUNCH_CLOSE = '13:00';
const LUNCH_OPEN = '16:00';

const ALLOWED_STATUS_OVERRIDE = new Set(['pending', 'confirmed']);
const ALLOWED_FUENTE = new Set(['web', 'whatsapp', 'telefono', 'manual']);
const PHONE_REGEX = /^\+?\d[\d\s\-().]{6,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(min: number): string {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}min`;
    if (h > 0) return `${h}h`;
    return `${m} minutos`;
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getDayOfWeek(dateStr: string): number {
    return new Date(dateStr + 'T12:00:00').getDay();
}

interface DaySched {
    open: number;
    close: number;
    morningClose?: number;
    afternoonOpen?: number;
}

function getDaySchedule(dateStr: string): DaySched | null {
    const dow = getDayOfWeek(dateStr);
    const sched = WEEKLY_SCHEDULE[dow];
    if (!sched) return null;

    const result: DaySched = {
        open: timeToMinutes(sched.open),
        close: timeToMinutes(sched.close),
    };
    if (LUNCH_DAYS.includes(dow)) {
        result.morningClose = timeToMinutes(LUNCH_CLOSE);
        result.afternoonOpen = timeToMinutes(LUNCH_OPEN);
    }
    return result;
}

function isInOpenPeriod(sched: DaySched, startMin: number, endMin: number): boolean {
    // El intervalo [startMin, endMin) debe caber dentro de un único bloque de apertura.
    if (sched.morningClose && sched.afternoonOpen) {
        const morning = startMin >= sched.open && endMin <= sched.morningClose;
        const afternoon = startMin >= sched.afternoonOpen && endMin <= sched.close;
        return morning || afternoon;
    }
    return startMin >= sched.open && endMin <= sched.close;
}

function madridNowParts(): { date: string; minutes: number } {
    // 'sv-SE' produce "YYYY-MM-DD HH:MM:SS" con la zona indicada.
    const iso = new Date().toLocaleString('sv-SE', { timeZone: TIMEZONE });
    const [d, t] = iso.split(' ');
    return { date: d, minutes: timeToMinutes(t.slice(0, 5)) };
}

function jsonError(error: string, status: number, extra: Record<string, unknown> = {}) {
    return new Response(
        JSON.stringify({ success: false, error, ...extra }),
        { status, headers: CORS_HEADERS }
    );
}

interface ReservationRow {
    id: string;
    date: string;
    time: string;
    hora_fin: string | null;
    duration_minutes: number | null;
    service_name: string | null;
    cliente_id: string | null;
    [k: string]: unknown;
}

function successResponse(args: {
    reservation: ReservationRow;
    duracionTotal: number;
    horaFin: string;
    servicioNombre: string;
    mensajeConfirmacion: string;
    clienteConocido: boolean;
    idempotentReplay: boolean;
}) {
    return new Response(JSON.stringify({
        success: true,
        appointment_id: args.reservation.id,
        duracion_total: args.duracionTotal,
        hora_fin_estimada: args.horaFin,
        servicio_nombre: args.servicioNombre,
        mensaje_confirmacion: args.mensajeConfirmacion,
        cliente_conocido: args.clienteConocido,
        reservation: args.reservation,
        idempotent_replay: args.idempotentReplay,
    }), { headers: CORS_HEADERS });
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
        return jsonError('Method not allowed', 405);
    }

    let body: {
        nombre?: string;
        telefono?: string;
        fecha?: string;
        hora?: string;
        servicios?: string[];
        fuente?: string;
        email?: string | null;
        notas?: string | null;
        status?: string;
        duracion?: number;
    };

    try {
        body = await req.json();
    } catch {
        return jsonError('Invalid JSON body', 400);
    }

    const {
        nombre, telefono, fecha, hora, servicios,
        fuente: fuenteRaw, email, notas,
        status: statusOverrideRaw, duracion: duracionOverrideRaw,
    } = body;

    // ─── Validación de campos básicos ───────────────────────────────────────
    if (!nombre || !telefono || !fecha || !hora || !servicios || servicios.length === 0) {
        return jsonError('Campos requeridos: nombre, telefono, fecha, hora, servicios (array)', 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return jsonError('Formato de fecha inválido. Usa YYYY-MM-DD', 400);
    }
    if (!/^\d{2}:\d{2}$/.test(hora)) {
        return jsonError('Formato de hora inválido. Usa HH:MM', 400);
    }
    if (!PHONE_REGEX.test(telefono.trim())) {
        return jsonError('Teléfono inválido', 400);
    }
    if (email && !EMAIL_REGEX.test(email.trim())) {
        return jsonError('Email inválido', 400);
    }

    const fuente = fuenteRaw && ALLOWED_FUENTE.has(fuenteRaw) ? fuenteRaw : 'whatsapp';

    const statusOverride = statusOverrideRaw && ALLOWED_STATUS_OVERRIDE.has(statusOverrideRaw)
        ? statusOverrideRaw
        : null;
    // Solo permitimos override de status para fuente=manual (admin) o telefono (recepción).
    // Para web/whatsapp siempre arranca en pending.
    const status = (statusOverride && (fuente === 'manual' || fuente === 'telefono'))
        ? statusOverride
        : 'pending';

    const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key');

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ─── Idempotencia: si la clave ya existe, devolver la reserva existente ─
    if (idempotencyKey) {
        const { data: existing } = await supabase
            .from('reservations')
            .select('*')
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

        if (existing) {
            return successResponse({
                reservation: existing as ReservationRow,
                duracionTotal: existing.duration_minutes ?? 45,
                horaFin: existing.hora_fin ?? hora,
                servicioNombre: existing.service_name ?? '',
                mensajeConfirmacion: '(Reintento) Tu cita ya estaba registrada.',
                clienteConocido: !!existing.cliente_id,
                idempotentReplay: true,
            });
        }
    }

    // ─── Validación de horario / día cerrado / festivo / pasado ─────────────
    const daySched = getDaySchedule(fecha);
    if (!daySched) {
        return jsonError('Ese día el salón está cerrado (domingo).', 400);
    }

    const { data: festivos } = await supabase
        .from('dias_cerrados')
        .select('motivo')
        .eq('fecha', fecha)
        .limit(1);
    if (festivos && festivos.length > 0) {
        return jsonError(`Día cerrado: ${festivos[0].motivo}`, 400);
    }

    // No reservar en el pasado (zona Madrid).
    const now = madridNowParts();
    if (fecha < now.date) {
        return jsonError('No se pueden crear reservas en el pasado.', 400);
    }

    // ─── Cálculo de duración (combo / servicios sueltos / override) ─────────
    let duracionTotal = 0;
    let servicioNombrePrincipal = servicios[0];
    const serviceNames: string[] = [];

    if (servicios.length === 1) {
        const { data: s } = await supabase.from('servicios').select('duracion_minutos, nombre').eq('id', servicios[0]).maybeSingle();
        const { data: c } = await supabase.from('servicios_combinados').select('duracion_real_minutos, nombre').eq('id', servicios[0]).maybeSingle();
        duracionTotal = c?.duracion_real_minutos ?? s?.duracion_minutos ?? 45;
        servicioNombrePrincipal = c?.nombre ?? s?.nombre ?? servicios[0];
        serviceNames.push(servicioNombrePrincipal);
    } else {
        const sorted = [...servicios].sort().join(',');
        const { data: combos } = await supabase.from('servicios_combinados').select('id, duracion_real_minutos, nombre, servicios_ids').eq('activo', true);
        const matchedCombo = (combos || []).find(c => [...c.servicios_ids].sort().join(',') === sorted);

        if (matchedCombo) {
            duracionTotal = matchedCombo.duracion_real_minutos;
            servicioNombrePrincipal = matchedCombo.nombre;
            serviceNames.push(matchedCombo.nombre);
        } else {
            const { data: svcList } = await supabase.from('servicios').select('id, duracion_minutos, nombre').in('id', servicios);
            const durations = (svcList || []).map(s => s.duracion_minutos);
            const names = (svcList || []).map(s => s.nombre);
            const total = durations.reduce((a, b) => a + b, 0);
            const max = Math.max(...durations);
            duracionTotal = Math.round(max + (total - max) * 0.7);
            servicioNombrePrincipal = names.join(' + ');
            serviceNames.push(...names);
        }
    }

    // Override manual de duración (admin: "esto va a tardar más").
    if (typeof duracionOverrideRaw === 'number' && duracionOverrideRaw > 0 && duracionOverrideRaw <= 480) {
        duracionTotal = Math.round(duracionOverrideRaw);
    }

    const inicioMin = timeToMinutes(hora);
    const finMin = inicioMin + duracionTotal;
    const horaFin = minutesToTime(finMin);

    // ─── Validación: hora dentro de un bloque de apertura ───────────────────
    if (!isInOpenPeriod(daySched, inicioMin, finMin)) {
        return jsonError(
            `La cita (${hora}–${horaFin}) cae fuera del horario de apertura o se cruza con el descanso.`,
            400
        );
    }

    // ─── Validación: no en el pasado (mismo día) con margen de 15 min ───────
    if (fecha === now.date && inicioMin < now.minutes + 15) {
        return jsonError('La hora seleccionada es demasiado pronto. Elige al menos 15 min de margen.', 400);
    }

    // ─── Validación de solape con buffer ────────────────────────────────────
    const { data: existing } = await supabase
        .from('reservations')
        .select('time, hora_fin, duration_minutes')
        .eq('date', fecha)
        .not('status', 'in', '("cancelled","rejected")');

    const newFinConBuffer = finMin + BUFFER_MINUTES;
    for (const appt of (existing || [])) {
        const apptInicio = timeToMinutes(appt.time);
        const apptFin = appt.hora_fin
            ? timeToMinutes(appt.hora_fin) + BUFFER_MINUTES
            : apptInicio + (appt.duration_minutes || 45) + BUFFER_MINUTES;

        if (inicioMin < apptFin && newFinConBuffer > apptInicio) {
            return jsonError(
                `Lo sentimos, el horario ${hora} del ${fecha} ya está ocupado. Por favor elige otro horario.`,
                409,
                { slot_sugerido: horaFin }
            );
        }
    }

    // ─── Buscar/usar cliente por teléfono ───────────────────────────────────
    let clienteId: string | null = null;
    let cancelacionesTardias = 0;
    const { data: clienteExistente } = await supabase
        .from('clientes')
        .select('id, cancelaciones_tardias')
        .eq('telefono', telefono)
        .maybeSingle();
    if (clienteExistente) {
        clienteId = clienteExistente.id;
        cancelacionesTardias = clienteExistente.cancelaciones_tardias ?? 0;
    }

    // ─── INSERT ────────────────────────────────────────────────────────────
    const insertPayload = {
        customer_name: nombre,
        customer_phone: telefono,
        customer_email: email ?? null,
        service: servicios[0],
        service_name: servicioNombrePrincipal,
        servicio_id: servicios[0],
        servicios_ids: servicios,
        date: fecha,
        time: hora,
        hora_fin: horaFin,
        duration_minutes: duracionTotal,
        status,
        fuente,
        notes: notas ?? null,
        cliente_id: clienteId,
        recordatorio_enviado: false,
        idempotency_key: idempotencyKey ?? null,
    };

    const { data: newReservation, error: insertError } = await supabase
        .from('reservations')
        .insert(insertPayload)
        .select()
        .single();

    if (insertError) {
        // Carrera contra otra petición con la misma Idempotency-Key:
        // alguien ganó la inserción, devolvemos la suya como replay.
        // Postgres code 23505 = unique_violation.
        if (insertError.code === '23505' && idempotencyKey) {
            const { data: winner } = await supabase
                .from('reservations')
                .select('*')
                .eq('idempotency_key', idempotencyKey)
                .maybeSingle();
            if (winner) {
                return successResponse({
                    reservation: winner as ReservationRow,
                    duracionTotal: winner.duration_minutes ?? duracionTotal,
                    horaFin: winner.hora_fin ?? horaFin,
                    servicioNombre: winner.service_name ?? servicioNombrePrincipal,
                    mensajeConfirmacion: '(Reintento) Tu cita ya estaba registrada.',
                    clienteConocido: !!winner.cliente_id,
                    idempotentReplay: true,
                });
            }
        }
        console.error('Insert error:', insertError);
        return jsonError('Error al crear la cita. Inténtalo de nuevo.', 500);
    }

    // ─── Notificación interna para el panel admin ───────────────────────────
    await supabase.from('notifications').insert({
        type: 'reservation',
        reference_id: newReservation.id,
        message: `Nueva reserva (${fuente}) de ${nombre}: ${servicioNombrePrincipal} el ${fecha} a las ${hora}`,
        read: false,
    }).catch(() => {});

    // ─── Mensaje de confirmación listo para WhatsApp ────────────────────────
    const fechaFormato = formatDate(fecha);
    const durStr = formatDuration(duracionTotal);

    let mensajeConfirmacion = `¡Tu cita está confirmada! ✨\n`;
    mensajeConfirmacion += `📍 ${servicioNombrePrincipal}\n`;
    mensajeConfirmacion += `📅 ${fechaFormato} a las ${hora}\n`;
    mensajeConfirmacion += `⏱ Duración aprox. ${durStr} (hasta las ${horaFin})\n`;
    mensajeConfirmacion += `📞 ¿Necesitas cambiar algo? Llámanos al +34 942 589 703\n`;
    mensajeConfirmacion += `¡Te esperamos en Peluquería Cool! 💇‍♀️`;

    if (cancelacionesTardias >= 3) {
        mensajeConfirmacion += `\n\n⚠️ Recuerda cancelar con al menos 2 horas de antelación si no puedes venir.`;
    }

    return successResponse({
        reservation: newReservation as ReservationRow,
        duracionTotal,
        horaFin,
        servicioNombre: servicioNombrePrincipal,
        mensajeConfirmacion,
        clienteConocido: !!clienteId,
        idempotentReplay: false,
    });
});
