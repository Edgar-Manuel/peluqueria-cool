/**
 * Peluquería Cool - Admin Panel Controller
 * Lógica principal del panel de administración
 */

class AdminPanel {
    constructor() {
        this.currentSection = 'dashboard';
        this.currentWeekOffset = 0;
        this.currentCalendarView = 'week';
        this.currentOffset = 0;
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
            this.currentOffset--;
            this.loadCalendar();
        });

        document.getElementById('nextWeek').addEventListener('click', () => {
            this.currentOffset++;
            this.loadCalendar();
        });

        // Calendar view switcher
        document.querySelectorAll('.cal-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCalendarView = btn.dataset.view;
                this.currentOffset = 0;
                this.loadCalendar();
            });
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
            agenda: 'Agenda del Día',
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
        } else if (section === 'agenda') {
            this.initAgenda();
        } else if (section === 'clients') {
            this.loadClients();
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

    getServiceInfo(serviceId, serviceName) {
        const config = window.scheduleConfig && window.scheduleConfig.services && window.scheduleConfig.services[serviceId];
        if (config) return { color: config.color, name: config.name, category: config.category };
        const n = (serviceName || serviceId || '').toLowerCase();
        if (n.includes('corte') || n.includes('flequillo') || n.includes('niño') || n.includes('nino'))
            return { color: '#10b981', name: serviceName || serviceId, category: 'corte' };
        if (n.includes('tinte') || n.includes('mecha') || n.includes('decol') || n.includes('color'))
            return { color: '#f59e0b', name: serviceName || serviceId, category: 'color' };
        if (n.includes('peinado') || n.includes('novia'))
            return { color: '#8b5cf6', name: serviceName || serviceId, category: 'styling' };
        if (n.includes('tratamiento') || n.includes('keratina') || n.includes('lavado') || n.includes('secado'))
            return { color: '#06b6d4', name: serviceName || serviceId, category: 'tratamiento' };
        if (n.includes('solarium') || n.includes('vip'))
            return { color: '#f97316', name: serviceName || serviceId, category: 'otro' };
        return { color: '#3b82f6', name: serviceName || serviceId, category: 'otro' };
    }

    async loadCalendar() {
        const view = this.currentCalendarView;
        if (view === 'day') {
            await this.loadCalendarDay(this.currentOffset);
        } else if (view === 'month') {
            await this.loadCalendarMonth(this.currentOffset);
        } else {
            await this.loadCalendarWeek(this.currentOffset);
        }
    }

    async loadCalendarWeek(offset) {
        const calendarGrid = document.getElementById('calendarGrid');
        const calendarTitle = document.getElementById('calendarTitle');
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (offset * 7));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        calendarTitle.textContent = `${startOfWeek.getDate()} - ${endOfWeek.getDate()} ${monthNames[startOfWeek.getMonth()]}`;

        const weekReservations = await reservations.getAll({
            dateFrom: startOfWeek.toISOString().split('T')[0],
            dateTo: endOfWeek.toISOString().split('T')[0]
        });

        const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const todayStr = today.toISOString().split('T')[0];
        let html = '<div class="cal-week-grid">';

        for (let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            const dateStr = day.toISOString().split('T')[0];
            const isToday = dateStr === todayStr;
            const dayRes = weekReservations.filter(r => r.date === dateStr);

            html += `<div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="calendar-day-header">${dayNames[i]}</div>
                <div class="calendar-day-number">${day.getDate()}</div>
                ${dayRes.slice(0, 3).map(r => {
                    const si = this.getServiceInfo(r.service, r.service_name);
                    return `<div class="calendar-event" style="background:${si.color}" title="${r.customer_name} - ${si.name}">${r.time} ${r.customer_name.split(' ')[0]}</div>`;
                }).join('')}
                ${dayRes.length > 3 ? `<div class="calendar-event cal-event-more">+${dayRes.length - 3} más</div>` : ''}
            </div>`;
        }
        html += '</div>';
        calendarGrid.innerHTML = html;
    }

    async loadCalendarDay(offset) {
        const calendarGrid = document.getElementById('calendarGrid');
        const calendarTitle = document.getElementById('calendarTitle');
        const today = new Date();
        const viewDay = new Date(today);
        viewDay.setDate(today.getDate() + offset);
        const dateStr = viewDay.toISOString().split('T')[0];

        const dayNamesLong = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        calendarTitle.textContent = `${dayNamesLong[viewDay.getDay()]} ${viewDay.getDate()} ${monthNames[viewDay.getMonth()]}`;

        const dayReservations = await reservations.getAll({ dateFrom: dateStr, dateTo: dateStr });

        const startHour = 9, endHour = 20;
        let html = '<div class="cal-day-view">';

        for (let h = startHour; h < endHour; h++) {
            for (let m = 0; m < 60; m += 30) {
                const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                const slotMin = h * 60 + m;

                const res = dayReservations.find(r => r.time === timeStr);
                const isContinuation = !res && dayReservations.some(r => {
                    const [rh, rm] = r.time.split(':').map(Number);
                    const rStart = rh * 60 + rm;
                    const rEnd = rStart + (r.duration_minutes || 30);
                    return slotMin > rStart && slotMin < rEnd;
                });

                if (isContinuation) continue;

                if (res) {
                    const si = this.getServiceInfo(res.service, res.service_name);
                    const dur = res.duration_minutes || 30;
                    html += `<div class="cal-day-slot cal-day-booked" style="border-left:3px solid ${si.color};background:${si.color}18" data-id="${res.id}">
                        <span class="cal-day-time">${timeStr}</span>
                        <div class="cal-day-event-info">
                            <span class="cal-day-client">${res.customer_name}</span>
                            <span class="cal-day-service" style="color:${si.color}">${res.service_name || res.service}</span>
                        </div>
                        <span class="cal-day-duration">${dur}min</span>
                    </div>`;
                } else {
                    html += `<div class="cal-day-slot cal-day-free">
                        <span class="cal-day-time">${timeStr}</span>
                        <span class="cal-day-free-label">Libre</span>
                    </div>`;
                }
            }
        }

        html += '</div>';
        calendarGrid.innerHTML = html;

        calendarGrid.querySelectorAll('.cal-day-booked').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                const res = dayReservations.find(r => r.id === id);
                if (res) this.showReservationModal(res);
            });
        });
    }

    async loadCalendarMonth(offset) {
        const calendarGrid = document.getElementById('calendarGrid');
        const calendarTitle = document.getElementById('calendarTitle');
        const today = new Date();
        const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
            'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

        const viewDate = new Date(today.getFullYear(), today.getMonth() + offset, 1);
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        calendarTitle.textContent = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const dateFrom = firstDay.toISOString().split('T')[0];
        const dateTo = lastDay.toISOString().split('T')[0];

        const monthReservations = await reservations.getAll({ dateFrom, dateTo });
        const byDate = {};
        monthReservations.forEach(r => {
            if (!byDate[r.date]) byDate[r.date] = [];
            byDate[r.date].push(r);
        });

        let startDow = firstDay.getDay();
        if (startDow === 0) startDow = 7;
        const emptyCells = startDow - 1;
        const todayStr = today.toISOString().split('T')[0];

        let html = '<div class="cal-month-view"><div class="cal-month-header">';
        ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(d => {
            html += `<div class="cal-month-dow">${d}</div>`;
        });
        html += '</div><div class="cal-month-grid">';

        for (let i = 0; i < emptyCells; i++) {
            html += '<div class="cal-month-cell cal-month-empty"></div>';
        }

        for (let d = 1; d <= lastDay.getDate(); d++) {
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = dateStr === todayStr;
            const dayRes = byDate[dateStr] || [];

            html += `<div class="cal-month-cell ${isToday ? 'cal-month-today' : ''}">
                <div class="cal-month-day-num">${d}</div>
                <div class="cal-month-events">`;

            dayRes.slice(0, 2).forEach(r => {
                const si = this.getServiceInfo(r.service, r.service_name);
                html += `<div class="cal-month-event" style="background:${si.color}" title="${r.time} - ${r.customer_name} (${r.service_name || r.service})">${r.time} ${r.customer_name.split(' ')[0]}</div>`;
            });

            if (dayRes.length > 2) {
                html += `<div class="cal-month-more">+${dayRes.length - 2}</div>`;
            }

            html += '</div></div>';
        }

        html += '</div></div>';
        calendarGrid.innerHTML = html;
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

        // Parse service value: "id|nombre|duracion"
        const serviceRaw = document.getElementById('newAppointmentService').value;
        const serviceParts = serviceRaw.split('|');
        const servicioId = serviceParts[0] || serviceRaw;
        const servicioNombre = serviceParts[1] || serviceRaw;
        const duracionDetectada = serviceParts[2] ? parseInt(serviceParts[2]) : null;

        const data = {
            nombre: document.getElementById('newClientName').value.trim(),
            telefono: document.getElementById('newClientPhone').value.trim(),
            email: document.getElementById('newClientEmail').value.trim() || null,
            fecha: document.getElementById('newAppointmentDate').value,
            hora: document.getElementById('newAppointmentTime').value,
            servicio: servicioId,
            servicioNombre: servicioNombre,
            duracion: duracionDetectada || parseInt(document.getElementById('newAppointmentDuration').value) || 45,
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
            } else if (this.currentSection === 'agenda') {
                await this.loadAgenda(this.agendaDate);
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

    // ==================== AGENDA / TIMELINE ====================

    initAgenda() {
        if (this._agendaInitialized) {
            this.loadAgenda(this.agendaDate);
            return;
        }
        this._agendaInitialized = true;

        // Set today as default
        const today = new Date();
        this.agendaDate = today.toISOString().split('T')[0];

        const picker = document.getElementById('agendaDatePicker');
        picker.value = this.agendaDate;
        picker.addEventListener('change', (e) => {
            this.agendaDate = e.target.value;
            this.loadAgenda(this.agendaDate);
        });

        document.getElementById('agendaPrevDay').addEventListener('click', () => {
            const d = new Date(this.agendaDate + 'T12:00:00');
            d.setDate(d.getDate() - 1);
            this.agendaDate = d.toISOString().split('T')[0];
            picker.value = this.agendaDate;
            this.loadAgenda(this.agendaDate);
        });

        document.getElementById('agendaNextDay').addEventListener('click', () => {
            const d = new Date(this.agendaDate + 'T12:00:00');
            d.setDate(d.getDate() + 1);
            this.agendaDate = d.toISOString().split('T')[0];
            picker.value = this.agendaDate;
            this.loadAgenda(this.agendaDate);
        });

        this.loadAgenda(this.agendaDate);
    }

    async loadAgenda(dateStr) {
        // Update title
        const d = new Date(dateStr + 'T12:00:00');
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const dayTitle = isToday
            ? 'Hoy — ' + d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
            : d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        document.getElementById('agendaDayTitle').textContent = dayTitle;

        // Check if closed
        const isClosed = await (window.smartScheduler?.isDayClosed(dateStr) ?? false);
        document.getElementById('timelineClosedMsg').hidden = !isClosed;
        document.getElementById('timelineContainer').style.display = isClosed ? 'none' : '';
        document.getElementById('agendaEmpty').hidden = true;

        if (isClosed) {
            this._clearAgendaStats();
            document.getElementById('timelineList').innerHTML = '';
            return;
        }

        // Get schedule for day
        const daySched = window.smartScheduler?.getDaySchedule(dateStr);
        if (!daySched) {
            document.getElementById('timelineClosedMsg').hidden = false;
            document.getElementById('timelineContainer').style.display = 'none';
            this._clearAgendaStats();
            return;
        }

        // Fetch appointments
        const client = window.supabaseInstance;
        if (!client) return;

        const { data: appts, error } = await client
            .from('reservations')
            .select('*')
            .eq('date', dateStr)
            .not('status', 'in', '("cancelled","rejected")')
            .order('time', { ascending: true });

        if (error) {
            console.error('Agenda error:', error);
            return;
        }

        // Calculate stats
        const totalIngresos = (appts || []).reduce((sum, a) => sum + (a.precio_estimado || 0), 0);
        document.getElementById('agendaCitasCount').textContent = (appts || []).length;
        document.getElementById('agendaIngresos').textContent = totalIngresos > 0 ? `${totalIngresos}€` : '—';

        // Show/hide empty state
        document.getElementById('agendaEmpty').hidden = (appts || []).length > 0;

        // Calculate optimizable gaps
        if (window.smartScheduler) {
            const gaps = await smartScheduler.getOptimizableGaps(dateStr);
            const gapsAlert = document.getElementById('agendaGapsAlert');
            const gapsBanner = document.getElementById('agendaGapsBanner');
            if (gaps.length > 0) {
                document.getElementById('agendaGapsCount').textContent = gaps.length;
                gapsAlert.hidden = false;
                gapsBanner.hidden = false;
                document.getElementById('agendaGapsText').textContent =
                    gaps.map(g => `${g.inicio}–${g.fin} (${g.duracion} min libre)`).join(' · ');
                this._pendingGaps = gaps;
            } else {
                gapsAlert.hidden = true;
                gapsBanner.hidden = true;
            }
        }

        // Render timeline
        this.renderTimeline(daySched, appts || [], dateStr);

        // Render list (mobile-friendly)
        this.renderTimelineList(appts || [], dateStr);
    }

    _clearAgendaStats() {
        document.getElementById('agendaCitasCount').textContent = '0';
        document.getElementById('agendaIngresos').textContent = '—';
        document.getElementById('agendaGapsAlert').hidden = true;
        document.getElementById('agendaGapsBanner').hidden = true;
    }

    renderTimeline(daySched, appts, dateStr) {
        const container = document.getElementById('timelineContainer');
        const scheduler = window.smartScheduler || { timeToMinutes: (t) => { const [h,m] = t.split(':').map(Number); return h*60+m; }, minutesToTime: (m) => String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0') };

        const { open, close } = daySched;
        const totalMinutes = close - open;
        if (totalMinutes <= 0) return;

        // Percentage helper
        const pct = (minutes) => ((minutes - open) / totalMinutes * 100).toFixed(2);
        const widthPct = (dur) => (dur / totalMinutes * 100).toFixed(2);

        // Build appointments with end times
        const citasConFin = appts.map(a => {
            const inicio = scheduler.timeToMinutes(a.time);
            const dur = a.duration_minutes || 45;
            const fin = a.hora_fin ? scheduler.timeToMinutes(a.hora_fin) : inicio + dur;
            const color = this._getServiceColor(a.servicio_id || a.service);
            return { ...a, _inicio: inicio, _fin: fin, _color: color };
        });

        // Detect lunch break (gap between morning and afternoon)
        // Find morning close and afternoon open from schedule
        const hasMorning = daySched.openStr < '14:00';
        const hasAfternoon = daySched.closeStr > '14:00';
        const morningClose = hasMorning && hasAfternoon ? 14 * 60 : null;
        const afternoonOpen = hasMorning && hasAfternoon ? 16 * 60 : null;

        // Scale labels
        const scaleEl = document.createElement('div');
        scaleEl.className = 'timeline-scale';
        const hoursToShow = [];
        for (let h = Math.floor(open / 60); h <= Math.ceil(close / 60); h++) {
            hoursToShow.push(h * 60);
        }

        hoursToShow.forEach(hMin => {
            if (hMin < open || hMin > close) return;
            const mark = document.createElement('span');
            mark.className = 'timeline-hour-mark';
            mark.style.left = pct(hMin) + '%';
            mark.textContent = String(Math.floor(hMin / 60)).padStart(2, '0') + ':00';
            scaleEl.appendChild(mark);
        });

        // Track
        const track = document.createElement('div');
        track.className = 'timeline-track';

        // Lunch break block
        if (morningClose && afternoonOpen) {
            const block = document.createElement('div');
            block.className = 'timeline-closed-block';
            block.style.left = pct(morningClose) + '%';
            block.style.width = widthPct(afternoonOpen - morningClose) + '%';
            block.textContent = 'Cerrado';
            track.appendChild(block);
        }

        // Appointment blocks
        citasConFin.forEach(cita => {
            const startPct = pct(cita._inicio);
            const wPct = widthPct(cita._fin - cita._inicio);
            const block = document.createElement('div');
            block.className = `timeline-appointment status-${cita.status}`;
            block.style.left = startPct + '%';
            block.style.width = Math.max(parseFloat(wPct), 2) + '%';
            block.style.backgroundColor = cita._color;
            block.innerHTML = `
                <div class="timeline-appt-name">${cita.customer_name}</div>
                <div class="timeline-appt-service">${cita.service_name || cita.service || ''}</div>
                <div class="timeline-appt-time">${cita.time}–${cita.hora_fin || ''}</div>
            `;
            block.addEventListener('click', () => this.openReservationDetails(cita.id));
            track.appendChild(block);
        });

        // Current time indicator (only for today)
        const today = new Date().toISOString().split('T')[0];
        if (dateStr === today) {
            const now = new Date();
            const nowMin = now.getHours() * 60 + now.getMinutes();
            if (nowMin >= open && nowMin <= close) {
                const nowLine = document.createElement('div');
                nowLine.className = 'timeline-now';
                nowLine.style.left = pct(nowMin) + '%';
                track.appendChild(nowLine);
            }
        }

        // Gaps (optimizable)
        if (this._pendingGaps && dateStr === this.agendaDate) {
            this._pendingGaps.forEach(gap => {
                const gapStart = scheduler.timeToMinutes(gap.inicio);
                const gapEnd = scheduler.timeToMinutes(gap.fin);
                const gEl = document.createElement('div');
                gEl.className = 'timeline-gap';
                gEl.style.left = pct(gapStart) + '%';
                gEl.style.width = widthPct(gapEnd - gapStart) + '%';
                gEl.title = `${gap.duracion} min libre`;
                gEl.textContent = `${gap.duracion}m`;
                gEl.addEventListener('click', () => this.openNewAppointmentAtTime(gap.inicio, dateStr));
                track.appendChild(gEl);
            });
        }

        container.innerHTML = '';
        container.appendChild(scaleEl);
        container.appendChild(track);
    }

    renderTimelineList(appts, dateStr) {
        const list = document.getElementById('timelineList');
        const scheduler = window.smartScheduler;
        list.innerHTML = '';

        if (appts.length === 0) return;

        // Insert gap items between appointments
        const itemsWithGaps = [];
        const sorted = [...appts].sort((a, b) => a.time.localeCompare(b.time));

        sorted.forEach((appt, i) => {
            itemsWithGaps.push({ type: 'appt', data: appt });

            // Check gap after this appointment
            if (scheduler && i < sorted.length - 1) {
                const thisEnd = appt.hora_fin || scheduler.minutesToTime(
                    scheduler.timeToMinutes(appt.time) + (appt.duration_minutes || 45)
                );
                const nextStart = sorted[i + 1].time;
                const thisEndMin = scheduler.timeToMinutes(thisEnd);
                const nextStartMin = scheduler.timeToMinutes(nextStart);
                const gapMin = nextStartMin - thisEndMin - (scheduler.bufferMinutos || 10);
                if (gapMin >= 15) {
                    itemsWithGaps.push({
                        type: 'gap',
                        data: {
                            inicio: thisEnd,
                            fin: nextStart,
                            duracion: gapMin,
                            servicios: scheduler.getServiciosParaHueco(gapMin)
                        }
                    });
                }
            }
        });

        itemsWithGaps.forEach(item => {
            if (item.type === 'appt') {
                list.appendChild(this._buildTimelineListItem(item.data));
            } else {
                list.appendChild(this._buildTimelineGapItem(item.data, dateStr));
            }
        });
    }

    _buildTimelineListItem(appt) {
        const color = this._getServiceColor(appt.servicio_id || appt.service);
        const duracion = appt.duration_minutes || 45;
        const horaFin = appt.hora_fin || '';

        const el = document.createElement('div');
        el.className = 'timeline-list-item';
        el.style.borderLeftColor = color;
        el.innerHTML = `
            <div class="tli-time">
                <span class="tli-time-start">${appt.time}</span>
                ${horaFin ? `<span class="tli-time-end">${horaFin}</span>` : ''}
            </div>
            <div class="tli-color-dot" style="background:${color}"></div>
            <div class="tli-info">
                <div class="tli-name">${appt.customer_name}</div>
                <div class="tli-service">${appt.service_name || appt.service || ''}</div>
                <div class="tli-duration">${duracion} min · <a href="tel:${appt.customer_phone}" class="tli-phone">${appt.customer_phone}</a></div>
            </div>
            <div class="tli-actions">
                <span class="tli-badge ${appt.status}">${this._translateStatus(appt.status)}</span>
            </div>
        `;
        el.addEventListener('click', () => this.openReservationDetails(appt.id));
        return el;
    }

    _buildTimelineGapItem(gap, dateStr) {
        const serviciosText = gap.servicios && gap.servicios.length > 0
            ? 'Caben: ' + gap.servicios.slice(0, 3).map(s => s.nombre).join(', ')
            : 'Hueco libre';

        const el = document.createElement('div');
        el.className = 'timeline-gap-item';
        el.innerHTML = `
            <span class="tgi-icon">💡</span>
            <div class="tgi-info">
                <div class="tgi-time">Hueco: ${gap.inicio} – ${gap.fin} (${gap.duracion} min)</div>
                <div class="tgi-services">${serviciosText}</div>
            </div>
            <button class="btn-small" style="font-size:11px;">+ Cita</button>
        `;
        el.querySelector('.btn-small').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openNewAppointmentAtTime(gap.inicio, dateStr);
        });
        return el;
    }

    _getServiceColor(serviceId) {
        if (!serviceId) return '#3b82f6';
        if (typeof SCHEDULE_CONFIG !== 'undefined' && SCHEDULE_CONFIG.services[serviceId]) {
            return SCHEDULE_CONFIG.services[serviceId].color || '#3b82f6';
        }
        // Fallback colors by category keyword
        const colorMap = {
            corte: '#10b981', color: '#f59e0b', tinte: '#f59e0b',
            mechas: '#d97706', peinado: '#8b5cf6', tratamiento: '#06b6d4',
            solarium: '#f97316', vip: '#ec4899', lavado: '#6b7280',
            keratina: '#0891b2'
        };
        for (const [key, col] of Object.entries(colorMap)) {
            if (serviceId.includes(key)) return col;
        }
        return '#3b82f6';
    }

    _translateStatus(status) {
        const map = { pending: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada', rejected: 'Rechazada' };
        return map[status] || status;
    }

    showGapDetails() {
        if (!this._pendingGaps || this._pendingGaps.length === 0) return;
        const text = this._pendingGaps.map(g =>
            `• ${g.inicio}–${g.fin} (${g.duracion} min)\n  Caben: ${g.servicios_que_caben?.map(s => s.nombre).join(', ') || 'varios servicios'}`
        ).join('\n\n');
        alert('Huecos disponibles hoy:\n\n' + text + '\n\nToca cualquier hueco en la agenda para añadir una cita.');
    }

    openNewAppointmentAtTime(hora, fecha) {
        this.openNewAppointmentModal();
        // Pre-fill date and time after modal opens
        setTimeout(() => {
            const dateInput = document.getElementById('newAppointmentDate');
            const timeSelect = document.getElementById('newAppointmentTime');
            if (dateInput) dateInput.value = fecha || this.agendaDate;
            if (timeSelect) {
                // Find the closest option
                const opts = [...timeSelect.options];
                const match = opts.find(o => o.value === hora);
                if (match) timeSelect.value = hora;
            }
        }, 100);
    }

    // Called when service changes in the new appointment form
    onServiceChange(value) {
        if (!value) return;
        const parts = value.split('|');
        if (parts.length >= 3) {
            const dur = parseInt(parts[2]);
            const durInput = document.getElementById('newAppointmentDuration');
            const hint = document.getElementById('durationHint');
            if (durInput) durInput.value = dur;
            if (hint) {
                const h = Math.floor(dur / 60);
                const m = dur % 60;
                hint.textContent = h > 0 ? `${h}h ${m > 0 ? m + 'min' : ''}` : `${m} minutos`;
            }
        }
    }

    // ==================== RESERVATION DETAILS (agenda) ====================

    async openReservationDetails(id) {
        const client = window.supabaseInstance;
        if (!client) return;
        const { data: res } = await client
            .from('reservations')
            .select('*')
            .eq('id', id)
            .single();
        if (res) this.showReservationModal(res);
    }

    // ==================== CLIENTS ====================

    async loadClients(search = '') {
        const client = window.supabaseInstance;
        if (!client) return;

        // Setup search listener once
        if (!this._clientSearchSetup) {
            this._clientSearchSetup = true;
            document.getElementById('clientSearch').addEventListener('input', (e) => {
                clearTimeout(this._clientSearchTimer);
                this._clientSearchTimer = setTimeout(() => this.loadClients(e.target.value.trim()), 300);
            });
        }

        document.getElementById('clientsLoading').hidden = false;
        document.getElementById('clientsTable').hidden = true;
        document.getElementById('clientsEmpty').hidden = true;

        try {
            // 1. Fetch from clientes table (completed visits tracked by trigger)
            let dbQuery = client
                .from('clientes')
                .select('*')
                .order('ultima_visita', { ascending: false, nullsFirst: false })
                .limit(200);

            if (search) {
                dbQuery = dbQuery.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%`);
            }

            const { data: dbClients } = await dbQuery;

            // 2. Fetch unique clients from reservations (might not be in clientes yet)
            const { data: resData } = await client
                .from('reservations')
                .select('customer_name, customer_phone, date, service_name, status, created_at')
                .not('status', 'in', '("cancelled","rejected")')
                .order('date', { ascending: false })
                .limit(300);

            // Merge: add reservation-only clients not in clientes table
            const knownPhones = new Set((dbClients || []).map(c => c.telefono));
            const extraClients = {};
            (resData || []).forEach(r => {
                if (!knownPhones.has(r.customer_phone) && !extraClients[r.customer_phone]) {
                    if (search) {
                        const q = search.toLowerCase();
                        if (!r.customer_name?.toLowerCase().includes(q) && !r.customer_phone?.includes(q)) return;
                    }
                    extraClients[r.customer_phone] = {
                        id: null,
                        nombre: r.customer_name,
                        telefono: r.customer_phone,
                        total_visitas: 0,
                        ultima_visita: r.status === 'completed' ? r.date : null,
                        ultimo_servicio_nombre: r.service_name,
                        cancelaciones_tardias: 0,
                        notas: null,
                        created_at: r.created_at,
                        _pending: true
                    };
                }
            });

            const allClients = [...(dbClients || []), ...Object.values(extraClients)];
            this._clientsData = allClients;

            this.renderClientsStats(dbClients || [], allClients);
            this.renderClientsTable(allClients);

        } catch (err) {
            console.error('Error loading clients:', err);
            document.getElementById('clientsLoading').hidden = true;
            document.getElementById('clientsEmpty').hidden = false;
        }
    }

    renderClientsStats(dbClients, allClients) {
        // Total
        document.getElementById('kpiTotalClients').textContent = allClients.length;

        // New this month
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const newThisMonth = allClients.filter(c => c.created_at >= monthStart).length;
        document.getElementById('kpiNewMonth').textContent = newThisMonth;

        // Most loyal client (most visits)
        const topClient = [...dbClients].sort((a, b) => (b.total_visitas || 0) - (a.total_visitas || 0))[0];
        const topEl = document.getElementById('kpiTopClient');
        if (topClient) {
            topEl.textContent = topClient.nombre.split(' ')[0];
            topEl.title = `${topClient.nombre} · ${topClient.total_visitas} visitas`;
        } else {
            topEl.textContent = '—';
        }

        // Top service
        const serviceCounts = {};
        allClients.forEach(c => {
            if (c.ultimo_servicio_nombre) {
                serviceCounts[c.ultimo_servicio_nombre] = (serviceCounts[c.ultimo_servicio_nombre] || 0) + 1;
            }
        });
        const topService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('kpiTopService').textContent = topService
            ? topService[0].split(' ').slice(0, 2).join(' ')
            : '—';
    }

    renderClientsTable(clients) {
        document.getElementById('clientsLoading').hidden = true;

        if (clients.length === 0) {
            document.getElementById('clientsTable').hidden = true;
            document.getElementById('clientsEmpty').hidden = false;
            return;
        }

        document.getElementById('clientsEmpty').hidden = true;
        document.getElementById('clientsTable').hidden = false;

        const tbody = document.getElementById('clientsTableBody');
        tbody.innerHTML = clients.map(c => {
            const visitas = c.total_visitas || 0;
            const frecuencia = this._clientFrequencyBadge(c.ultima_visita);
            const initials = (c.nombre || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
            const cancelBadge = c.cancelaciones_tardias > 0
                ? `<span class="client-cancel-badge" title="${c.cancelaciones_tardias} cancelación(es) tardía(s)">⚠️ ${c.cancelaciones_tardias}</span>`
                : '';
            const servColor = this._getServiceColor(c.ultimo_servicio_id || '');
            const ultimaVisitaStr = c.ultima_visita
                ? this._formatClientDate(c.ultima_visita)
                : c._pending ? '<span class="text-muted">Sin completar</span>' : '<span class="text-muted">—</span>';

            return `<tr class="client-row" data-phone="${c.telefono}">
                <td>
                    <div class="client-row-name">
                        <div class="client-avatar">${initials}</div>
                        <div>
                            <div class="client-name-text">${c.nombre} ${cancelBadge}</div>
                            <div class="client-phone-text">${c.telefono}</div>
                        </div>
                    </div>
                </td>
                <td>${ultimaVisitaStr}</td>
                <td>
                    <div class="client-visits">
                        <span class="client-visits-num">${visitas}</span>
                        ${this._visitStars(visitas)}
                    </div>
                </td>
                <td>
                    ${c.ultimo_servicio_nombre
                        ? `<span class="client-service-tag" style="border-left:3px solid ${servColor}">${c.ultimo_servicio_nombre}</span>`
                        : '<span class="text-muted">—</span>'}
                </td>
                <td>${frecuencia}</td>
                <td>
                    <div class="client-actions">
                        <button class="btn-small btn-cita" onclick="adminPanel.openNewAppointmentForClient(${JSON.stringify(c).replace(/"/g, '&quot;')})">+ Cita</button>
                        <button class="btn-small btn-perfil" onclick="adminPanel.openClientProfile('${c.telefono}')">Ver</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // Row click → profile
        tbody.querySelectorAll('.client-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this.openClientProfile(row.dataset.phone);
            });
        });
    }

    _clientFrequencyBadge(ultimaVisita) {
        if (!ultimaVisita) return '<span class="freq-badge freq-new">Nueva</span>';
        const days = Math.floor((Date.now() - new Date(ultimaVisita + 'T12:00:00')) / 86400000);
        if (days <= 30) return `<span class="freq-badge freq-active">Activa</span>`;
        if (days <= 90) return `<span class="freq-badge freq-medium">Regular</span>`;
        return `<span class="freq-badge freq-inactive">Inactiva</span>`;
    }

    _visitStars(n) {
        if (n === 0) return '';
        const stars = Math.min(Math.ceil(n / 3), 5);
        return `<span class="visit-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span>`;
    }

    _formatClientDate(dateStr) {
        const d = new Date(dateStr + 'T12:00:00');
        const days = Math.floor((Date.now() - d) / 86400000);
        if (days === 0) return 'Hoy';
        if (days === 1) return 'Ayer';
        if (days < 7) return `Hace ${days} días`;
        if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`;
        if (days < 365) return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    async openClientProfile(phone) {
        const dbClient = window.supabaseInstance;
        if (!dbClient) return;

        // Find client data from already loaded list
        const clientData = (this._clientsData || []).find(c => c.telefono === phone) || { telefono: phone, nombre: '—' };

        // Fetch full reservation history
        const { data: historial } = await dbClient
            .from('reservations')
            .select('id, date, time, service_name, status, duration_minutes, precio_estimado, notas')
            .eq('customer_phone', phone)
            .order('date', { ascending: false })
            .limit(50);

        const totalGastado = (historial || [])
            .filter(r => r.status === 'completed' && r.precio_estimado)
            .reduce((s, r) => s + parseFloat(r.precio_estimado || 0), 0);

        const servicioFav = (() => {
            const cnt = {};
            (historial || []).filter(r => r.status === 'completed').forEach(r => {
                if (r.service_name) cnt[r.service_name] = (cnt[r.service_name] || 0) + 1;
            });
            return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        })();

        const header = document.getElementById('clientModalHeader');
        const body = document.getElementById('clientModalBody');
        const footer = document.getElementById('clientModalFooter');

        const initials = (clientData.nombre || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        const freq = this._clientFrequencyBadge(clientData.ultima_visita);

        header.innerHTML = `
            <div class="client-profile-header">
                <div class="client-avatar client-avatar-lg">${initials}</div>
                <div class="client-profile-info">
                    <h2>${clientData.nombre}</h2>
                    <div class="client-profile-meta">
                        <a href="tel:${phone}" class="client-meta-item">📞 ${phone}</a>
                        ${clientData.email ? `<span class="client-meta-item">📧 ${clientData.email}</span>` : ''}
                        ${freq}
                    </div>
                </div>
            </div>`;

        body.innerHTML = `
            <!-- Stats -->
            <div class="client-profile-stats">
                <div class="cp-stat">
                    <span class="cp-stat-value">${clientData.total_visitas || 0}</span>
                    <span class="cp-stat-label">Visitas completadas</span>
                </div>
                <div class="cp-stat">
                    <span class="cp-stat-value">${clientData.ultima_visita ? this._formatClientDate(clientData.ultima_visita) : '—'}</span>
                    <span class="cp-stat-label">Última visita</span>
                </div>
                <div class="cp-stat">
                    <span class="cp-stat-value">${servicioFav}</span>
                    <span class="cp-stat-label">Servicio favorito</span>
                </div>
                <div class="cp-stat ${clientData.cancelaciones_tardias > 0 ? 'cp-stat-warn' : ''}">
                    <span class="cp-stat-value">${clientData.cancelaciones_tardias || 0}</span>
                    <span class="cp-stat-label">Cancelaciones tardías</span>
                </div>
                ${totalGastado > 0 ? `
                <div class="cp-stat">
                    <span class="cp-stat-value">${totalGastado.toFixed(0)}€</span>
                    <span class="cp-stat-label">Total gastado</span>
                </div>` : ''}
            </div>

            <!-- Notas -->
            <div class="client-notes-section">
                <label class="client-notes-label">Notas internas</label>
                <textarea id="clientNotesInput" class="client-notes-input" rows="2"
                    placeholder="Observaciones sobre la clienta...">${clientData.notas || ''}</textarea>
                <button class="btn-small" onclick="adminPanel.saveClientNotes('${phone}')">Guardar notas</button>
            </div>

            <!-- Historial -->
            <div class="client-history">
                <h4 class="client-history-title">Historial de citas <span class="history-count">${(historial || []).length}</span></h4>
                <div class="client-history-list">
                    ${(historial || []).length === 0
                        ? '<p class="text-muted" style="padding:12px 0">Sin citas registradas</p>'
                        : (historial || []).map(r => {
                            const color = this._getServiceColor(r.servicio_id || '');
                            const precio = r.precio_estimado ? `${parseFloat(r.precio_estimado).toFixed(0)}€` : '';
                            return `<div class="history-item">
                                <div class="history-item-dot" style="background:${color}"></div>
                                <div class="history-item-info">
                                    <span class="history-item-date">${this.formatDate(r.date)} · ${r.time}</span>
                                    <span class="history-item-service">${r.service_name || '—'}</span>
                                    ${r.notas ? `<span class="history-item-notes">${r.notas}</span>` : ''}
                                </div>
                                <div class="history-item-right">
                                    <span class="status-badge ${r.status}">${this.getStatusText(r.status)}</span>
                                    ${precio ? `<span class="history-item-price">${precio}</span>` : ''}
                                </div>
                            </div>`;
                        }).join('')}
                </div>
            </div>`;

        footer.innerHTML = `
            <button class="btn-secondary" onclick="adminPanel.closeModal('clientModal')">Cerrar</button>
            <button class="btn-primary" onclick="adminPanel.openNewAppointmentForClient(${JSON.stringify(clientData).replace(/"/g, '&quot;')});adminPanel.closeModal('clientModal')">
                + Nueva Cita
            </button>`;

        document.getElementById('clientModal').hidden = false;
    }

    async saveClientNotes(phone) {
        const notes = document.getElementById('clientNotesInput')?.value || '';
        const client = window.supabaseInstance;
        if (!client) return;

        try {
            const { error } = await client
                .from('clientes')
                .update({ notas: notes, updated_at: new Date().toISOString() })
                .eq('telefono', phone);

            if (error) throw error;

            // Update local cache
            const local = (this._clientsData || []).find(c => c.telefono === phone);
            if (local) local.notas = notes;

            this.showToast('Notas guardadas', 'success');
        } catch (err) {
            this.showToast('Error al guardar notas: ' + err.message, 'error');
        }
    }

    openNewAppointmentForClient(clientData) {
        this.openNewAppointmentModal();
        setTimeout(() => {
            const nameEl = document.getElementById('newClientName');
            const phoneEl = document.getElementById('newClientPhone');
            const emailEl = document.getElementById('newClientEmail');
            if (nameEl) nameEl.value = clientData.nombre || '';
            if (phoneEl) phoneEl.value = clientData.telefono || '';
            if (emailEl) emailEl.value = clientData.email || '';
        }, 80);
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
