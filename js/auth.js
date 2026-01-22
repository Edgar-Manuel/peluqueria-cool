/**
 * Peluquería Cool - Authentication Manager
 * Sistema de login para administradores
 * 
 * Las credenciales de Supabase se cargan desde js/config.js
 */

class AuthManager {
    constructor() {
        this.user = null;
        this.isAdmin = false;
        this.loginAttempts = 0;
        this.maxAttempts = (window.APP_CONFIG && window.APP_CONFIG.MAX_LOGIN_ATTEMPTS) || 5;
        this.lockoutMinutes = (window.APP_CONFIG && window.APP_CONFIG.LOCKOUT_MINUTES) || 15;
        this.lockoutUntil = null;
    }

    getClient() {
        // Obtener el cliente de Supabase inicializado
        return window.supabaseInstance || null;
    }

    async init() {
        const client = this.getClient();
        if (!client) {
            console.error('Supabase client not available');
            return false;
        }

        try {
            const { data: { session } } = await client.auth.getSession();
            if (session) {
                this.user = session.user;
                await this.checkAdminRole();
                return true;
            }
        } catch (error) {
            console.error('Auth init error:', error);
        }
        return false;
    }

    isLockedOut() {
        if (!this.lockoutUntil) return false;
        if (Date.now() > this.lockoutUntil) {
            this.lockoutUntil = null;
            this.loginAttempts = 0;
            return false;
        }
        return true;
    }

    getRemainingLockoutTime() {
        if (!this.lockoutUntil) return 0;
        return Math.ceil((this.lockoutUntil - Date.now()) / 1000 / 60);
    }

    async login(email, password) {
        if (this.isLockedOut()) {
            const minutes = this.getRemainingLockoutTime();
            throw new Error(`Demasiados intentos. Espera ${minutes} minutos.`);
        }

        const client = this.getClient();
        if (!client) {
            throw new Error('Error de conexión. Recarga la página.');
        }

        try {
            const { data, error } = await client.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) {
                this.loginAttempts++;
                if (this.loginAttempts >= this.maxAttempts) {
                    this.lockoutUntil = Date.now() + (this.lockoutMinutes * 60 * 1000);
                    throw new Error(`Demasiados intentos fallidos. Cuenta bloqueada ${this.lockoutMinutes} minutos.`);
                }
                throw new Error('Email o contraseña incorrectos');
            }

            this.user = data.user;
            this.loginAttempts = 0;

            // Verificar si es admin
            const isAdmin = await this.checkAdminRole();
            if (!isAdmin) {
                await this.logout();
                throw new Error('No tienes permisos de administrador');
            }

            return data;
        } catch (error) {
            throw error;
        }
    }

    async checkAdminRole() {
        if (!this.user) return false;

        const client = this.getClient();
        if (!client) return false;

        try {
            const { data, error } = await client
                .from('admins')
                .select('*')
                .eq('email', this.user.email)
                .single();

            if (data && !error) {
                this.isAdmin = true;
                return true;
            }
        } catch (error) {
            console.log('Admin check:', error.message);
        }

        this.isAdmin = false;
        return false;
    }

    async logout() {
        const client = this.getClient();
        if (client) {
            try {
                await client.auth.signOut();
            } catch (error) {
                console.error('Logout error:', error);
            }
        }
        this.user = null;
        this.isAdmin = false;
        window.location.href = 'index.html';
    }

    isAuthenticated() {
        return this.user !== null && this.isAdmin;
    }

    getUser() {
        return this.user;
    }
}

// Instancia global
const auth = new AuthManager();
window.auth = auth;
