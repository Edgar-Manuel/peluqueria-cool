/**
 * Peluquería Cool - Schedule Configuration v2
 * Configuración de horarios disponibles para reservas
 * y catálogo completo de servicios con duraciones reales.
 */

const SCHEDULE_CONFIG = {

    // ──────────────────────────────────────────────
    // HORARIO SEMANAL
    // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    // null = cerrado ese día
    // ──────────────────────────────────────────────
    weeklySchedule: {
        0: null, // Domingo - Cerrado
        1: {     // Lunes - Solo tarde
            slots: ['16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45'],
            open: '16:00',
            close: '20:00'
        },
        2: {     // Martes - Mañana y tarde
            slots: ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30',
                    '16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45'],
            open: '10:00',
            close: '20:00'
        },
        3: {     // Miércoles - Mañana y tarde
            slots: ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30',
                    '16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45'],
            open: '10:00',
            close: '20:00'
        },
        4: {     // Jueves - Mañana y tarde
            slots: ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30',
                    '16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45', '19:00', '19:15', '19:30', '19:45'],
            open: '10:00',
            close: '20:00'
        },
        5: {     // Viernes - Mañana y tarde (cierra antes)
            slots: ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30',
                    '16:00', '16:15', '16:30', '16:45', '17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30'],
            open: '10:00',
            close: '19:30'
        },
        6: {     // Sábado - Solo mañana
            slots: ['09:00', '09:15', '09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00', '12:15', '12:30', '12:45', '13:00'],
            open: '09:00',
            close: '13:30'
        }
    },

    // ──────────────────────────────────────────────
    // SERVICIOS CON DURACIONES Y PRECIOS REALES
    // NOTA: Este objeto es el fallback si Supabase no está disponible.
    // La fuente de verdad es la tabla 'servicios' en Supabase.
    // ──────────────────────────────────────────────
    services: {
        // CORTES
        corte_hombre: {
            duration: 30,
            name: 'Corte Hombre',
            price: 18,
            color: '#10b981',
            category: 'corte',
            description: 'Corte de pelo masculino'
        },
        corte_mujer: {
            duration: 45,
            name: 'Corte Mujer',
            price: 28,
            color: '#10b981',
            category: 'corte',
            description: 'Corte femenino, incluye lavado'
        },
        corte_nino: {
            duration: 25,
            name: 'Corte Niño/a',
            price: 14,
            color: '#34d399',
            category: 'corte',
            description: 'Corte infantil hasta 12 años'
        },
        flequillo: {
            duration: 15,
            name: 'Arreglo Flequillo',
            price: 8,
            color: '#6ee7b7',
            category: 'corte',
            description: 'Solo retoque de flequillo'
        },

        // COLOR
        tinte_raiz: {
            duration: 60,
            name: 'Tinte Raíz',
            price: 45,
            color: '#f59e0b',
            category: 'color',
            description: 'Aplicación raíz + tiempo de reposo + aclarado'
        },
        tinte_completo: {
            duration: 90,
            name: 'Tinte Completo',
            price: 60,
            color: '#f59e0b',
            category: 'color',
            description: 'Tinte de toda la cabellera + aclarado'
        },
        mechas: {
            duration: 120,
            name: 'Mechas',
            price: 85,
            color: '#d97706',
            category: 'color',
            description: 'Mechas completas, incluye tiempo de reposo'
        },
        mechas_parciales: {
            duration: 90,
            name: 'Mechas Parciales',
            price: 65,
            color: '#d97706',
            category: 'color',
            description: 'Solo zona superior o corona'
        },
        decoloracion: {
            duration: 120,
            name: 'Decoloración',
            price: 80,
            color: '#fbbf24',
            category: 'color',
            description: 'Decoloración completa'
        },

        // STYLING
        peinado: {
            duration: 45,
            name: 'Peinado',
            price: 30,
            color: '#8b5cf6',
            category: 'styling',
            description: 'Peinado para evento o ocasión especial'
        },
        peinado_novia: {
            duration: 90,
            name: 'Peinado Novia',
            price: 80,
            color: '#a78bfa',
            category: 'styling',
            description: 'Peinado de novia o madrina'
        },

        // TRATAMIENTOS
        tratamiento: {
            duration: 60,
            name: 'Tratamiento Capilar',
            price: 40,
            color: '#06b6d4',
            category: 'tratamiento',
            description: 'Mascarilla nutritiva + masaje + aclarado'
        },
        keratina: {
            duration: 120,
            name: 'Keratina',
            price: 95,
            color: '#0891b2',
            category: 'tratamiento',
            description: 'Alisado con keratina'
        },

        // OTROS
        solarium: {
            duration: 20,
            name: 'Solárium',
            price: 15,
            color: '#f97316',
            category: 'otro',
            description: 'Sesión de solárium'
        },
        lavado_secado: {
            duration: 20,
            name: 'Lavado y Secado',
            price: 15,
            color: '#6b7280',
            category: 'otro',
            description: 'Lavado + secado sin corte'
        },

        // PACKS / COMBOS (con duraciones REALES, no suma directa)
        tinte_corte: {
            duration: 110,
            name: 'Tinte + Corte',
            price: 80,
            color: '#f59e0b',
            category: 'color',
            description: 'Mientras el tinte reposa se hace el corte',
            combo: true,
            includes: ['tinte_completo', 'corte_mujer']
        },
        mechas_corte: {
            duration: 150,
            name: 'Mechas + Corte',
            price: 105,
            color: '#d97706',
            category: 'color',
            description: 'Mechas + corte al retirar el tinte',
            combo: true,
            includes: ['mechas', 'corte_mujer']
        },
        mechas_corte_peinado: {
            duration: 180,
            name: 'Mechas + Corte + Peinado',
            price: 130,
            color: '#d97706',
            category: 'color',
            description: 'Servicio completo de color',
            combo: true,
            includes: ['mechas', 'corte_mujer', 'peinado']
        },

        // Legacy (compatibilidad con el formulario antiguo)
        corte: {
            duration: 45,
            name: 'Corte & Styling',
            price: 28,
            color: '#10b981',
            category: 'corte',
            description: 'Corte femenino',
            legacy: true
        },
        color: {
            duration: 120,
            name: 'Coloración',
            price: 75,
            color: '#f59e0b',
            category: 'color',
            description: 'Coloración completa',
            legacy: true
        },
        vip: {
            duration: 120,
            name: 'Experiencia VIP',
            price: 120,
            color: '#ec4899',
            category: 'otro',
            description: 'Combo personalizado',
            legacy: true
        }
    },

    // Servicios combinados con duraciones reales
    combos: {
        tinte_corte:          { includes: ['tinte_completo', 'corte_mujer'], duration: 110, price: 80  },
        mechas_corte:         { includes: ['mechas', 'corte_mujer'],         duration: 150, price: 105 },
        mechas_corte_peinado: { includes: ['mechas', 'corte_mujer', 'peinado'], duration: 180, price: 130 },
        tinte_peinado:        { includes: ['tinte_completo', 'peinado'],     duration: 120, price: 85  },
        corte_tratamiento:    { includes: ['corte_mujer', 'tratamiento'],    duration: 80,  price: 62  }
    },

    // ──────────────────────────────────────────────
    // FESTIVOS (YYYY-MM-DD)
    // ──────────────────────────────────────────────
    holidays: [
        '2026-01-01', // Año Nuevo
        '2026-01-06', // Reyes Magos
        '2026-04-02', // Jueves Santo
        '2026-04-03', // Viernes Santo
        '2026-05-01', // Día del Trabajador
        '2026-07-28', // Día de Cantabria
        '2026-08-15', // Asunción de la Virgen
        '2026-10-12', // Día de la Hispanidad
        '2026-11-01', // Todos los Santos
        '2026-12-08', // Inmaculada Concepción
        '2026-12-25', // Navidad
    ],

    // ──────────────────────────────────────────────
    // CONFIGURACIÓN GENERAL
    // ──────────────────────────────────────────────
    minAdvanceDays: 1,      // Mínimo 1 día de antelación
    maxAdvanceDays: 30,     // Máximo 30 días en adelante
    bufferMinutos: 10,      // Buffer entre citas
    slotInterval: 15,       // Granularidad de slots en minutos

    // Contacto
    whatsappNumber: '34942589703',
    salonEmail: 'hola@peluqueriacool.es',

    // ──────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────

    /** Obtiene el objeto de servicio por ID */
    getService(id) {
        return this.services[id] || null;
    },

    /** Obtiene la duración de un servicio en minutos */
    getServiceDuration(id) {
        return this.services[id]?.duration || 45;
    },

    /** Lista de servicios visibles en el formulario (no legacy) */
    getPublicServices() {
        return Object.entries(this.services)
            .filter(([, s]) => !s.legacy)
            .map(([id, s]) => ({ id, ...s }));
    },

    /** Servicios agrupados por categoría */
    getServicesByCategory() {
        const grouped = {};
        for (const [id, s] of Object.entries(this.services)) {
            if (s.legacy) continue;
            if (!grouped[s.category]) grouped[s.category] = [];
            grouped[s.category].push({ id, ...s });
        }
        return grouped;
    }
};

// Exportar para uso en Node.js (tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SCHEDULE_CONFIG;
}
