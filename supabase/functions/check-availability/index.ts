/**
 * Peluquería Cool - Edge Function: check-availability
 *
 * POST /functions/v1/check-availability
 * Body: { fecha: "YYYY-MM-DD", servicio_id: "corte_hombre" }
 *
 * Response:
 * {
 *   disponible: boolean,
 *   dia_cerrado: boolean,
 *   fecha: string,
 *   slots_recomendados: Slot[],
 *   slots_todos: Slot[]
 * }
 *
 * Slot: { hora, hora_fin, tipo: "optimizado"|"normal", motivo? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

const TIMEZONE = 'Europe/Madrid';

// ─── Horario semanal del salón (0=dom, 1=lun, ..., 6=sáb) ───────────────────
const WEEKLY_SCHEDULE: Record<number, { open: string; close: string } | null> = {
    0: null, // Domingo
    1: { open: '16:00', close: '20:00' },
    2: { open: '10:00', close: '20:00' },
    3: { open: '10:00', close: '20:00' },
    4: { open: '10:00', close: '20:00' },
    5: { open: '10:00', close: '19:30' },
    6: { open: '09:00', close: '13:30' },
};

// Lunch break: martes-viernes de 13:00 a 16:00
const LUNCH_DAYS = [2, 3, 4, 5];
const LUNCH_CLOSE = '13:00';
const LUNCH_OPEN = '16:00';

const BUFFER_MINUTES = 10;
const SLOT_INTERVAL = 15;

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
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

    // Lunch break
    if (LUNCH_DAYS.includes(dow)) {
        result.morningClose = timeToMinutes(LUNCH_CLOSE);
        result.afternoonOpen = timeToMinutes(LUNCH_OPEN);
    }

    return result;
}

interface Appointment {
    inicio: number;
    fin: number;
}

function calcFreeIntervals(sched: DaySched, appointments: Appointment[]): Array<{ inicio: number; fin: number }> {
    // Build working periods (may have lunch break)
    const periods: Array<{ open: number; close: number }> = [];

    if (sched.morningClose && sched.afternoonOpen) {
        periods.push({ open: sched.open, close: sched.morningClose });
        periods.push({ open: sched.afternoonOpen, close: sched.close });
    } else {
        periods.push({ open: sched.open, close: sched.close });
    }

    const freeIntervals: Array<{ inicio: number; fin: number }> = [];

    for (const period of periods) {
        // Sort appointments within this period
        const periodAppts = appointments
            .filter(a => a.inicio < period.close && a.fin > period.open)
            .sort((a, b) => a.inicio - b.inicio);

        // Merge overlapping blocks (appointment + buffer)
        const blocks: Array<{ inicio: number; fin: number }> = [];
        for (const appt of periodAppts) {
            const block = { inicio: appt.inicio, fin: appt.fin + BUFFER_MINUTES };
            if (blocks.length === 0 || block.inicio > blocks[blocks.length - 1].fin) {
                blocks.push({ ...block });
            } else {
                blocks[blocks.length - 1].fin = Math.max(blocks[blocks.length - 1].fin, block.fin);
            }
        }

        // Find free intervals
        let cursor = period.open;
        for (const block of blocks) {
            if (block.inicio > cursor) {
                freeIntervals.push({ inicio: cursor, fin: block.inicio });
            }
            cursor = Math.max(cursor, block.fin);
        }
        if (cursor < period.close) {
            freeIntervals.push({ inicio: cursor, fin: period.close });
        }
    }

    return freeIntervals;
}

interface Slot {
    hora: string;
    hora_fin: string;
    tipo: 'optimizado' | 'normal';
    motivo?: string;
    hueco_restante?: number;
}

function classifySlot(
    start: number,
    duracion: number,
    intervalo: { inicio: number; fin: number },
    allIntervals: Array<{ inicio: number; fin: number }>,
    appointments: Appointment[]
): { tipo: 'optimizado' | 'normal'; motivo?: string } {
    const fin = start + duracion;
    const huecoRestante = intervalo.fin - fin;
    const huecoAntes = start - intervalo.inicio;
    const huecoUtilizable = huecoRestante === 0 || huecoRestante >= 30;

    const hayCitaDespues = appointments.some(
        a => a.inicio >= intervalo.fin && a.inicio <= intervalo.fin + 30
    );
    const esUltimoHueco = allIntervals.indexOf(intervalo) === allIntervals.length - 1;

    if (huecoUtilizable) {
        if (huecoRestante === 0) {
            return { tipo: 'optimizado', motivo: 'Llena exactamente el hueco disponible' };
        }
        if (hayCitaDespues && huecoRestante <= 15) {
            return { tipo: 'optimizado', motivo: 'Aprovecha hueco entre citas' };
        }
        if (esUltimoHueco && huecoRestante <= 30) {
            return { tipo: 'optimizado', motivo: 'Aprovecha el hueco al final del día' };
        }
        if (huecoAntes === 0 && huecoRestante >= 30) {
            return { tipo: 'optimizado', motivo: 'Empieza puntual y deja hueco aprovechable' };
        }
    }

    return { tipo: 'normal' };
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
    }

    let body: { fecha?: string; servicio_id?: string };
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS });
    }

    const { fecha, servicio_id } = body;

    if (!fecha || !servicio_id) {
        return new Response(
            JSON.stringify({ error: 'Campos requeridos: fecha (YYYY-MM-DD) y servicio_id' }),
            { status: 400, headers: CORS_HEADERS }
        );
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return new Response(
            JSON.stringify({ error: 'Formato de fecha inválido. Usa YYYY-MM-DD' }),
            { status: 400, headers: CORS_HEADERS }
        );
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check if day is closed
    const daySched = getDaySchedule(fecha);
    if (!daySched) {
        return new Response(JSON.stringify({
            disponible: false,
            dia_cerrado: true,
            fecha,
            motivo: 'El salón está cerrado este día',
            slots_recomendados: [],
            slots_todos: []
        }), { headers: CORS_HEADERS });
    }

    // Check dias_cerrados table
    const { data: diaFestivo } = await supabase
        .from('dias_cerrados')
        .select('motivo')
        .eq('fecha', fecha)
        .limit(1);

    if (diaFestivo && diaFestivo.length > 0) {
        return new Response(JSON.stringify({
            disponible: false,
            dia_cerrado: true,
            fecha,
            motivo: diaFestivo[0].motivo || 'Festivo',
            slots_recomendados: [],
            slots_todos: []
        }), { headers: CORS_HEADERS });
    }

    // Get service duration
    const { data: servicio } = await supabase
        .from('servicios')
        .select('duracion_minutos, nombre')
        .eq('id', servicio_id)
        .single();

    // Also check servicios_combinados
    const { data: combo } = await supabase
        .from('servicios_combinados')
        .select('duracion_real_minutos, nombre')
        .eq('id', servicio_id)
        .single();

    const duracion = combo?.duracion_real_minutos ?? servicio?.duracion_minutos ?? 45;

    // Get existing appointments for this day
    const { data: existingAppts } = await supabase
        .from('reservations')
        .select('time, hora_fin, duration_minutes')
        .eq('date', fecha)
        .not('status', 'in', '("cancelled","rejected")');

    const appointments: Appointment[] = (existingAppts || []).map((a) => {
        const inicio = timeToMinutes(a.time);
        const fin = a.hora_fin
            ? timeToMinutes(a.hora_fin)
            : inicio + (a.duration_minutes || 45);
        return { inicio, fin };
    });

    // Calculate free intervals
    const freeIntervals = calcFreeIntervals(daySched, appointments);

    // Calculate slots
    const now = new Date();
    const madridNow = new Intl.DateTimeFormat('es-ES', {
        timeZone: TIMEZONE,
        hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);

    const todayStr = madridNow.find(p => p.type === 'year')!.value + '-' +
        madridNow.find(p => p.type === 'month')!.value + '-' +
        madridNow.find(p => p.type === 'day')!.value;
    const nowMinutes = parseInt(madridNow.find(p => p.type === 'hour')!.value) * 60 +
        parseInt(madridNow.find(p => p.type === 'minute')!.value);

    const allSlots: Slot[] = [];

    for (const intervalo of freeIntervals) {
        const huecoDuracion = intervalo.fin - intervalo.inicio;
        if (huecoDuracion < duracion) continue;

        let start = intervalo.inicio;
        if (start % SLOT_INTERVAL !== 0) {
            start = Math.ceil(start / SLOT_INTERVAL) * SLOT_INTERVAL;
        }

        while (start + duracion <= intervalo.fin) {
            if (fecha === todayStr && start < nowMinutes + 15) {
                start += SLOT_INTERVAL;
                continue;
            }

            const classified = classifySlot(start, duracion, intervalo, freeIntervals, appointments);

            allSlots.push({
                hora: minutesToTime(start),
                hora_fin: minutesToTime(start + duracion),
                tipo: classified.tipo,
                motivo: classified.motivo,
                hueco_restante: intervalo.fin - (start + duracion),
            });

            start += SLOT_INTERVAL;
        }
    }

    const recomendados = allSlots.filter(s => s.tipo === 'optimizado').slice(0, 5);
    const todos = allSlots.sort((a, b) => a.hora.localeCompare(b.hora));

    return new Response(JSON.stringify({
        disponible: allSlots.length > 0,
        dia_cerrado: false,
        fecha,
        servicio_id,
        servicio_nombre: combo?.nombre ?? servicio?.nombre ?? servicio_id,
        duracion_minutos: duracion,
        slots_recomendados: recomendados,
        slots_todos: todos,
    }), { headers: CORS_HEADERS });
});
