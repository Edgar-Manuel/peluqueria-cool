/**
 * Peluquería Cool - Scrollytelling System
 * Implementación eficiente usando secuencia de imágenes en Canvas (Zero Dependencies)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ===== CONFIGURACIÓN =====
    const HERO_CONFIG = {
        path: 'assets/hero-sequence/split-hero/',
        count: 192,
        ext: 'gif'
    };

    // SALON - Secuencia de 192 frames
    const SALON_CONFIG = {
        path: 'assets/salon-sequence/split-salon/',
        count: 192,
        ext: 'gif'
    };

    // ===== CLASE DE SECUENCIA DE IMÁGENES =====
    class ImageSequence {
        constructor(canvasId, config) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;

            this.ctx = this.canvas.getContext('2d');
            this.config = config;
            this.images = [];
            this.loadedCount = 0;
            this.isReady = false;
            this.lastFrameIndex = -1;

            this.init();
        }

        init() {
            this.resize();
            window.addEventListener('resize', () => this.resize());
            this.loadImages();
        }

        loadImages() {
            console.log(`🚀 Iniciando carga de ${this.config.count} frames para ${this.canvas.id}`);

            for (let i = 1; i <= this.config.count; i++) {
                const img = new Image();
                // Formato 0001, 0002, etc.
                const num = i.toString().padStart(4, '0');
                img.src = `${this.config.path}${num}.${this.config.ext}`;

                img.onload = () => {
                    this.loadedCount++;
                    if (this.loadedCount === this.config.count) {
                        console.log(`✅ Carga completa: ${this.canvas.id}`);
                        this.isReady = true;
                        this.render(0); // Renderizar primer frame

                        // Ocultar imagen fallback si existe
                        const fallback = document.querySelector(`.hero-image`);
                        if (fallback && this.canvas.id === 'heroCanvas') fallback.style.opacity = '0';
                    }
                };

                img.onerror = () => {
                    // Silenciosamente ignorar o loguear si faltan frames
                    // console.warn(`Frame faltante: ${img.src}`);
                };

                this.images.push(img);
            }
        }

        resize() {
            if (!this.canvas) return;
            const parent = this.canvas.parentElement;
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
            this.render(this.lastProgress || 0); // Re-renderizar
        }

        /**
         * Renderiza el frame basado en el progreso (0.0 a 1.0)
         */
        render(progress) {
            this.lastProgress = progress;
            if (!this.images.length) return;

            // Mapear progreso a índice de frame (0-based para el array, pero images son 1-indexed)
            let index = Math.floor(progress * (this.config.count - 1));
            index = Math.max(0, Math.min(this.config.count - 1, index));

            // SIEMPRE actualizar lastFrameIndex para tracking
            this.lastFrameIndex = index;

            // Si aún no están cargadas todas, intentar mostrar lo que tengamos o el frame específico
            const img = this.images[index];

            // Verificar que la imagen existe, está completa y NO está rota
            if (!img || !img.complete || img.naturalWidth === 0) return;

            // Lógica "object-fit: cover" para Canvas
            const fitCover = (img, canvas) => {
                const imgRatio = img.width / img.height;
                const canvasRatio = canvas.width / canvas.height;
                let drawW, drawH, offsetX, offsetY;

                if (canvasRatio > imgRatio) {
                    drawW = canvas.width;
                    drawH = canvas.width / imgRatio;
                    offsetX = 0;
                    offsetY = (canvas.height - drawH) / 2;
                } else {
                    drawW = canvas.height * imgRatio;
                    drawH = canvas.height;
                    offsetX = (canvas.width - drawW) / 2;
                    offsetY = 0;
                }

                return { x: offsetX, y: offsetY, w: drawW, h: drawH };
            };

            const params = fitCover(img, this.canvas);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, params.x, params.y, params.w, params.h);
        }
    }

    // ===== INICIALIZAR SECUENCIAS =====
    const heroSequence = new ImageSequence('heroCanvas', HERO_CONFIG);
    const salonSequence = new ImageSequence('salonCanvas', SALON_CONFIG);

    // ===== ELEMENTOS GENERALES =====
    const navbar = document.getElementById('navbar');
    const heroWrapper = document.querySelector('.hero-wrapper');
    const salonSection = document.getElementById('salon');

    // ===== LOOP DE ANIMACIÓN CENTRALIZADO (requestAnimationFrame) =====
    // Usamos esto en lugar de eventos 'scroll' separados para rendimiento
    let lastScrollY = window.scrollY;

    const animate = () => {
        const scrollY = window.scrollY;
        const layoutHeight = document.documentElement.scrollHeight - window.innerHeight;

        // 1. HERO SCROLL
        if (heroWrapper) {
            // El heroWrapper tiene altura 480vh y contiene un sticky de 100vh.
            // El sticky se "pega" cuando top=0 y "suelta" cuando bottom=viewport.
            // Para calcular el progreso usamos getBoundingClientRect para precisión.

            const wrapperHeight = heroWrapper.offsetHeight;
            const viewportHeight = window.innerHeight;
            const stickyDistance = wrapperHeight - viewportHeight; // Cuánto podemos scrollear dentro del sticky

            // Posición del wrapper respecto al viewport
            const rect = heroWrapper.getBoundingClientRect();

            // rect.top = 0 cuando el sticky empieza a pegarse
            // rect.top = -(stickyDistance) cuando el sticky se suelta

            // Progreso: 0 cuando rect.top >= 0, 1 cuando rect.top <= -stickyDistance
            // Esto funciona tanto hacia abajo como hacia arriba

            let heroProgress = -rect.top / stickyDistance;
            heroProgress = Math.max(0, Math.min(1, heroProgress));

            heroSequence.render(heroProgress);

            // Efecto Cascada Texto Hero
            updateHeroCascade(heroProgress);
        }

        // 2. SALON SCROLL
        if (salonSection) {
            const rect = salonSection.getBoundingClientRect();
            const start = rect.top; // Distancia desde el viewport top
            const height = salonSection.offsetHeight - window.innerHeight;

            // Calcular progreso cuando la sección entra en vista y se fija
            // La sección Salon es sticky. 
            // Progreso 0 cuando rect.top == 0 (empieza el sticky)
            // Progreso 1 cuando terminamos de scrollear la sección

            // Usamos la posición global para mayor estabilidad
            const salonTopAbsolute = salonSection.offsetTop;
            const scrollRelative = scrollY - salonTopAbsolute;

            let salonProgress = scrollRelative / height;
            salonProgress = Math.max(0, Math.min(1, salonProgress));

            // Solo renderizar si está visible o cerca
            if (scrollY > salonTopAbsolute - window.innerHeight && scrollY < salonTopAbsolute + salonSection.offsetHeight) {
                salonSequence.render(salonProgress);
                updateSalonParallax(salonProgress);
            }
        }

        // 3. NAVBAR
        if (scrollY > 50) navbar.classList.add('scrolled');
        else navbar.classList.remove('scrolled');

        lastScrollY = scrollY;
        requestAnimationFrame(animate);
    };

    // Iniciar loop
    requestAnimationFrame(animate);


    // ===== FUNCIONES AUXILIARES DE ANIMACIÓN =====

    // Hero Text Cascade
    const heroTitle = document.querySelector('.hero-title');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const heroDescription = document.querySelector('.hero-description');
    const heroCtas = document.querySelector('.hero-ctas');

    const initializeStyles = (el) => { if (el) { el.style.opacity = '0'; el.style.transform = 'translateY(-30px)'; } }
    [heroTitle, heroSubtitle, heroDescription, heroCtas].forEach(initializeStyles);

    function updateHeroCascade(progress) {
        // Umbrales para que aparezcan secuencialmente al scrollear
        // Ahora aparecen TARDE, casi al final del scroll (60% - 90%)
        const animateElement = (el, threshold) => {
            if (!el) return;
            // Normalizar progreso para este elemento (empieza en threshold, dura 0.10)
            let localProgress = (progress - threshold) / 0.10;
            localProgress = Math.max(0, Math.min(1, localProgress));

            el.style.opacity = localProgress;
            el.style.transform = `translateY(${-30 * (1 - localProgress)}px)`;
        };

        // Umbrales personalizados según preferencia
        animateElement(heroTitle, 0.38);       // Título aparece al 38%
        animateElement(heroSubtitle, 0.60);    // Subtítulo al 60%
        animateElement(heroDescription, 0.78); // Descripción al 78%
        animateElement(heroCtas, 0.86);        // Botones al 86%
    }

    // Salon Parallax
    const salonText = document.querySelector('.salon-text-col');
    const salonGallery = document.querySelector('.salon-gallery-col');

    function updateSalonParallax(progress) {
        if (salonText) {
            // Fade in + ligero movimiento
            let opacity = Math.min(1, progress * 5); // Aparece rápido
            salonText.style.opacity = opacity;
            salonText.style.transform = `translateY(${(1 - opacity) * 40}px)`;
        }

        if (salonGallery) {
            let opacity = Math.min(1, progress * 5);
            // Galería se mueve diferente para parallax
            salonGallery.style.opacity = opacity;
            salonGallery.style.transform = `translateY(${(1 - opacity) * 80}px)`;
        }
    }


    // ===== UTILS NO-CANVAS (Loader, Cursor, Forms) =====

    // Loader
    const loader = document.getElementById('loader');
    if (loader) {
        setTimeout(() => {
            loader.classList.add('hidden');
            document.body.style.overflow = 'auto';
            // Trigger inicial
        }, 2000);
    }

    // Mobile Nav
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navToggle.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }

    // Smooth Scroll Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const target = document.querySelector(targetId);
            if (target) {
                window.scrollTo({
                    top: target.offsetTop,
                    behavior: 'smooth'
                });
                // Cerrar menú si está abierto
                navToggle.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    });

    // ===== ERROR HANDLER (Pattern: Graceful Degradation) =====
    class ErrorHandler {
        static errors = [];

        static handle(error, context = 'General') {
            const errorObj = {
                message: error.message || error,
                context,
                timestamp: new Date().toISOString(),
                stack: error.stack || null
            };

            this.errors.push(errorObj);

            // Log pero no interrumpir
            console.error(`[${context}] Error:`, error);

            // Si es un error crítico de UI, mostrar mensaje amigable
            if (context === 'FormSubmission') {
                this.showUserFriendlyError('Hubo un problema al enviar el formulario. Intenta de nuevo.');
            }

            return errorObj;
        }

        static showUserFriendlyError(message) {
            // Crear toast notification
            const toast = document.createElement('div');
            toast.className = 'error-toast';
            toast.setAttribute('role', 'alert');
            toast.innerHTML = `
                <span class="toast-icon">⚠️</span>
                <span class="toast-message">${message}</span>
                <button class="toast-close" aria-label="Cerrar">&times;</button>
            `;

            document.body.appendChild(toast);

            // Auto-remove after 5s
            setTimeout(() => toast.remove(), 5000);

            // Manual close
            toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        }

        static getErrors() {
            return [...this.errors];
        }

        static clearErrors() {
            this.errors = [];
        }
    }

    // ===== FORM VALIDATOR CLASS =====
    class FormValidator {
        constructor(formElement, config) {
            this.form = formElement;
            this.config = config;
            this.errors = [];

            if (!this.form) return;

            this.fields = {
                nombre: this.form.querySelector('#nombre'),
                fecha: this.form.querySelector('#fecha'),
                hora: this.form.querySelector('#hora'),
                servicio: this.form.querySelector('#servicio'),
                telefono: this.form.querySelector('#telefono')
            };

            this.init();
        }

        init() {
            this.setupDateConstraints();
            this.setupRealTimeValidation();
            this.setupHoraUpdater();
        }

        setupDateConstraints() {
            const today = new Date();
            const minDate = new Date(today);
            minDate.setDate(today.getDate() + this.config.minAdvanceDays);

            const maxDate = new Date(today);
            maxDate.setDate(today.getDate() + this.config.maxAdvanceDays);

            this.fields.fecha.min = this.formatDate(minDate);
            this.fields.fecha.max = this.formatDate(maxDate);
        }

        formatDate(date) {
            return date.toISOString().split('T')[0];
        }

        setupRealTimeValidation() {
            Object.values(this.fields).forEach(field => {
                if (!field) return;

                field.addEventListener('blur', () => this.validateField(field));
                field.addEventListener('input', () => this.clearFieldError(field));
            });
        }

        setupHoraUpdater() {
            this.fields.fecha.addEventListener('change', () => {
                this.updateAvailableSlots();
            });
        }

        updateAvailableSlots() {
            const dateValue = this.fields.fecha.value;
            if (!dateValue) return;

            const date = new Date(dateValue + 'T00:00:00');
            const dayOfWeek = date.getDay();
            const schedule = this.config.weeklySchedule[dayOfWeek];

            // Limpiar opciones actuales
            const horaSelect = this.fields.hora;
            horaSelect.innerHTML = '<option value="">Seleccionar</option>';

            if (!schedule) {
                // Día cerrado
                horaSelect.innerHTML = '<option value="">Cerrado este día</option>';
                horaSelect.disabled = true;
                this.showFieldError(this.fields.fecha, 'El salón está cerrado este día. Elige otra fecha.');
                return;
            }

            // Verificar si es festivo
            if (this.config.holidays.includes(dateValue)) {
                horaSelect.innerHTML = '<option value="">Festivo - Cerrado</option>';
                horaSelect.disabled = true;
                this.showFieldError(this.fields.fecha, 'Este día es festivo. Elige otra fecha.');
                return;
            }

            horaSelect.disabled = false;
            this.clearFieldError(this.fields.fecha);

            // Añadir slots disponibles
            schedule.slots.forEach(slot => {
                const option = document.createElement('option');
                option.value = slot;
                option.textContent = slot;
                horaSelect.appendChild(option);
            });
        }

        validateField(field) {
            const value = field.value.trim();
            const name = field.name;
            let error = null;

            switch (name) {
                case 'nombre':
                    if (!value) error = 'El nombre es obligatorio';
                    else if (value.length < 2) error = 'El nombre debe tener al menos 2 caracteres';
                    break;
                case 'fecha':
                    if (!value) error = 'Selecciona una fecha';
                    else if (!this.isValidDate(value)) error = 'Fecha no disponible';
                    break;
                case 'hora':
                    if (!value) error = 'Selecciona una hora';
                    break;
                case 'servicio':
                    if (!value) error = 'Selecciona un servicio';
                    break;
                case 'telefono':
                    if (!value) error = 'El teléfono es obligatorio';
                    else if (!this.isValidPhone(value)) error = 'Formato de teléfono inválido';
                    break;
            }

            if (error) {
                this.showFieldError(field, error);
                return false;
            }

            this.clearFieldError(field);
            return true;
        }

        isValidDate(dateStr) {
            const date = new Date(dateStr + 'T00:00:00');
            const dayOfWeek = date.getDay();
            const schedule = this.config.weeklySchedule[dayOfWeek];

            if (!schedule) return false;
            if (this.config.holidays.includes(dateStr)) return false;

            return true;
        }

        isValidPhone(phone) {
            // Acepta formatos: +34 600 000 000, 600000000, 600 000 000
            const cleaned = phone.replace(/\s+/g, '').replace(/^\+/, '');
            return /^(34)?[6789]\d{8}$/.test(cleaned);
        }

        showFieldError(field, message) {
            this.clearFieldError(field);

            field.classList.add('field-error');

            const errorEl = document.createElement('span');
            errorEl.className = 'field-error-message';
            errorEl.textContent = message;
            errorEl.setAttribute('role', 'alert');
            errorEl.setAttribute('aria-live', 'polite');

            field.parentNode.appendChild(errorEl);
        }

        clearFieldError(field) {
            field.classList.remove('field-error');
            const existingError = field.parentNode.querySelector('.field-error-message');
            if (existingError) existingError.remove();
        }

        validateAll() {
            let isValid = true;
            this.errors = [];

            Object.values(this.fields).forEach(field => {
                if (field && !this.validateField(field)) {
                    isValid = false;
                }
            });

            return isValid;
        }

        getFormData() {
            return {
                nombre: this.fields.nombre.value.trim(),
                fecha: this.fields.fecha.value,
                hora: this.fields.hora.value,
                servicio: this.fields.servicio.value,
                servicioNombre: this.config.services[this.fields.servicio.value]?.name || '',
                telefono: this.fields.telefono.value.trim()
            };
        }
    }

    // ===== MODAL CONTROLLER =====
    class ModalController {
        constructor(modalId, config) {
            this.modal = document.getElementById(modalId);
            this.config = config;

            if (!this.modal) return;

            this.backdrop = this.modal.querySelector('.modal-backdrop');
            this.closeBtn = this.modal.querySelector('.modal-close');
            this.closeBtnSecondary = this.modal.querySelector('#closeModalBtn');
            this.whatsappBtn = this.modal.querySelector('#whatsappConfirmBtn');

            this.elements = {
                fecha: this.modal.querySelector('#modalFecha'),
                hora: this.modal.querySelector('#modalHora'),
                servicio: this.modal.querySelector('#modalServicio'),
                telefono: this.modal.querySelector('#modalTelefono')
            };

            this.previousFocus = null;
            this.init();
        }

        init() {
            this.closeBtn?.addEventListener('click', () => this.close());
            this.closeBtnSecondary?.addEventListener('click', () => this.close());
            this.backdrop?.addEventListener('click', () => this.close());

            // Cerrar con Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !this.modal.hidden) {
                    this.close();
                }
            });
        }

        open(data) {
            this.previousFocus = document.activeElement;

            // Formatear fecha para mostrar
            const fechaObj = new Date(data.fecha + 'T00:00:00');
            const fechaFormatted = fechaObj.toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            // Actualizar contenido
            this.elements.fecha.textContent = fechaFormatted;
            this.elements.hora.textContent = data.hora;
            this.elements.servicio.textContent = data.servicioNombre;
            this.elements.telefono.textContent = data.telefono;

            // Generar enlace de WhatsApp
            this.whatsappBtn.href = this.generateWhatsAppLink(data);

            // Mostrar modal
            this.modal.hidden = false;
            document.body.style.overflow = 'hidden';

            // Focus trap
            this.closeBtn.focus();
        }

        close() {
            this.modal.hidden = true;
            document.body.style.overflow = '';

            // Restaurar focus previo
            if (this.previousFocus) {
                this.previousFocus.focus();
            }
        }

        generateWhatsAppLink(data) {
            const fechaObj = new Date(data.fecha + 'T00:00:00');
            const fechaText = fechaObj.toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
            });

            const message = `¡Hola! 👋 Me gustaría confirmar mi cita:\n\n` +
                `📅 *Fecha:* ${fechaText}\n` +
                `🕐 *Hora:* ${data.hora}\n` +
                `✨ *Servicio:* ${data.servicioNombre}\n` +
                `👤 *Nombre:* ${data.nombre}\n` +
                `📞 *Teléfono:* ${data.telefono}\n\n` +
                `¡Gracias! 💇`;

            const encodedMessage = encodeURIComponent(message);
            return `https://wa.me/${this.config.whatsappNumber}?text=${encodedMessage}`;
        }
    }

    // ===== FORM SUBMISSION =====
    const form = document.getElementById('reservaForm');
    let formValidator, modalController;

    if (form && typeof SCHEDULE_CONFIG !== 'undefined') {
        formValidator = new FormValidator(form, SCHEDULE_CONFIG);
        modalController = new ModalController('confirmationModal', SCHEDULE_CONFIG);

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            try {
                if (!formValidator.validateAll()) {
                    // Shake animation en botón
                    const btn = form.querySelector('.form-submit');
                    btn.classList.add('shake');
                    setTimeout(() => btn.classList.remove('shake'), 500);
                    return;
                }

                const data = formValidator.getFormData();

                // Mostrar modal de confirmación
                modalController.open(data);

                // Reset form después de mostrar modal
                setTimeout(() => form.reset(), 500);
            } catch (error) {
                ErrorHandler.handle(error, 'FormSubmission');
            }
        });
    } else if (form) {
        // Fallback si no hay config
        console.warn('⚠️ SCHEDULE_CONFIG not loaded. Form validation limited.');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = form.querySelector('button');
            const original = btn.innerHTML;
            btn.innerHTML = '¡Enviado!';
            btn.style.background = '#4CAF50';
            setTimeout(() => {
                btn.innerHTML = original;
                btn.style.background = '';
                form.reset();
            }, 3000);
        });
    }

    // Cursor
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorRing = document.querySelector('.cursor-ring');
    if (cursorDot && cursorRing) {
        let mouseX = 0, mouseY = 0;
        let ringX = 0, ringY = 0;
        window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

        const updateCursor = () => {
            cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;

            ringX += (mouseX - ringX) * 0.15;
            ringY += (mouseY - ringY) * 0.15;
            cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
            requestAnimationFrame(updateCursor);
        };
        updateCursor();
    }

    // ===== FADE IN ANIMATIONS (IntersectionObserver) =====
    const fadeElements = document.querySelectorAll('.fade-in-up');

    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -100px 0px',
        threshold: 0.1
    };

    const observerCallback = (entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    fadeElements.forEach(el => observer.observe(el));

    console.log('✨ Cool System V4 - Scrollytelling Ready');
});
