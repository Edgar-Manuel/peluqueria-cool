/**
 * Peluquería Cool - Reservations Module
 * CRUD de reservas con Supabase
 */

class ReservationsManager {
    constructor() {
        this.cache = [];
        this.lastFetch = null;
        this.cacheTimeout = 30000; // 30 segundos
    }

    // Obtener cliente Supabase
    getClient() {
        return window.supabaseInstance || null;
    }

    // Verificar disponibilidad (evitar dobles reservas)
    async checkAvailability(date, time) {
        const client = this.getClient();
        if (!client) throw new Error('Database not connected');

        const { data, error } = await client
            .from('reservations')
            .select('id')
            .eq('date', date)
            .eq('time', time)
            .neq('status', 'cancelled'); // Ignorar las canceladas

        if (error) throw error;
        return data.length === 0; // true si está libre
    }

    // Crear nueva reserva (desde cualquier fuente)
    async create(reservationData) {
        const client = this.getClient();
        if (!client) throw new Error('Database not connected');

        // 1. Comprobar disponibilidad real
        const isAvailable = await this.checkAvailability(reservationData.fecha, reservationData.hora);
        if (!isAvailable) {
            throw new Error('Lo sentimos, este horario ya ha sido reservado justo ahora. Por favor, elige otro.');
        }

        // 2. Insertar en Supabase
        const { data, error } = await client
            .from('reservations')
            .insert({
                customer_name: reservationData.nombre,
                customer_phone: reservationData.telefono,
                customer_email: reservationData.email || null,
                service: reservationData.servicio,
                service_name: reservationData.servicioNombre,
                date: reservationData.fecha,
                time: reservationData.hora,
                status: 'pending',
                fuente: reservationData.fuente || 'web',
                notes: reservationData.notas || '',
                recordatorio_enviado: false,
                duration_minutes: parseInt(reservationData.duracion || 30),
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // 3. Notificar vía Webhook (Chatfuel/Make) - Silencioso para no bloquear al usuario
        this.notifyWebhook(data).catch(err => console.error('Webhook Error:', err));

        // 4. Crear notificación interna para el admin
        await this.createNotification(data.id, `Nueva reserva (${data.fuente}) de ${reservationData.nombre}`);

        return data;
    }

    // Notificar al sistema externo (Chatfuel/Make)
    async notifyWebhook(reservation) {
        let webhookUrl = window.APP_CONFIG?.WEBHOOK_URL || null;

        // Intentar obtener URL actualizada desde la base de datos
        try {
            const client = this.getClient();
            if (client) {
                const { data } = await client
                    .from('salon_config')
                    .select('value')
                    .eq('key', 'webhook_url')
                    .single();
                
                if (data && data.value) {
                    webhookUrl = data.value;
                }
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

        // Aplicar filtros
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.date) {
            query = query.eq('date', filters.date);
        }
        if (filters.dateFrom) {
            query = query.gte('date', filters.dateFrom);
        }
        if (filters.dateTo) {
            query = query.lte('date', filters.dateTo);
        }

        const { data, error } = await query;
        if (error) throw error;

        this.cache = data;
        this.lastFetch = Date.now();
        return data;
    }

    // Obtener reservas de hoy
    async getToday() {
        const today = new Date().toISOString().split('T')[0];
        return this.getAll({ date: today });
    }

    // Obtener reservas de la semana
    async getThisWeek() {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Lunes

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Domingo

        return this.getAll({
            dateFrom: startOfWeek.toISOString().split('T')[0],
            dateTo: endOfWeek.toISOString().split('T')[0]
        });
    }

    // Obtener reservas pendientes
    async getPending() {
        return this.getAll({ status: 'pending' });
    }

    // Actualizar estado de reserva
    async updateStatus(id, status, notes = null) {
        const client = this.getClient();
        if (!client) throw new Error('Database not connected');

        const updateData = {
            updated_at: new Date().toISOString()
        };

        if (status) {
            updateData.status = status;
        }

        if (notes !== null) {
            updateData.notes = notes;
        }

        const { data, error } = await client
            .from('reservations')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // Confirmar reserva
    async confirm(id) {
        return this.updateStatus(id, 'confirmed');
    }

    // Rechazar reserva
    async reject(id, reason = '') {
        return this.updateStatus(id, 'rejected', reason);
    }

    // Completar reserva
    async complete(id) {
        return this.updateStatus(id, 'completed');
    }

    // Cancelar reserva
    async cancel(id) {
        return this.updateStatus(id, 'cancelled');
    }

    // Añadir nota
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

    // Crear notificación
    async createNotification(referenceId, message) {
        const client = this.getClient();
        if (!client) return;

        try {
            await client
                .from('notifications')
                .insert({
                    type: 'reservation',
                    reference_id: referenceId,
                    message,
                    read: false,
                    created_at: new Date().toISOString()
                });
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    }

    // Estadísticas
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
