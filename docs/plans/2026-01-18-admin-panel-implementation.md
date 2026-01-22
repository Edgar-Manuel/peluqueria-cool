# Panel de Administración - Plan de Implementación

> **Para Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implementar un panel de administración completo para gestionar reservas, pedidos y productos con autenticación segura y notificaciones automáticas.

**Architecture:** Frontend Vanilla JS conectado a Supabase para auth + base de datos. Sistema modular con archivos JS separados por funcionalidad. Estilos propios en admin.css.

**Tech Stack:** HTML5, CSS3 (Custom Properties), JavaScript ES6+, Supabase JS Client, Stripe JS

---

## Fase 1: Fundamentos (Supabase + Auth)

### Task 1: Configurar Supabase Client

**Files:**
- Create: `js/supabase-client.js`
- Modify: `index.html` (añadir script)

**Step 1: Crear cliente de Supabase**

```javascript
// js/supabase-client.js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Verificar conexión
async function testConnection() {
    const { data, error } = await supabase.from('reservations').select('count');
    if (error) console.error('Supabase connection error:', error);
    else console.log('✅ Supabase connected');
}
```

**Step 2: Añadir Supabase SDK al HTML**

En `index.html` antes de `script.js`:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/supabase-client.js"></script>
```

**Step 3: Commit**
```bash
git add js/supabase-client.js index.html
git commit -m "feat: add Supabase client setup"
```

---

### Task 2: Sistema de Login

**Files:**
- Create: `js/auth.js`
- Modify: `index.html` (añadir modal de login)
- Modify: `styles.css` (estilos del modal login)

**Step 1: Crear módulo de autenticación**

```javascript
// js/auth.js
class AuthManager {
    constructor() {
        this.user = null;
        this.init();
    }

    async init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.user = session.user;
            this.checkAdminRole();
        }
    }

    async login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        this.user = data.user;
        return data;
    }

    async logout() {
        await supabase.auth.signOut();
        this.user = null;
        window.location.href = 'index.html';
    }

    async checkAdminRole() {
        const { data, error } = await supabase
            .from('admins')
            .select('*')
            .eq('email', this.user.email)
            .single();
        
        if (data) {
            window.location.href = 'admin.html';
        }
    }

    isAuthenticated() {
        return this.user !== null;
    }
}

const auth = new AuthManager();
```

**Step 2: Añadir modal de login al HTML**

Antes del cierre de `</body>`:
```html
<!-- Modal de Login Admin -->
<div id="loginModal" class="login-modal" hidden>
    <div class="login-backdrop"></div>
    <div class="login-container">
        <button class="login-close">&times;</button>
        <h2 class="login-title">Acceso Admin</h2>
        <form id="loginForm" class="login-form">
            <div class="login-field">
                <label for="loginEmail">Email</label>
                <input type="email" id="loginEmail" required>
            </div>
            <div class="login-field">
                <label for="loginPassword">Contraseña</label>
                <input type="password" id="loginPassword" required>
            </div>
            <div id="loginError" class="login-error" hidden></div>
            <button type="submit" class="login-submit">Entrar</button>
        </form>
    </div>
</div>
```

**Step 3: Commit**
```bash
git add js/auth.js index.html styles.css
git commit -m "feat: add admin login system"
```

---

### Task 3: Trigger de Login Oculto

**Files:**
- Modify: `script.js` (añadir triple-click handler)

**Step 1: Añadir detector de triple-click**

```javascript
// Triple-click en logo del footer para abrir login admin
const footerLogo = document.querySelector('.footer-logo');
let clickCount = 0;
let clickTimer;

if (footerLogo) {
    footerLogo.addEventListener('click', () => {
        clickCount++;
        
        if (clickCount === 1) {
            clickTimer = setTimeout(() => { clickCount = 0; }, 500);
        }
        
        if (clickCount === 3) {
            clearTimeout(clickTimer);
            clickCount = 0;
            document.getElementById('loginModal').hidden = false;
        }
    });
}
```

**Step 2: Commit**
```bash
git add script.js
git commit -m "feat: add hidden admin login trigger"
```

---

## Fase 2: Panel de Administración

### Task 4: Estructura del Panel Admin

**Files:**
- Create: `admin.html`
- Create: `admin.css`

**Step 1: Crear estructura HTML del panel**

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin | Peluquería Cool</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="admin.css">
</head>
<body>
    <!-- Verificación de sesión -->
    <div id="authCheck" class="auth-loading">
        <p>Verificando acceso...</p>
    </div>

    <!-- Panel Principal -->
    <div id="adminPanel" class="admin-panel" hidden>
        <!-- Sidebar -->
        <aside class="admin-sidebar">
            <div class="sidebar-logo">COOL<span>Admin</span></div>
            <nav class="sidebar-nav">
                <a href="#dashboard" class="nav-item active" data-section="dashboard">
                    <span class="nav-icon">📊</span> Dashboard
                </a>
                <a href="#reservations" class="nav-item" data-section="reservations">
                    <span class="nav-icon">📅</span> Reservas
                </a>
                <a href="#orders" class="nav-item" data-section="orders">
                    <span class="nav-icon">📦</span> Pedidos
                </a>
                <a href="#products" class="nav-item" data-section="products">
                    <span class="nav-icon">🛍️</span> Productos
                </a>
                <a href="#settings" class="nav-item" data-section="settings">
                    <span class="nav-icon">⚙️</span> Configuración
                </a>
            </nav>
            <button id="logoutBtn" class="sidebar-logout">Cerrar Sesión</button>
        </aside>

        <!-- Main Content -->
        <main class="admin-main">
            <!-- Header -->
            <header class="admin-header">
                <h1 id="pageTitle">Dashboard</h1>
                <div class="header-actions">
                    <button class="notification-btn" id="notificationBtn">
                        🔔 <span class="notification-badge" hidden>0</span>
                    </button>
                    <span class="admin-name" id="adminName">Admin</span>
                </div>
            </header>

            <!-- Content Sections -->
            <section id="dashboardSection" class="content-section active">
                <!-- Metrics -->
                <div class="metrics-grid">
                    <div class="metric-card">
                        <span class="metric-icon">📅</span>
                        <div class="metric-data">
                            <span class="metric-value" id="todayCount">0</span>
                            <span class="metric-label">Citas Hoy</span>
                        </div>
                    </div>
                    <div class="metric-card accent">
                        <span class="metric-icon">⏳</span>
                        <div class="metric-data">
                            <span class="metric-value" id="pendingCount">0</span>
                            <span class="metric-label">Pendientes</span>
                        </div>
                    </div>
                    <div class="metric-card">
                        <span class="metric-icon">📆</span>
                        <div class="metric-data">
                            <span class="metric-value" id="weekCount">0</span>
                            <span class="metric-label">Esta Semana</span>
                        </div>
                    </div>
                    <div class="metric-card success">
                        <span class="metric-icon">💰</span>
                        <div class="metric-data">
                            <span class="metric-value" id="monthRevenue">0€</span>
                            <span class="metric-label">Ingresos Mes</span>
                        </div>
                    </div>
                </div>

                <!-- Calendar + Today List -->
                <div class="dashboard-grid">
                    <div class="calendar-container">
                        <div class="calendar-header">
                            <button id="prevWeek" class="calendar-nav">&lt;</button>
                            <h3 id="calendarTitle">Semana del 18 Enero</h3>
                            <button id="nextWeek" class="calendar-nav">&gt;</button>
                        </div>
                        <div class="calendar-grid" id="calendarGrid">
                            <!-- Se genera dinámicamente -->
                        </div>
                    </div>
                    <div class="today-list">
                        <h3>Citas de Hoy</h3>
                        <div id="todayAppointments">
                            <!-- Se genera dinámicamente -->
                        </div>
                    </div>
                </div>
            </section>

            <section id="reservationsSection" class="content-section">
                <!-- Tabla de reservas -->
            </section>

            <section id="ordersSection" class="content-section">
                <!-- Tabla de pedidos -->
            </section>

            <section id="productsSection" class="content-section">
                <!-- CRUD de productos -->
            </section>

            <section id="settingsSection" class="content-section">
                <!-- Configuración -->
            </section>
        </main>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="js/supabase-client.js"></script>
    <script src="js/auth.js"></script>
    <script src="admin.js"></script>
</body>
</html>
```

**Step 2: Commit**
```bash
git add admin.html
git commit -m "feat: add admin panel HTML structure"
```

---

### Task 5: Estilos del Panel Admin

**Files:**
- Create: `admin.css`

**Step 1: Crear estilos completos**

(Archivo CSS completo con variables, sidebar, grid, cards, calendar, tables)

**Step 2: Commit**
```bash
git add admin.css
git commit -m "feat: add admin panel styles"
```

---

### Task 6: Lógica del Dashboard

**Files:**
- Create: `admin.js`
- Create: `js/reservations.js`

**Step 1: Crear controlador principal**

```javascript
// admin.js
class AdminPanel {
    constructor() {
        this.currentSection = 'dashboard';
        this.init();
    }

    async init() {
        // Verificar autenticación
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('authCheck').hidden = true;
        document.getElementById('adminPanel').hidden = false;

        this.setupNavigation();
        this.loadDashboard();
    }

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSection(item.dataset.section);
            });
        });

        document.getElementById('logoutBtn').addEventListener('click', () => {
            auth.logout();
        });
    }

    switchSection(section) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`${section}Section`).classList.add('active');

        document.getElementById('pageTitle').textContent = 
            section.charAt(0).toUpperCase() + section.slice(1);

        this.currentSection = section;
    }

    async loadDashboard() {
        await this.loadMetrics();
        await this.loadCalendar();
        await this.loadTodayAppointments();
    }

    async loadMetrics() {
        // Cargar contadores desde Supabase
    }

    async loadCalendar() {
        // Generar calendario semanal
    }

    async loadTodayAppointments() {
        // Cargar citas del día
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    new AdminPanel();
});
```

**Step 2: Commit**
```bash
git add admin.js js/reservations.js
git commit -m "feat: add admin panel logic"
```

---

## Fase 3: CRUD de Reservas

### Task 7: Guardar Reservas en Supabase

**Files:**
- Modify: `script.js` (enviar a Supabase en lugar de solo mostrar modal)
- Create: `js/reservations.js`

**Step 1: Modificar envío de formulario**

En la lógica del modal, después de validar:
```javascript
// Guardar en Supabase
const { data, error } = await supabase
    .from('reservations')
    .insert({
        customer_name: formData.nombre,
        customer_phone: formData.telefono,
        service: formData.servicio,
        date: formData.fecha,
        time: formData.hora,
        status: 'pending'
    });

if (error) throw error;
```

**Step 2: Commit**
```bash
git add script.js js/reservations.js
git commit -m "feat: save reservations to Supabase"
```

---

### Task 8: Vista de Reservas en Admin

**Files:**
- Modify: `admin.js` (añadir carga de reservas)
- Modify: `admin.html` (tabla de reservas)

**Step 1: Implementar tabla con acciones**

Tabla con columnas: Fecha, Cliente, Servicio, Estado, Acciones
Acciones: Aceptar, Rechazar, Ver detalles

**Step 2: Commit**
```bash
git add admin.js admin.html
git commit -m "feat: add reservations management view"
```

---

## Fase 4: Notificaciones

### Task 9: Emails con Resend

**Files:**
- Create: `js/notifications.js`

**Step 1: Integrar Resend**

(Requiere Edge Function en Supabase o proxy backend)

**Step 2: Commit**
```bash
git add js/notifications.js
git commit -m "feat: add email notifications with Resend"
```

---

### Task 10: WhatsApp con Twilio (Opcional)

**Files:**
- Modify: `js/notifications.js`

---

## Fase 5: Gestión de Productos y Pedidos

### Task 11: CRUD de Productos

### Task 12: Vista de Pedidos

### Task 13: Integración Stripe

---

## Checklist Final

- [ ] Task 1: Supabase Client
- [ ] Task 2: Sistema Login
- [ ] Task 3: Trigger Oculto
- [ ] Task 4: HTML Panel
- [ ] Task 5: CSS Panel
- [ ] Task 6: Lógica Dashboard
- [ ] Task 7: Guardar Reservas
- [ ] Task 8: Vista Reservas Admin
- [ ] Task 9: Emails Resend
- [ ] Task 10: WhatsApp Twilio
- [ ] Task 11: CRUD Productos
- [ ] Task 12: Vista Pedidos
- [ ] Task 13: Stripe Checkout

---

## Prerequisitos

Antes de empezar la implementación:

1. **Crear proyecto en Supabase**
   - https://supabase.com → New Project
   - Copiar URL y Anon Key a `.env`

2. **Ejecutar SQL de tablas**
   - Ver esquema en `docs/API-AUDIT.md`
   - SQL → Run query en Supabase Dashboard

3. **Crear usuario admin**
   - Authentication → Users → Invite user
   - Añadir email a tabla `admins`
