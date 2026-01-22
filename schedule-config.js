/**
 * Peluquería Cool - Schedule Configuration
 * Configuración de horarios disponibles para reservas
 */

const SCHEDULE_CONFIG = {
    // Horarios por día de la semana (0 = Domingo, 1 = Lunes, ...)
    weeklySchedule: {
        0: null, // Domingo - Cerrado
        1: { // Lunes
            slots: ['16:00', '17:00', '18:00', '19:00'],
            open: '16:00',
            close: '20:00'
        },
        2: { // Martes
            slots: ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'],
            open: '10:00',
            close: '20:00'
        },
        3: { // Miércoles
            slots: ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'],
            open: '10:00',
            close: '20:00'
        },
        4: { // Jueves
            slots: ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00', '19:00'],
            open: '10:00',
            close: '20:00'
        },
        5: { // Viernes
            slots: ['10:00', '11:00', '12:00', '16:00', '17:00', '18:00'],
            open: '10:00',
            close: '19:30'
        },
        6: { // Sábado
            slots: ['09:00', '10:00', '11:00', '12:00', '13:00'],
            open: '09:00',
            close: '13:30'
        }
    },

    // Días festivos (formato YYYY-MM-DD)
    holidays: [
        '2026-01-01', // Año Nuevo
        '2026-01-06', // Reyes
        '2026-05-01', // Día del Trabajador
        '2026-12-25', // Navidad
    ],

    // Configuración de servicios y duraciones (minutos)
    services: {
        corte: { duration: 45, name: 'Corte & Styling' },
        color: { duration: 120, name: 'Coloración' },
        tratamiento: { duration: 60, name: 'Tratamiento' },
        vip: { duration: 180, name: 'Experiencia VIP' }
    },

    // Días mínimos para reservar con antelación
    minAdvanceDays: 1,
    // Días máximos para reservar
    maxAdvanceDays: 30,

    // WhatsApp para confirmaciones
    whatsappNumber: '34942589703',
    
    // Email del salón
    salonEmail: 'hola@peluqueriacool.es'
};

// Exportar para uso en script.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SCHEDULE_CONFIG;
}
