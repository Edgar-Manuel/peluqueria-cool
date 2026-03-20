/**
 * Peluquería Cool - Smart Scheduler
 * Lógica de slots inteligentes: calcula disponibilidad REAL
 * considerando duraciones de servicios, buffers y optimización de huecos.
 *
 * Uso:
 *   const scheduler = new SmartScheduler();
 *   const slots = await scheduler.getAvailableSlots('2026-03-25', 'corte_hombre');
 */

class SmartScheduler {
    constructor() {
        this.TIMEZONE = 'Europe/Madrid';
        this.SLOT_INTERVAL = 15; // minutos entre slots candidatos
        this.bufferMinutos = 10; // buffer entre citas (configurable desde admin)
        this._configLoaded = false;
        this._servicios = null;
        this._serviciosCombinados = null;
    }

    // ─────────────────────────────────────────────
    // CARGA DE DATOS DESDE SUPABASE
    // ─────────────────────────────────────────────

    async loadConfig() {
        if (this._configLoaded) return;
        const client = window.supabaseInstance;
        if (!client) return;

        // Cargar buffer desde salon_config
        const { data: bufferCfg } = await client
            .from('salon_config')
            .select('value')
            .eq('key', 'buffer_minutos')
            .single();
        if (bufferCfg) this.bufferMinutos = parseInt(bufferCfg.value) || 10;

        // Cargar servicios
        const { data: servicios } = await client
            .from('servicios')
            .select('*')
            .eq('activo', true);
        this._servicios = {};
        (servicios || []).forEach(s => { this._servicios[s.id] = s; });

        // Cargar servicios combinados
        const { data: combos } = await client
            .from('servicios_combinados')
            .select('*')
            .eq('activo', true);
        this._serviciosCombinados = {};
        (combos || []).forEach(c => { this._serviciosCombinados[c.id] = c; });

        this._configLoaded = true;
    }

    // ─────────────────────────────────────────────
    // OBTENER DURACIÓN DE UN SERVICIO
    // ─────────────────────────────────────────────

    getServiceDuration(servicioId) {
        // Buscar en servicios combinados primero
        if (this._serviciosCombinados && this._serviciosCombinados[servicioId]) {
            return this._serviciosCombinados[servicioId].duracion_real_minutos;
        }
        // Luego en servicios simples
        if (this._servicios && this._servicios[servicioId]) {
            return this._servicios[servicioId].duracion_minutos;
        }
        // Fallback a schedule-config.js
        if (typeof SCHEDULE_CONFIG !== 'undefined') {
            const legacy = SCHEDULE_CONFIG.services[servicioId];
            if (legacy) return legacy.duration;
        }
        return 45; // default
    }

    // Calcular duración de múltiples servicios con solapamientos parciales
    calcularDuracionCombinada(servicioIds) {
        if (!servicioIds || servicioIds.length === 0) return 0;
        if (servicioIds.length === 1) return this.getServiceDuration(servicioIds[0]);

        // Buscar si existe un combo predefinido con exactamente estos servicios
        if (this._serviciosCombinados) {
            const sorted = [...servicioIds].sort().join(',');
            const combo = Object.values(this._serviciosCombinados).find(c => {
                return [...c.servicios_ids].sort().join(',') === sorted;
            });
            if (combo) return combo.duracion_real_minutos;
        }

        // Si no hay combo, aplicar regla de solapamiento del 30%:
        // El tiempo de espera de tintes/tratamientos se puede solapar con otros servicios
        const duraciones = servicioIds.map(id => this.getServiceDuration(id));
        const total = duraciones.reduce((a, b) => a + b, 0);
        const max = Math.max(...duraciones);

        // Heurística: la duración combinada es entre el max y la suma total,
        // con 70% de solapamiento en servicios secundarios
        const secundarios = total - max;
        return Math.round(max + secundarios * 0.7);
    }

    // ─────────────────────────────────────────────
    // CONVERSIÓN DE TIEMPO
    // ─────────────────────────────────────────────

    /** "HH:MM" → minutos desde medianoche */
    timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    /** Minutos desde medianoche → "HH:MM" */
    minutesToTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    /** Fecha en la timezone de Madrid */
    getMadridDate(date = new Date()) {
        const str = date.toLocaleDateString('es-ES', {
            timeZone: this.TIMEZONE,
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        // str = "DD/MM/YYYY" → "YYYY-MM-DD"
        const [d, mo, y] = str.split('/');
        return `${y}-${mo}-${d}`;
    }

    // ─────────────────────────────────────────────
    // HORARIO DEL DÍA
    // ─────────────────────────────────────────────

    getDaySchedule(dateStr) {
        const date = new Date(dateStr + 'T12:00:00'); // mediodía para evitar problemas DST
        const dow = date.getDay(); // 0=domingo

        if (typeof SCHEDULE_CONFIG === 'undefined') return null;
        const daySched = SCHEDULE_CONFIG.weeklySchedule[dow];
        if (!daySched) return null; // cerrado

        return {
            open: this.timeToMinutes(daySched.open),
            close: this.timeToMinutes(daySched.close),
            openStr: daySched.open,
            closeStr: daySched.close
        };
    }

    // ─────────────────────────────────────────────
    // VERIFICAR SI EL DÍA ESTÁ CERRADO
    // ─────────────────────────────────────────────

    async isDayClosed(dateStr) {
        // 1. Verificar en schedule-config
        if (typeof SCHEDULE_CONFIG !== 'undefined') {
            if (SCHEDULE_CONFIG.holidays.includes(dateStr)) return true;
        }

        // 2. Verificar horario semanal
        const sched = this.getDaySchedule(dateStr);
        if (!sched) return true;

        // 3. Verificar tabla dias_cerrados en Supabase
        const client = window.supabaseInstance;
        if (client) {
            const { data } = await client
                .from('dias_cerrados')
                .select('id')
                .eq('fecha', dateStr)
                .limit(1);
            if (data && data.length > 0) return true;
        }

        return false;
    }

    // ─────────────────────────────────────────────
    // OBTENER CITAS EXISTENTES DEL DÍA
    // ─────────────────────────────────────────────

    async getAppointmentsForDay(dateStr) {
        const client = window.supabaseInstance;
        if (!client) return [];

        const { data, error } = await client
            .from('reservations')
            .select('id, time, hora_fin, duration_minutes, service_name, customer_name, status, color_calendario:servicio_id(color_calendario)')
            .eq('date', dateStr)
            .not('status', 'in', '("cancelled","rejected")')
            .order('time', { ascending: true });

        if (error) {
            console.error('SmartScheduler: error cargando citas', error);
            return [];
        }

        return (data || []).map(r => ({
            id: r.id,
            inicio: this.timeToMinutes(r.time),
            fin: r.hora_fin
                ? this.timeToMinutes(r.hora_fin)
                : this.timeToMinutes(r.time) + (r.duration_minutes || 45),
            inicioStr: r.time,
            finStr: r.hora_fin || this.minutesToTime(this.timeToMinutes(r.time) + (r.duration_minutes || 45)),
            servicioNombre: r.service_name,
            clienteNombre: r.customer_name,
            status: r.status,
            colorCalendario: r.color_calendario?.color_calendario || '#3b82f6'
        }));
    }

    // ─────────────────────────────────────────────
    // CALCULAR INTERVALOS LIBRES DEL DÍA
    // ─────────────────────────────────────────────

    /**
     * Dado el horario del día y las citas existentes,
     * devuelve los intervalos libres en minutos.
     * Aplica el buffer después de cada cita.
     *
     * @returns Array<{inicio: number, fin: number}> en minutos
     */
    calcularIntervalosLibres(daySched, appointments) {
        const { open, close } = daySched;

        // Ordenar citas por inicio
        const sorted = [...appointments].sort((a, b) => a.inicio - b.inicio);

        // Calcular bloques ocupados (cita + buffer)
        const bloques = sorted.map(a => ({
            inicio: a.inicio,
            fin: a.fin + this.bufferMinutos
        }));

        // Fusionar bloques solapados
        const merged = [];
        for (const bloque of bloques) {
            if (merged.length === 0 || bloque.inicio > merged[merged.length - 1].fin) {
                merged.push({ ...bloque });
            } else {
                merged[merged.length - 1].fin = Math.max(merged[merged.length - 1].fin, bloque.fin);
            }
        }

        // Encontrar intervalos libres entre bloques
        const libres = [];
        let cursor = open;
        for (const bloque of merged) {
            if (bloque.inicio > cursor) {
                libres.push({ inicio: cursor, fin: bloque.inicio });
            }
            cursor = Math.max(cursor, bloque.fin);
        }
        // Hueco al final del día
        if (cursor < close) {
            libres.push({ inicio: cursor, fin: close });
        }

        return libres;
    }

    // ─────────────────────────────────────────────
    // CALCULAR SLOTS DISPONIBLES (FUNCIÓN PRINCIPAL)
    // ─────────────────────────────────────────────

    /**
     * Devuelve los slots disponibles para un servicio en una fecha.
     *
     * @param {string} dateStr - "YYYY-MM-DD"
     * @param {string|string[]} servicioId - ID del servicio (o array para múltiples)
     * @returns {Promise<{disponible: boolean, slots_recomendados: Array, slots_todos: Array}>}
     */
    async getAvailableSlots(dateStr, servicioId) {
        await this.loadConfig();

        const result = {
            disponible: false,
            fecha: dateStr,
            dia_cerrado: false,
            slots_recomendados: [],
            slots_todos: []
        };

        // 1. Verificar si el día está cerrado
        if (await this.isDayClosed(dateStr)) {
            result.dia_cerrado = true;
            return result;
        }

        // 2. Obtener horario del día
        const daySched = this.getDaySchedule(dateStr);
        if (!daySched) {
            result.dia_cerrado = true;
            return result;
        }

        // 3. Calcular duración del servicio solicitado
        const servicioIds = Array.isArray(servicioId) ? servicioId : [servicioId];
        const duracion = this.calcularDuracionCombinada(servicioIds);

        // 4. Obtener citas existentes
        const appointments = await this.getAppointmentsForDay(dateStr);

        // 5. Calcular intervalos libres
        const libres = this.calcularIntervalosLibres(daySched, appointments);

        // 6. Para cada intervalo libre, calcular slots válidos
        const now = new Date();
        const todayStr = this.getMadridDate(now);
        const nowMinutes = this.timeToMinutes(
            now.toLocaleTimeString('es-ES', { timeZone: this.TIMEZONE, hour: '2-digit', minute: '2-digit' })
        );

        const allSlots = [];

        for (const intervalo of libres) {
            const huecoDuracion = intervalo.fin - intervalo.inicio;

            // El servicio no cabe en este hueco
            if (huecoDuracion < duracion) continue;

            // Calcular slots candidatos (cada SLOT_INTERVAL minutos)
            let start = intervalo.inicio;
            // Redondear al siguiente múltiplo de SLOT_INTERVAL
            if (start % this.SLOT_INTERVAL !== 0) {
                start = Math.ceil(start / this.SLOT_INTERVAL) * this.SLOT_INTERVAL;
            }

            while (start + duracion <= intervalo.fin) {
                const horaStr = this.minutesToTime(start);
                const horaFinStr = this.minutesToTime(start + duracion);

                // Si es hoy, no mostrar slots ya pasados (+ 15 min de margen)
                if (dateStr === todayStr && start < nowMinutes + 15) {
                    start += this.SLOT_INTERVAL;
                    continue;
                }

                // Clasificar el slot
                const tipoYMotivo = this.clasificarSlot(start, duracion, intervalo, libres, appointments);

                allSlots.push({
                    hora: horaStr,
                    hora_fin: horaFinStr,
                    tipo: tipoYMotivo.tipo,
                    motivo: tipoYMotivo.motivo,
                    hueco_restante: intervalo.fin - (start + duracion)
                });

                start += this.SLOT_INTERVAL;
            }
        }

        // 7. Ordenar: primero optimizados, luego por hora
        const recomendados = allSlots
            .filter(s => s.tipo === 'optimizado')
            .sort((a, b) => a.hora.localeCompare(b.hora));

        const normales = allSlots
            .filter(s => s.tipo === 'normal')
            .sort((a, b) => a.hora.localeCompare(b.hora));

        result.disponible = allSlots.length > 0;
        result.slots_recomendados = recomendados.slice(0, 5); // máx 5 recomendados
        result.slots_todos = allSlots.sort((a, b) => a.hora.localeCompare(b.hora));

        return result;
    }

    // ─────────────────────────────────────────────
    // CLASIFICAR SLOT: optimizado vs normal
    // ─────────────────────────────────────────────

    /**
     * Un slot es "optimizado" si:
     * - Llena exactamente (o casi) un hueco entre dos citas
     * - Aprovecha un hueco final del día antes de cerrar
     * - Deja un hueco restante >= 30 min (suficiente para otra cita)
     * - NO crea un hueco muerto pequeño (<20 min) que no sirve para nada
     */
    clasificarSlot(start, duracion, intervalo, todosLibres, appointments) {
        const fin = start + duracion;
        const huecoRestante = intervalo.fin - fin;
        const huecoAntes = start - intervalo.inicio;

        // ¿El hueco restante es suficiente para algo útil? (30 min = corte hombre)
        const huecoUtilizable = huecoRestante === 0 || huecoRestante >= 30;

        // ¿Hay citas inmediatamente después de este intervalo?
        const hayCitaDespues = appointments.some(a =>
            a.inicio >= intervalo.fin && a.inicio <= intervalo.fin + 30
        );

        // ¿Es el último hueco del día?
        const esUltimoHueco = todosLibres.indexOf(intervalo) === todosLibres.length - 1;

        // Slot optimizado: llena bien el hueco y no crea desperdicio
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

        return { tipo: 'normal', motivo: null };
    }

    // ─────────────────────────────────────────────
    // VERIFICAR DISPONIBILIDAD PARA UNA HORA CONCRETA
    // ─────────────────────────────────────────────

    /**
     * ¿Se puede reservar este servicio en esta hora y fecha exacta?
     * (Tiene en cuenta duración, no solo conflicto de hora exacta)
     */
    async checkSlotAvailable(dateStr, timeStr, servicioId) {
        await this.loadConfig();

        if (await this.isDayClosed(dateStr)) return false;

        const daySched = this.getDaySchedule(dateStr);
        if (!daySched) return false;

        const duracion = this.getServiceDuration(servicioId);
        const inicio = this.timeToMinutes(timeStr);
        const fin = inicio + duracion;

        // Verificar que cabe en el horario
        if (fin > daySched.close) return false;

        // Obtener citas existentes
        const appointments = await this.getAppointmentsForDay(dateStr);

        // Verificar solapamiento con cualquier cita (incluyendo buffer)
        for (const cita of appointments) {
            const citaInicio = cita.inicio;
            const citaFin = cita.fin + this.bufferMinutos;

            if (inicio < citaFin && fin + this.bufferMinutos > citaInicio) {
                return false; // hay solapamiento
            }
        }

        return true;
    }

    // ─────────────────────────────────────────────
    // CALCULAR HORA FIN DE UNA CITA
    // ─────────────────────────────────────────────

    calcularHoraFin(timeStr, duracionMinutos) {
        return this.minutesToTime(this.timeToMinutes(timeStr) + duracionMinutos);
    }

    // ─────────────────────────────────────────────
    // GENERAR MENSAJE DE CONFIRMACIÓN
    // ─────────────────────────────────────────────

    generarMensajeConfirmacion(reserva) {
        const { nombre, fecha, hora, hora_fin, servicioNombre, duracion } = reserva;
        const fechaObj = new Date(fecha + 'T12:00:00');
        const fechaFormato = fechaObj.toLocaleDateString('es-ES', {
            weekday: 'long', day: 'numeric', month: 'long'
        });

        const durH = Math.floor(duracion / 60);
        const durM = duracion % 60;
        const durStr = durH > 0
            ? `${durH}h${durM > 0 ? ` ${durM}min` : ''}`
            : `${durM} minutos`;

        return `¡Cita confirmada!\n${servicioNombre}\n${fechaFormato} a las ${hora}\nDuración aprox. ${durStr} (hasta las ${hora_fin})\n¡Te esperamos en Peluquería Cool! ✨`;
    }

    // ─────────────────────────────────────────────
    // DETECTAR HUECOS OPTIMIZABLES (para alertas admin)
    // ─────────────────────────────────────────────

    /**
     * Busca huecos en la agenda del día que se podrían llenar.
     * Útil para que el admin envíe promos a clientes habituales.
     */
    async getOptimizableGaps(dateStr) {
        await this.loadConfig();

        if (await this.isDayClosed(dateStr)) return [];

        const daySched = this.getDaySchedule(dateStr);
        if (!daySched) return [];

        const appointments = await this.getAppointmentsForDay(dateStr);
        const libres = this.calcularIntervalosLibres(daySched, appointments);

        return libres
            .filter(hueco => {
                const duracion = hueco.fin - hueco.inicio;
                return duracion >= 15 && duracion <= 60; // huecos pequeños pero aprovechables
            })
            .map(hueco => ({
                inicio: this.minutesToTime(hueco.inicio),
                fin: this.minutesToTime(hueco.fin),
                duracion: hueco.fin - hueco.inicio,
                servicios_que_caben: this.getServiciosParaHueco(hueco.fin - hueco.inicio)
            }));
    }

    /** Qué servicios caben en un hueco de X minutos */
    getServiciosParaHueco(minutosDisponibles) {
        if (!this._servicios) return [];
        return Object.values(this._servicios)
            .filter(s => s.duracion_minutos <= minutosDisponibles)
            .sort((a, b) => b.duracion_minutos - a.duracion_minutos)
            .map(s => ({ id: s.id, nombre: s.nombre, duracion: s.duracion_minutos }));
    }
}

// Instancia global
const smartScheduler = new SmartScheduler();
window.smartScheduler = smartScheduler;
