/**
 * Peluquería Cool - Admin Panel Controller
 * Lógica principal del panel de administración
 */

class AdminPanel {
    constructor() {
        this.currentSection = 'dashboard';
        this.currentWeekOffset = 0;
        this.reservationsData = [];
        this.currentFilter = 'all';
    }

    async init() {
        // Verificar que Supabase está inicializado
        const client = window.supabaseInstance;
        if (!client) {
            console.error('Supabase not initialized');
            this.showAccessDenied();
            return;
        }

        // Verificar autenticación
        const isAuthenticated = await auth.init();

        if (!isAuthenticated || !auth.isAdmin) {
            // Intentar verificar si hay sesión válida
            const { data: { session } } = await client.auth.getSession();
            if (!session) {
                this.showAccessDenied();
                return;
            }

            // Verificar admin
            const { data: adminData } = await client
                .from('admins')
                .select('*')
                .eq('email', session.user.email)
                .single();

            if (!adminData) {
                this.showAccessDenied();
                return;
            }
        }

        // Mostrar panel ANTES de cargar datos
        document.getElementById('authCheck').hidden = true;
        document.getElementById('adminPanel').hidden = false;
        console.log('✅ Admin Panel initialized');

        // Configurar UI
        this.setupNavigation();
        this.setupHeader();
        this.setupEventListeners();

        // Cargar datos iniciales (con manejo de errores)
        try {
            await this.loadDashboard();
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }

        // Suscribirse a cambios en tiempo real
        try {
            this.subscribeToRealtimeUpdates();
        } catch (error) {
            console.error('Error subscribing to realtime:', error);
        }
    }

    showAccessDenied() {
        document.getElementById('authCheck').hidden = true;
        document.getElementById('accessDenied').hidden = false;
    }

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.switchSection(section);
            });
        });
    }

    setupHeader() {
        // Fecha actual
        const today = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        document.getElementById('headerDate').textContent = today.toLocaleDateString('es-ES', options);

        // Fecha de hoy en la lista
        document.getElementById('todayDate').textContent = today.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

        // Nombre del admin
        if (auth.user) {
            document.getElementById('adminName').textContent = auth.user.email.split('@')[0];
        }
    }

    setupEventListeners() {
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            auth.logout();
        });

        // Sidebar toggle (mobile)
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.querySelector('.admin-sidebar').classList.toggle('open');
        });

        // Calendar navigation
        document.getElementById('prevWeek').addEventListener('click', () => {
            this.currentWeekOffset--;
            this.loadCalendar();
        });

        document.getElementById('nextWeek').addEventListener('click', () => {
            this.currentWeekOffset++;
            this.loadCalendar();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderReservationsTable();
            });
        });

        // Refresh reservations
        document.getElementById('refreshReservations').addEventListener('click', () => {
            this.loadReservations();
        });

        // Date filter
        document.getElementById('filterDate').addEventListener('change', (e) => {
            this.loadReservations(e.target.value);
        });

        // Modal close
        document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
            el.addEventListener('click', () => {
                this.closeModal('reservationModal');
                this.closeNewAppointmentModal();
            });
        });

        // New appointment button
        document.getElementById('newAppointmentBtn').addEventListener('click', () => {
            this.openNewAppointmentModal();
        });
    }

    switchSection(section) {
        // Update nav
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Update content
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`${section}Section`).classList.add('active');

        // Update title
        const titles = {
            dashboard: 'Dashboard',
            reservations: 'Reservas',
            orders: 'Pedidos',
            products: 'Productos',
            clients: 'Clientes',
            settings: 'Configuración'
        };
        document.getElementById('pageTitle').textContent = titles[section] || section;

        this.currentSection = section;

        // Load section data
        if (section === 'reservations') {
            this.loadReservations();
        }
    }

    // ==================== DASHBOARD ====================

    async loadDashboard() {
        await Promise.all([
            this.loadMetrics(),
            this.loadCalendar(),
            this.loadTodayAppointments(),
            this.loadNotifications()
        ]);
    }

    async loadMetrics() {
        try {
            const stats = await reservations.getStats();

            document.getElementById('todayCount').textContent = stats.today;
            document.getElementById('pendingCount').textContent = stats.pending;
            document.getElementById('weekCount').textContent = stats.week;

            // Actualizar badge de pendientes
            const badge = document.getElementById('pendingBadge');
            if (stats.pending > 0) {
                badge.textContent = stats.pending;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }

            // TODO: Calcular ingresos del mes desde pedidos
            document.getElementById('monthRevenue').textContent = '0€';

        } catch (error) {
            console.error('Error loading metrics:', error);
        }
    }

    async loadCalendar() {
        const calendarGrid = document.getElementById('calendarGrid');
        const calendarTitle = document.getElementById('calendarTitle');

        // Calcular semana
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (this.currentWeekOffset * 7));

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        // Título
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        calendarTitle.textContent = `${startOfWeek.getDate()} - ${endOfWeek.getDate()} ${monthNames[startOfWeek.getMonth()]}`;

        // Obtener reservas de la semana
        const weekReservations = await reservations.getAll({
            dateFrom: startOfWeek.toISOString().split('T')[0],
            dateTo: endOfWeek.toISOString().split('T')[0]
        });

        // Generar días
        const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        let calendarHTML = '';

        for (let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            const dateStr = day.toISOString().split('T')[0];
            const isToday = dateStr === today.toISOString().split('T')[0];

            // Filtrar reservas de este día
            const dayReservations = weekReservations.filter(r => r.date === dateStr);

            calendarHTML += `
                <div class="calendar-day ${isToday ? 'today' : ''}">
                    <div class="calendar-day-header">${dayNames[i]}</div>
                    <div class="calendar-day-number">${day.getDate()}</div>
                    ${dayReservations.slice(0, 3).map(r => `
                        <div class="calendar-event ${r.status}" title="${r.customer_name} - ${r.service_name || r.service}">
                            ${r.time} ${r.customer_name.split(' ')[0]}
                        </div>
                    `).join('')}
                    ${dayReservations.length > 3 ? `<div class="calendar-event">+${dayReservations.length - 3} más</div>` : ''}
                </div>
            `;
        }

        calendarGrid.innerHTML = calendarHTML;
    }

    async loadTodayAppointments() {
        const container = document.getElementById('todayAppointments');

        try {
            const todayReservations = await reservations.getToday();

            if (todayReservations.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">☀️</span>
                        <p>No hay citas programadas para hoy</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = todayReservations.map(r => `
                <div class="today-item" data-id="${r.id}">
                    <span class="today-time">${r.time}</span>
                    <div class="today-info">
                        <div class="today-name">${r.customer_name}</div>
                        <div class="today-service">${r.service_name || r.service}</div>
                    </div>
                    <span class="today-status ${r.status}">${this.getStatusText(r.status)}</span>
                </div>
            `).join('');

            // Click handler
            container.querySelectorAll('.today-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.dataset.id;
                    const reservation = todayReservations.find(r => r.id === id);
                    if (reservation) this.showReservationModal(reservation);
                });
            });

        } catch (error) {
            console.error('Error loading today appointments:', error);
            container.innerHTML = '<p class="error">Error al cargar citas</p>';
        }
    }

    async loadNotifications() {
        const container = document.getElementById('notificationsList');

        try {
            const client = window.supabaseInstance;
            if (!client) return;

            const { data: notifications, error } = await client
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (!notifications || notifications.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No hay notificaciones</p>
                    </div>
                `;
                return;
            }

            // Update badge
            const unreadCount = notifications.filter(n => !n.read).length;
            const badge = document.getElementById('notificationBadge');
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }

            container.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.read ? '' : 'unread'}">
                    <span class="notification-icon">${n.type === 'reservation' ? '📅' : '📦'}</span>
                    <div class="notification-content">
                        <div class="notification-message">${n.message}</div>
                        <div class="notification-time">${this.formatTimeAgo(n.created_at)}</div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // ==================== RESERVATIONS ====================

    async loadReservations(dateFilter = null) {
        try {
            const filters = {};
            if (dateFilter) {
                filters.date = dateFilter;
            }

            this.reservationsData = await reservations.getAll(filters);
            this.renderReservationsTable();

        } catch (error) {
            console.error('Error loading reservations:', error);
        }
    }

    renderReservationsTable() {
        const tbody = document.getElementById('reservationsBody');
        const noData = document.getElementById('noReservations');

        // Filtrar según el filtro activo
        let filtered = this.reservationsData;
        if (this.currentFilter !== 'all') {
            filtered = this.reservationsData.filter(r => r.status === this.currentFilter);
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            noData.hidden = false;
            return;
        }

        noData.hidden = true;

        tbody.innerHTML = filtered.map(r => `
            <tr data-id="${r.id}">
                <td>
                    <strong>${this.formatDate(r.date)}</strong><br>
                    <span style="color: var(--admin-accent)">${r.time}</span>
                </td>
                <td>
                    <strong>${r.customer_name}</strong><br>
                    <a href="tel:${r.customer_phone}" style="color: var(--admin-text-muted)">${r.customer_phone}</a>
                </td>
                <td>
                    ${r.service_name || r.service}<br>
                    <small style="color:var(--admin-text-muted)">⏱ ${r.duration_minutes || 30} min</small>
                </td>
                <td class="source-cell">${this.getSourceIcon(r.fuente)}</td>
                <td><span class="status-badge ${r.status}">${this.getStatusText(r.status)}</span></td>
                <td>
                    <div class="action-btns">
                        ${r.status === 'confirmed' ? `
                            <button class="btn-action reject" title="Cliente No-Show (Liberar hueco)" onclick="adminPanel.markNoShow('${r.id}')">🚫</button>
                        ` : ''}
                        ${r.status === 'pending' ? `
                            <button class="btn-action confirm" onclick="adminPanel.confirmReservation('${r.id}')">✓</button>
                            <button class="btn-action reject" onclick="adminPanel.rejectReservation('${r.id}')">✗</button>
                        ` : ''}
                        <button class="btn-action view" onclick="adminPanel.viewReservation('${r.id}')">👁</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async confirmReservation(id) {
        try {
            await reservations.confirm(id);
            await this.loadReservations();
            await this.loadMetrics();
            this.showToast('Reserva confirmada', 'success');
        } catch (error) {
            console.error('Error confirming reservation:', error);
            this.showToast('Error al confirmar', 'error');
        }
    }

    async rejectReservation(id) {
        const reason = prompt('Motivo del rechazo (opcional):');
        try {
            await reservations.reject(id, reason || '');
            await this.loadReservations();
            await this.loadMetrics();
            this.showToast('Reserva rechazada', 'warning');
        } catch (error) {
            console.error('Error rejecting reservation:', error);
            this.showToast('Error al rechazar', 'error');
        }
    }

    async markNoShow(id) {
        if (!confirm('¿Marcar como No-Presentado? Se liberará el hueco.')) return;
        try {
            const client = window.supabaseInstance;
            const { error } = await client
                .from('reservations')
                .update({ status: 'cancelled', no_show: true })
                .eq('id', id);

            if (error) throw error;
            
            await this.loadReservations();
            this.showToast('Hueco liberado (No-Show)', 'warning');
        } catch (error) {
            console.error('Error marking no-show:', error);
            this.showToast('Error al liberar hueco', 'error');
        }
    }


    viewReservation(id) {
        const reservation = this.reservationsData.find(r => r.id === id);
        if (reservation) {
            this.showReservationModal(reservation);
        }
    }

    showReservationModal(reservation) {
        const modal = document.getElementById('reservationModal');
        const body = document.getElementById('modalReservationBody');
        const footer = document.getElementById('modalReservationFooter');

        body.innerHTML = `
            <div class="reservation-detail">
                <div class="detail-row">
                    <span class="detail-label">Cliente</span>
                    <span class="detail-value">${reservation.customer_name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Teléfono</span>
                    <span class="detail-value">
                        <a href="tel:${reservation.customer_phone}">${reservation.customer_phone}</a>
                        <a href="https://wa.me/${reservation.customer_phone.replace(/\D/g, '')}" target="_blank" style="margin-left: 8px">📱 WhatsApp</a>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fecha</span>
                    <span class="detail-value">${this.formatDate(reservation.date)} a las ${reservation.time}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Servicio</span>
                    <span class="detail-value">${reservation.service_name || reservation.service}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estado</span>
                    <span class="status-badge ${reservation.status}">${this.getStatusText(reservation.status)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Origen</span>
                    <span class="detail-value">${this.getSourceIcon(reservation.fuente)} ${reservation.fuente.toUpperCase()}</span>
                </div>
                ${reservation.notes ? `
                    <div class="detail-row">
                        <span class="detail-label">Notas</span>
                        <span class="detail-value">${reservation.notes}</span>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Creada</span>
                    <span class="detail-value">${this.formatTimeAgo(reservation.created_at)}</span>
                </div>
            </div>
        `;

        // Footer actions
        let actionsHTML = '<button class="btn-secondary" onclick="adminPanel.closeModal(\'reservationModal\')">Cerrar</button>';

        if (reservation.status === 'pending') {
            actionsHTML = `
                <button class="btn-secondary" onclick="adminPanel.closeModal('reservationModal')">Cerrar</button>
                <button class="btn-action reject" style="padding: 10px 20px" onclick="adminPanel.rejectReservation('${reservation.id}'); adminPanel.closeModal('reservationModal')">Rechazar</button>
                <button class="btn-primary" onclick="adminPanel.confirmReservation('${reservation.id}'); adminPanel.closeModal('reservationModal')">Confirmar</button>
            `;
        } else if (reservation.status === 'confirmed') {
            actionsHTML = `
                <button class="btn-secondary" onclick="adminPanel.closeModal('reservationModal')">Cerrar</button>
                <button class="btn-primary" onclick="adminPanel.completeReservation('${reservation.id}')">Marcar Completada</button>
            `;
        }

        footer.innerHTML = actionsHTML;
        modal.hidden = false;
    }

    async completeReservation(id) {
        try {
            await reservations.complete(id);
            await this.loadReservations();
            this.closeModal('reservationModal');
            this.showToast('Cita marcada como completada', 'success');
        } catch (error) {
            console.error('Error completing reservation:', error);
        }
    }

    closeModal(modalId) {
        document.getElementById(modalId).hidden = true;
    }

    // ==================== REALTIME ====================

    subscribeToRealtimeUpdates() {
        const client = window.supabaseInstance;
        if (!client) return;

        // Suscribirse a nuevas reservas
        client
            .channel('reservations')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations' },
                (payload) => {
                    console.log('Nueva reserva:', payload);
                    this.showToast('¡Nueva reserva recibida!', 'info');
                    this.loadDashboard();
                    if (this.currentSection === 'reservations') {
                        this.loadReservations();
                    }
                }
            )
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations' },
                (payload) => {
                    console.log('Reserva actualizada:', payload);
                    if (this.currentSection === 'dashboard') {
                        this.loadDashboard();
                    }
                }
            )
            .subscribe();
    }

    // ==================== NEW APPOINTMENT ====================

    openNewAppointmentModal() {
        const modal = document.getElementById('newAppointmentModal');
        const form = document.getElementById('newAppointmentForm');

        // Reset form
        form.reset();

        // Set default date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('newAppointmentDate').value = tomorrow.toISOString().split('T')[0];

        // Set min date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('newAppointmentDate').min = today;

        modal.hidden = false;
    }

    closeNewAppointmentModal() {
        document.getElementById('newAppointmentModal').hidden = true;
    }

    async createNewAppointment() {
        const form = document.getElementById('newAppointmentForm');

        // Validate required fields
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const data = {
            nombre: document.getElementById('newClientName').value.trim(),
            telefono: document.getElementById('newClientPhone').value.trim(),
            email: document.getElementById('newClientEmail').value.trim() || null,
            fecha: document.getElementById('newAppointmentDate').value,
            hora: document.getElementById('newAppointmentTime').value,
            servicio: document.getElementById('newAppointmentService').value,
            servicioNombre: document.getElementById('newAppointmentService').value,
            duracion: document.getElementById('newAppointmentDuration').value,
            notas: document.getElementById('newAppointmentNotes').value.trim() || null,
            status: document.getElementById('newAppointmentStatus').value,
            fuente: 'manual'
        };

        // Validate data
        if (!data.nombre || !data.telefono || !data.fecha || !data.hora || !data.servicio) {
            this.showToast('Por favor completa todos los campos requeridos', 'error');
            return;
        }

        try {
            // Show loading state
            const submitBtn = document.querySelector('#newAppointmentModal .btn-primary');
            const originalHTML = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-small"></span> Creando...';

            // Create the reservation
            await reservations.create(data);

            // Success!
            this.showToast('✅ Cita creada correctamente', 'success');
            this.closeNewAppointmentModal();

            // Reload data
            await this.loadDashboard();
            if (this.currentSection === 'reservations') {
                await this.loadReservations();
            }

        } catch (error) {
            console.error('Error creating appointment:', error);
            this.showToast('Error al crear la cita: ' + error.message, 'error');
        } finally {
            // Reset button
            const submitBtn = document.querySelector('#newAppointmentModal .btn-primary');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span class="btn-icon">✓</span> Crear Cita';
            }
        }
    }

    // ==================== CONFIGURATION ====================
    async openNotificationsModal() {
        const modal = document.getElementById('notificationsModal');
        const input = document.getElementById('webhookUrlInput');
        
        try {
            const client = window.supabaseInstance;
            const { data } = await client
                .from('salon_config')
                .select('value')
                .eq('key', 'webhook_url')
                .single();
            
            if (data && data.value) {
                input.value = typeof data.value === 'string' ? data.value : '';
            }
        } catch (error) {
            console.error('Error cargando webhook:', error);
        }
        
        modal.hidden = false;
    }

    async saveNotifications() {
        const url = document.getElementById('webhookUrlInput').value.trim();
        const btn = document.querySelector('#notificationsModal .btn-primary');

        try {
            btn.textContent = 'Guardando...';
            btn.disabled = true;

            const client = window.supabaseInstance;
            const { error } = await client
                .from('salon_config')
                .upsert({ key: 'webhook_url', value: url });

            if (error) throw error;

            this.showToast('✅ Configuración guardada', 'success');
            
            // Actualizar URL en memoria si existe el objeto APP_CONFIG
            if (window.APP_CONFIG) {
                window.APP_CONFIG.WEBHOOK_URL = url;
            }

            this.closeModal('notificationsModal');
        } catch (error) {
            console.error('Error guardando webhook:', error);
            this.showToast('Error al guardar: ' + error.message, 'error');
        } finally {
            btn.textContent = 'Guardar';
            btn.disabled = false;
        }
    }

    openScheduleModal() {
        // En esta fase, sugerimos editar el archivo local o avisamos que está en desarrollo
        this.showToast('ℹ️ Gestión de horarios vía Panel en desarrollo. Por ahora, edita schedule-config.js', 'info');
    }

    openProfileModal() {
        const newPass = prompt(`Cambiar contraseña para ${auth.user?.email || 'admin'}:\nIntroduce la nueva contraseña (mínimo 6 caracteres):`);
        
        if (newPass) {
            if (newPass.length < 6) {
                this.showToast('La contraseña debe tener al menos 6 caracteres', 'error');
                return;
            }
            this.updatePassword(newPass);
        }
    }

    async updatePassword(password) {
        try {
            const client = window.supabaseInstance;
            const { error } = await client.auth.updateUser({ password });
            if (error) throw error;
            this.showToast('✅ Contraseña actualizada correctamente', 'success');
        } catch (error) {
            this.showToast('Error al actualizar: ' + error.message, 'error');
        }
    }

    // ==================== HELPERS ====================


    getStatusText(status) {
        const texts = {
            pending: 'Pendiente',
            confirmed: 'Confirmada',
            completed: 'Completada',
            cancelled: 'Cancelada',
            rejected: 'Rechazada'
        };
        return texts[status] || status;
    }

    getSourceIcon(source) {
        const icons = {
            web: '🌐',
            whatsapp: '📱',
            manual: '📝',
            telefono: '📞'
        };
        return icons[source] || '❓';
    }


    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    }

    formatTimeAgo(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Ahora mismo';
        if (minutes < 60) return `Hace ${minutes} min`;
        if (hours < 24) return `Hace ${hours}h`;
        if (days < 7) return `Hace ${days} días`;

        return date.toLocaleDateString('es-ES');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-message">${message}</span>
            <button class="toast-close">&times;</button>
        `;

        // Estilos inline para el toast
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: ${type === 'success' ? 'var(--admin-success)' : type === 'error' ? 'var(--admin-danger)' : type === 'warning' ? 'var(--admin-warning)' : 'var(--admin-accent)'};
            color: white;
            padding: 14px 20px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 9999;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(toast);

        // Auto-remove
        setTimeout(() => toast.remove(), 4000);

        // Manual close
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    }
}

// Add CSS for reservation details
const detailStyles = document.createElement('style');
detailStyles.textContent = `
    .reservation-detail {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
    .detail-row {
        display: flex;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--admin-border);
    }
    .detail-row:last-child {
        border-bottom: none;
    }
    .detail-label {
        color: var(--admin-text-muted);
        font-size: 13px;
    }
    .detail-value {
        font-weight: 500;
    }
    .detail-value a {
        color: var(--admin-accent);
        text-decoration: none;
    }
    .detail-value a:hover {
        text-decoration: underline;
    }
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    .toast-close {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        opacity: 0.8;
    }
    .toast-close:hover {
        opacity: 1;
    }
`;
document.head.appendChild(detailStyles);

// Instancia global
const adminPanel = new AdminPanel();
window.adminPanel = adminPanel;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    adminPanel.init();
});
