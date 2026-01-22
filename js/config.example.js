/**
 * Peluquería Cool - Configuration
 * 
 * IMPORTANTE: Las claves anon de Supabase son públicas por diseño.
 * La seguridad real está en las políticas RLS de Supabase.
 * 
 * Para producción, puedes configurar estas claves de varias formas:
 * 1. Variables de entorno en tu hosting (Netlify, Vercel, etc.)
 * 2. Reemplazar estos valores durante el build
 * 3. Cargar desde un endpoint seguro
 */

const CONFIG = {
    // Supabase - Estas claves anon son seguras de exponer
    // La seguridad depende de las Row Level Security (RLS) policies
    SUPABASE_URL: 'YOUR_SUPABASE_URL',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',

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

// No modificar debajo de esta línea
window.APP_CONFIG = CONFIG;

// Helper para obtener config
function getConfig(key) {
    return CONFIG[key];
}
