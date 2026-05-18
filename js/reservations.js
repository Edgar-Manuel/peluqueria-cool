/**
 * Peluquería Cool - Reservations Module
 *
 * Crear citas: SIEMPRE a través de la Edge Function `create-appointment`.
 * Nunca hacer INSERT directo en `reservations` desde el navegador:
 * la validación de solapes con buffer + duración + horario vive en el
 * servidor. La inserción directa permitía citas pisadas.
 *
 * El resto de operaciones (listar, confirmar, cancelar, notas) sigue
 * en cliente con anon key + RLS. Esto migra cuando llegue Fase 3.
 */

class ReservationsManager {
    constructor() {
        this.cache = [];
        this.lastFetch = null;
        this.cacheTimeout = 30000; // 30 segundos
    }

    getClient() {
        return window.supabaseInstance || null;
    }

    /**
     * Crea una nueva reserva llamando a la Edge Function `create-appointment`.
     * Genera Idempotency-Key por petición para que un reintento por timeout
     * no cree duplicados.
     *
     * Acepta el shape histórico del front:
     *   { nombre, telefono, email?, fecha, hora, servicio, servicioNombre,
     *     fuente?, notas?, duracion?, status? }
     *
     * Devuelve la fila completa de `reservations` insertada (o la existente
     * si la idempotencia se activó).
     */
    async create(reservationData) {
        const url = window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL;
        const anonKey = window.APP_CONFIG && window.APP_CONFIG.SUPABASE_ANON_KEY;
        if (!url || !anonKey) {
            throw new Error('Configuración Supabase no disponible. Recarga la página.');
        }

        const idempotencyKey = (window.crypto && window.crypto.randomUUID)
            ? window.crypto.randomUUID()
            : 'idem-' + Date.now() + '-' + Math.random().toString(36).slice(2);

        // Mapeo del payload UI al contrato de la Edge Function.
        const payload = {
            nombre: reservationData.nombre,
            telefono: reservationData.telefono,
            email: reservationData.email || null,
            fecha: reservationData.fecha,
            hora: reservationData.hora,
            servicios: Array.isArray(reservationData.servicios) && reservationData.servicios.length
                ? reservationData.servicios
                : [reservationData.servicio],
            fuente: reservationData.fuente || 'web',
            notas: reservationData.notas || null,
        };
        if (reservationData.status) payload.status = reservationData.status;
        if (reservationData.duracion) {
            const d = parseInt(reservationData.duracion, 10);
            if (!isNaN(d) && d > 0) payload.duracion = d;
        }

        let response;
        try {
            response = await fetch(url + '/functions/v1/create-appointment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': anonKey,
                    'Authorization': 'Bearer ' + anonKey,
                    'Idempotency-Key': idempotencyKey,
                },
                body: JSON.stringify(payload),
            });
        } catch (networkErr) {
            console.error('create-appointment network error:', networkErr);
            throw new Error('No se pudo contactar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
        }

        let result = null;
        try { result = await response.json(); } catch (_) { /* sin body */ }

        if (!response.ok || !result || result.success !== true) {
            const msg = (result && result.error) || ('Error inesperado (HTTP ' + response.status + ')');
            const err = new Error(msg);
            if (result && result.slot_sugerido) err.slotSugerido = result.slot_sugerido;
            throw err;
        }

        // Reconstrucción defensiva por si una versión vieja de la función
        // todavía no devolviera `reservation` en el body.
        const reservationRow = result.reservation || {
            id: result.appointment_id,
            date: payload.fecha,
            time: payload.hora,
            hora_fin: result.hora_fin_estimada,
            duration_minutes: result.duracion_total,
            customer_name: payload.nombre,
            customer_phone: payload.telefono,
            customer_email: payload.email,
            service: payload.servicios[0],
            service_name: result.servicio_nombre,
            servicios_ids: payload.servicios,
            status: payload.status || 'pending',
            fuente: payload.fuente,
            notes: payload.notas,
        };

        // Webhook saliente (contrato legacy { action:'new_booking', data: row }).
        // Sólo lo disparamos en creaciones reales, no en replays idempotentes:
        // si el receptor ya recibió el primer aviso, no queremos duplicarlo.
        if (!result.idempotent_replay) {
            this.notifyWebhook(reservationRow).catch(err => console.error('Webhook Error:', err));
        }

        return reservationRow;
    }

    // Notificar al sistema externo (Chatfuel/Make/n8n).
    // TODO Fase 3: mover este envío a un trigger Postgres + cola event_log
    // con reintentos. Hoy se pierde el aviso si el receptor está caído.
    async notifyWebhook(reservation) {
        let webhookUrl = (window.APP_CONFIG && window.APP_CONFIG.WEBHOOK_URL) || null;

        try {
            const client = this.getClient();
            if (client) {
                const { data } = await client
                    .from('salon_config')
                    .select('value')
                    .eq('key', 'webhook_url')
                    .single();
                if (data && data.value) webhookUrl = data.value;
            }
        } catch (error) {
            console.error('Error obteniendo webhook db config:', error);
        }

        if (!webhookUrl || webhookUrl === '""') return;

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'new_booking',
                    data: reservation
                })
            });
        } catch (error) {
            console.error('Error enviando notificación al webhook:', error);
        }
    }

    // Obtener todas las reservas
    async getAll(filters = {}) {
        const client = this.getClient();
        if (!client) throw new Error('Database not connected');

        let query = client
            .from('reservations')
            .select('*')
            .order('date', { ascending: true })
            .order('time', { ascending: true });

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.date) query = query.eq('date', filters.date);
        if (filters.dateFrom) query = query.gte('date', filters.dateFrom);
        if (filters.dateTo) query = query.lte('date', filters.dateTo);

        const { data, error } = await query;
        if (error) throw error;

        this.cache = data;
        this.lastFetch = Date.now();
        return data;
    }

    async getToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.getAll({ date: today });
    }

    async getThisWeek() {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        return this.getAll({
            dateFrom: startOfWeek.toISOString().split('T')[0],
            dateTo: endOfWeek.toISOString().split('T')[0]
        });
    }

    async getPending() {
        return this.getAll({ status: 'pending' });
    }

    async updateStatus(id, status, notes = null) {
        const client = this.getClient();
        if (!client) throw new Error('Database not connected');

        const updateData = { updated_at: new Date().toISOString() };
        if (status) updateData.status = status;
        if (notes !== null) updateData.notes = notes;

        const { data, error } = await client
            .from('reservations')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async confirm(id)  { return this.updateStatus(id, 'confirmed'); }
    async reject(id, reason = '') { return this.updateStatus(id, 'rejected', reason); }
    async complete(id) { return this.updateStatus(id, 'completed'); }
    async cancel(id)   { return this.updateStatus(id, 'cancelled'); }

    async addNote(id, note) {
        const client = this.getClient();
        if (!client) throw new Error('Database not connected');

        const { data: current } = await client
            .from('reservations')
            .select('notes')
            .eq('id', id)
            .single();

        const existingNotes = current?.notes || '';
        const timestamp = new Date().toLocaleString('es-ES');
        const newNotes = existingNotes + `\n[${timestamp}] ${note}`;

        return this.updateStatus(id, null, newNotes.trim());
    }

    async getStats() {
        const today = new Date().toISOString().split('T')[0];
        const startOfMonth = new Date();
        startOfMonth.setDate(1);

        const [todayRes, pendingRes, weekRes, monthRes] = await Promise.all([
            this.getAll({ date: today }),
            this.getPending(),
            this.getThisWeek(),
            this.getAll({ dateFrom: startOfMonth.toISOString().split('T')[0] })
        ]);

        return {
            today: todayRes.length,
            pending: pendingRes.length,
            week: weekRes.length,
            month: monthRes.length
        };
    }
}

// Instancia global
const reservations = new ReservationsManager();
window.reservations = reservations;
