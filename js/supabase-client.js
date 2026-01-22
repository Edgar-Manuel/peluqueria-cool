/**
 * Peluquería Cool - Supabase Client
 * Conexión a la base de datos y autenticación
 * 
 * Las credenciales se cargan desde js/config.js
 */

// Variable global para el cliente
var supabase = null;

// Función para obtener el cliente (con re-inicialización si es necesario)
function getSupabase() {
    if (!supabase && window.supabaseInstance) {
        supabase = window.supabaseInstance;
    }
    return supabase || window.supabaseInstance;
}

// Función para verificar conexión
async function testSupabaseConnection() {
    const client = getSupabase();
    if (!client) {
        return { connected: false, error: 'Client not initialized' };
    }

    try {
        const { data, error } = await client.from('reservations').select('count', { count: 'exact', head: true });
        if (error) {
            if (error.code === '42P01') {
                console.log('⚠️ Tabla reservations no existe aún.');
                return { connected: true, tableExists: false };
            }
            throw error;
        }
        console.log('✅ Supabase connected and table exists');
        return { connected: true, tableExists: true };
    } catch (error) {
        console.error('❌ Supabase connection error:', error.message);
        return { connected: false, tableExists: false, error: error.message };
    }
}

// Exportar para uso global
window.supabaseClient = {
    init: function () {
        supabase = getSupabase();
        return supabase !== null;
    },
    test: testSupabaseConnection,
    getClient: getSupabase
};
