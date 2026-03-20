/**
 * Peluquería Cool - Edge Function: create-appointment
 *
 * POST /functions/v1/create-appointment
 * Body: {
 *   nombre: string,
 *   telefono: string,
 *   fecha: "YYYY-MM-DD",
 *   hora: "HH:MM",
 *   servicios: string[],     // array de servicio_ids
 *   fuente?: "web"|"whatsapp"|"telefono"|"manual",
 *   email?: string,
 *   notas?: string
 * }
 *
 * Response: {
 *   success: boolean,
 *   appointment_id?: string,
 *   duracion_total?: number,
 *   hora_fin_estimada?: string,
 *   mensaje_confirmacion?: string,
 *   error?: string
 * }
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
const BUFFER_MINUTES = 10;

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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: CORS_HEADERS });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS_HEADERS });
    }

    let body: {
        nombre?: string;
        telefono?: string;
        fecha?: string;
        hora?: string;
        servicios?: string[];
        fuente?: string;
        email?: string;
        notas?: string;
    };

    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { status: 400, headers: CORS_HEADERS });
    }

    const { nombre, telefono, fecha, hora, servicios, fuente = 'whatsapp', email, notas } = body;

    // Validate required fields
    if (!nombre || !telefono || !fecha || !hora || !servicios || servicios.length === 0) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Campos requeridos: nombre, telefono, fecha, hora, servicios (array)'
        }), { status: 400, headers: CORS_HEADERS });
    }

    // Validate date and time formats
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        return new Response(JSON.stringify({ success: false, error: 'Formato de fecha inválido. Usa YYYY-MM-DD' }), { status: 400, headers: CORS_HEADERS });
    }
    if (!/^\d{2}:\d{2}$/.test(hora)) {
        return new Response(JSON.stringify({ success: false, error: 'Formato de hora inválido. Usa HH:MM' }), { status: 400, headers: CORS_HEADERS });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Get durations for all requested services
    let duracionTotal = 0;
    let servicioNombrePrincipal = servicios[0];
    const serviceNames: string[] = [];

    if (servicios.length === 1) {
        // Single service
        const { data: s } = await supabase.from('servicios').select('duracion_minutos, nombre').eq('id', servicios[0]).single();
        const { data: c } = await supabase.from('servicios_combinados').select('duracion_real_minutos, nombre').eq('id', servicios[0]).single();
        duracionTotal = c?.duracion_real_minutos ?? s?.duracion_minutos ?? 45;
        servicioNombrePrincipal = c?.nombre ?? s?.nombre ?? servicios[0];
        serviceNames.push(servicioNombrePrincipal);
    } else {
        // Multiple services: check if there's a combo
        const sorted = [...servicios].sort().join(',');
        const { data: combos } = await supabase.from('servicios_combinados').select('id, duracion_real_minutos, nombre, servicios_ids').eq('activo', true);

        const matchedCombo = (combos || []).find(c => [...c.servicios_ids].sort().join(',') === sorted);

        if (matchedCombo) {
            duracionTotal = matchedCombo.duracion_real_minutos;
            servicioNombrePrincipal = matchedCombo.nombre;
            serviceNames.push(matchedCombo.nombre);
        } else {
            // Calculate combined duration with 70% overlap heuristic
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

    const horaFin = minutesToTime(timeToMinutes(hora) + duracionTotal);

    // 2. Check availability: no overlapping appointments
    const { data: existing } = await supabase
        .from('reservations')
        .select('time, hora_fin, duration_minutes')
        .eq('date', fecha)
        .not('status', 'in', '("cancelled","rejected")');

    const newInicio = timeToMinutes(hora);
    const newFin = newInicio + duracionTotal + BUFFER_MINUTES;

    for (const appt of (existing || [])) {
        const apptInicio = timeToMinutes(appt.time);
        const apptFin = appt.hora_fin
            ? timeToMinutes(appt.hora_fin) + BUFFER_MINUTES
            : apptInicio + (appt.duration_minutes || 45) + BUFFER_MINUTES;

        if (newInicio < apptFin && newFin > apptInicio) {
            return new Response(JSON.stringify({
                success: false,
                error: `Lo sentimos, el horario ${hora} del ${fecha} ya está ocupado. Por favor elige otro horario.`,
                slot_sugerido: horaFin // Suggest next available slot
            }), { status: 409, headers: CORS_HEADERS });
        }
    }

    // 3. Look up or create client record
    let clienteId: string | null = null;
    const { data: clienteExistente } = await supabase
        .from('clientes')
        .select('id, total_visitas, cancelaciones_tardias')
        .eq('telefono', telefono)
        .single();

    if (clienteExistente) {
        clienteId = clienteExistente.id;
    }

    // 4. Create the reservation
    const { data: newReservation, error: insertError } = await supabase
        .from('reservations')
        .insert({
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
            status: 'pending',
            fuente: fuente,
            notes: notas ?? null,
            cliente_id: clienteId,
            recordatorio_enviado: false,
        })
        .select()
        .single();

    if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(JSON.stringify({
            success: false,
            error: 'Error al crear la cita. Inténtalo de nuevo.'
        }), { status: 500, headers: CORS_HEADERS });
    }

    // 5. Create internal notification
    await supabase.from('notifications').insert({
        type: 'reservation',
        reference_id: newReservation.id,
        message: `Nueva reserva (${fuente}) de ${nombre}: ${servicioNombrePrincipal} el ${fecha} a las ${hora}`,
        read: false,
    }).catch(() => {});

    // 6. Build confirmation message
    const fechaFormato = formatDate(fecha);
    const durStr = formatDuration(duracionTotal);

    let mensajeConfirmacion = `¡Tu cita está confirmada! ✨\n`;
    mensajeConfirmacion += `📍 ${servicioNombrePrincipal}\n`;
    mensajeConfirmacion += `📅 ${fechaFormato} a las ${hora}\n`;
    mensajeConfirmacion += `⏱ Duración aprox. ${durStr} (hasta las ${horaFin})\n`;
    mensajeConfirmacion += `📞 ¿Necesitas cambiar algo? Llámanos al +34 942 589 703\n`;
    mensajeConfirmacion += `¡Te esperamos en Peluquería Cool! 💇‍♀️`;

    // Add warning if client has late cancellations
    if (clienteExistente && clienteExistente.cancelaciones_tardias >= 3) {
        mensajeConfirmacion += `\n\n⚠️ Recuerda cancelar con al menos 2 horas de antelación si no puedes venir.`;
    }

    return new Response(JSON.stringify({
        success: true,
        appointment_id: newReservation.id,
        duracion_total: duracionTotal,
        hora_fin_estimada: horaFin,
        servicio_nombre: servicioNombrePrincipal,
        mensaje_confirmacion: mensajeConfirmacion,
        cliente_conocido: !!clienteId,
    }), { headers: CORS_HEADERS });
});
