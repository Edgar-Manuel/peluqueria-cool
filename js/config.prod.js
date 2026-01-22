/**
 * Peluquería Cool - Production Configuration
 * 
 * NOTA DE SEGURIDAD:
 * Las claves anon de Supabase son PÚBLICAS por diseño.
 * La seguridad real está en las políticas RLS (Row Level Security)
 * configuradas en la consola de Supabase.
 * 
 * Nunca expongas SERVICE_ROLE_KEY - esa es la clave privada.
 */

const CONFIG = {
    // Supabase - Claves públicas (anon key)
    // La seguridad depende de Row Level Security (RLS) policies
    SUPABASE_URL: 'https://pklskdibblefgcodcfhi.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrbHNrZGliYmxlZmdjb2RjZmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyOTYzMTcsImV4cCI6MjA4Mzg3MjMxN30.if8sIZpvzHSZIqekARAb5CvcoTl--AlUC08Z1eJp-UQ',

    // App settings
    APP_NAME: 'Peluquería Cool',
    APP_URL: 'https://peluqueriacool.es',

    // Feature flags
    ENABLE_REALTIME: true,
    ENABLE_NOTIFICATIONS: true,

    // UI settings
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_MINUTES: 15
};

// Exponer globalmente
window.APP_CONFIG = CONFIG;

// Helper para obtener config
function getConfig(key) {
    return CONFIG[key];
}
