/**
 * Peluquería Cool - Premium One-Page Website
 * Sistema de Video/Animación controlado por scroll
 * 
 * IMPORTANTE: Para el efecto perfecto de "pausar y continuar",
 * usa un archivo de video (.mp4 o .webm) en lugar de WebP.
 * Con video, el currentTime se vincula exactamente al scroll.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ===== ELEMENTOS DEL DOM =====
    const loader = document.getElementById('loader');
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');
    const heroVideo = document.getElementById('heroVideo');
    const heroImage = document.getElementById('heroImage');
    const heroWrapper = document.querySelector('.hero-wrapper');
    const fadeElements = document.querySelectorAll('.fade-in-up');
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorRing = document.querySelector('.cursor-ring');

    // ===== CURSOR PERSONALIZADO =====
    if (cursorDot && cursorRing) {
        let mouseX = 0;
        let mouseY = 0;
        let ringX = 0;
        let ringY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Punto sigue instantáneo
            cursorDot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
        });

        // Loop de animación para el anillo (suavizado)
        const animateRing = () => {
            // Lerp (interpolación lineal) para suavidad
            ringX += (mouseX - ringX) * 0.15;
            ringY += (mouseY - ringY) * 0.15;

            cursorRing.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
            requestAnimationFrame(animateRing);
        };
        animateRing();

        // Efecto hover en elementos interactivos
        const interactiveElements = document.querySelectorAll('a, button, .nav-toggle, .cta-glass, .cta-solid, input, select');
        interactiveElements.forEach(el => {
            el.addEventListener('mouseenter', () => cursorRing.classList.add('hover'));
            el.addEventListener('mouseleave', () => cursorRing.classList.remove('hover'));
        });
    }

    // ===== CONFIGURACIÓN =====
    const VIDEO_DURATION = 8; // Duración del video en segundos
    const USE_VIDEO = heroVideo && heroVideo.querySelector('source'); // Detectar si hay video

    // ===== LOADER =====
    const hideLoader = () => {
        setTimeout(() => {
            loader.classList.add('hidden');
            document.body.style.overflow = 'auto';
        }, 2400);
    };

    document.body.style.overflow = 'hidden';

    if (document.readyState === 'complete') {
        hideLoader();
    } else {
        window.addEventListener('load', hideLoader);
    }

    // ===== SISTEMA DE VIDEO CON VELOCIDAD VARIABLE =====
    // La velocidad del video se ajusta según la velocidad del scroll
    if (USE_VIDEO) {
        // Ocultar imagen fallback
        if (heroImage) heroImage.style.display = 'none';

        // Configurar video
        heroVideo.pause();
        heroVideo.currentTime = 0;

        let scrollTimeout = null;
        let isPlaying = false;
        let lastScrollY = window.scrollY;
        let lastScrollTime = performance.now();
        let currentPlaybackRate = 1.0;

        const MIN_RATE = 0.5;
        const MAX_RATE = 3.0;
        const BASE_VELOCITY = 500; // pixels/segundo como referencia

        const playVideo = () => {
            if (!isPlaying && heroVideo.paused) {
                heroVideo.play().catch(() => { });
                isPlaying = true;
            }
        };

        const pauseVideo = () => {
            if (isPlaying && !heroVideo.paused) {
                heroVideo.pause();
                isPlaying = false;
            }
        };

        const updatePlaybackRate = (velocity) => {
            // Calcular rate proporcional a la velocidad del scroll
            let rate = Math.abs(velocity) / BASE_VELOCITY;
            rate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));

            // Suavizar el cambio de velocidad
            currentPlaybackRate += (rate - currentPlaybackRate) * 0.3;
            heroVideo.playbackRate = currentPlaybackRate;
        };

        const onScroll = () => {
            const now = performance.now();
            const deltaTime = (now - lastScrollTime) / 1000; // en segundos
            const deltaScroll = Math.abs(window.scrollY - lastScrollY);
            const velocity = deltaTime > 0 ? deltaScroll / deltaTime : 0;

            lastScrollY = window.scrollY;
            lastScrollTime = now;

            // Verificar si estamos en el hero
            const heroRect = heroWrapper.getBoundingClientRect();
            const inHero = heroRect.top <= 0 && heroRect.bottom > window.innerHeight;

            if (inHero) {
                updatePlaybackRate(velocity);
                playVideo();

                // Pausar después de dejar de hacer scroll
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(pauseVideo, 150);
            } else if (heroRect.top > 0) {
                // Antes del hero - reiniciar
                heroVideo.currentTime = 0;
                pauseVideo();
            } else {
                // Después del hero - mantener al final
                pauseVideo();
            }
        };

        window.addEventListener('scroll', onScroll, { passive: true });

        // Cuando el video termina, mantenerlo en el último frame
        heroVideo.addEventListener('ended', () => {
            heroVideo.currentTime = heroVideo.duration - 0.1;
            pauseVideo();
        });

        console.log('🎬 Modo VIDEO con velocidad variable activado');
    }

    // ===== EFECTO CASCADA EN TEXTO DEL HERO =====
    // Texto empieza invisible/arriba y APARECE conforme se hace scroll
    const heroTitle = document.querySelector('.hero-title');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const heroDescription = document.querySelector('.hero-description');
    const heroCtas = document.querySelector('.hero-ctas');

    const cascadeElements = [
        { el: heroTitle, threshold: 0.02 },      // Aparece primero
        { el: heroSubtitle, threshold: 0.05 },   // Aparece segundo
        { el: heroDescription, threshold: 0.08 }, // Aparece tercero
        { el: heroCtas, threshold: 0.12 }         // Aparece último
    ];

    // Estado inicial: ocultos y desplazados hacia arriba
    cascadeElements.forEach(({ el }) => {
        if (el) {
            el.style.transform = 'translateY(-50px)';
            el.style.opacity = '0';
        }
    });

    const updateCascade = () => {
        if (!heroWrapper) return;

        const heroRect = heroWrapper.getBoundingClientRect();
        const scrollProgress = Math.max(0, -heroRect.top / (heroWrapper.offsetHeight - window.innerHeight));

        cascadeElements.forEach(({ el, threshold }) => {
            if (!el) return;

            // Calcular progreso para este elemento
            const elementProgress = Math.min(1, Math.max(0, (scrollProgress - threshold) / 0.08));

            // De -50px a 0px, de opacity 0 a 1
            const translateY = -50 + (elementProgress * 50);
            const opacity = elementProgress;

            el.style.transform = `translateY(${translateY}px)`;
            el.style.opacity = opacity;
        });
    };

    window.addEventListener('scroll', updateCascade, { passive: true });

    // ===== SCROLLYTELLING: EL SALÓN =====
    const salonSection = document.getElementById('salon');
    const salonVideo = document.getElementById('salonVideo');
    // Nuevas Referencias para Cascada/Parallax
    const salonTextCol = document.querySelector('.salon-text-col');
    const salonGalleryCol = document.querySelector('.salon-gallery-col');

    if (salonSection && salonVideo) {
        console.log('🎬 Iniciando Scrollytelling para El Salón');

        salonVideo.pause();
        salonVideo.currentTime = 0;

        let scrollTimeout = null;
        let isPlaying = false;
        let lastScrollY = window.scrollY;
        let lastScrollTime = performance.now();
        let currentPlaybackRate = 1.0;

        // Reset inicial de estilos para cascada
        if (salonTextCol) { salonTextCol.style.opacity = '0'; salonTextCol.style.transform = 'translateY(20px)'; }
        if (salonGalleryCol) { salonGalleryCol.style.opacity = '0'; salonGalleryCol.style.transform = 'translateY(60px)'; }

        const MIN_RATE = 0.5;
        const MAX_RATE = 3.0;
        const BASE_VELOCITY = 500;

        const playSalonVideo = () => {
            if (!isPlaying && salonVideo.paused) {
                salonVideo.play().catch(() => { });
                isPlaying = true;
            }
        };

        const pauseSalonVideo = () => {
            if (isPlaying && !salonVideo.paused) {
                salonVideo.pause();
                isPlaying = false;
            }
        };

        const updateSalonRate = (velocity) => {
            let rate = Math.abs(velocity) / BASE_VELOCITY;
            rate = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
            currentPlaybackRate += (rate - currentPlaybackRate) * 0.3;
            salonVideo.playbackRate = currentPlaybackRate;
        };

        const onSalonScroll = () => {
            const now = performance.now();
            const deltaTime = (now - lastScrollTime) / 1000;
            const deltaScroll = Math.abs(window.scrollY - lastScrollY);
            const velocity = deltaTime > 0 ? deltaScroll / deltaTime : 0;

            // Verificar si estamos en la sección Salón
            const rect = salonSection.getBoundingClientRect();

            // Calculo para Parallax y Cascada
            // El contenido se "pega" cuando rect.top <= 0
            // Usamos un pequeño offset para empezar la animación un poco antes o justo al llegar
            const scrollDistance = rect.height - window.innerHeight;
            const stickyProgress = Math.min(1, Math.max(0, -rect.top / scrollDistance));

            // Lógica de Visibilidad Global (para reproducir video)
            const inSection = rect.top <= window.innerHeight && rect.bottom >= 0;

            if (inSection) {
                updateSalonRate(velocity);
                playSalonVideo();

                // === EFECTO DE CASCADA Y PARALLAX ===
                // 1. Opacidad (Aparecer rápido al inicio del sticky)
                const opacity = Math.min(1, stickyProgress * 8); // Aparece en el primer 12% del scroll

                // 2. Movimiento Parallax (Se mueven diferente mientras scrolleas)
                // Texto se mueve poco, Galería se mueve más (profundidad)
                const textY = 20 - (stickyProgress * 40); // De +20px a -20px
                const galleryY = 60 - (stickyProgress * 120); // De +60px a -60px

                if (salonTextCol) {
                    salonTextCol.style.opacity = opacity;
                    salonTextCol.style.transform = `translateY(${textY}px)`;
                }

                if (salonGalleryCol) {
                    salonGalleryCol.style.opacity = opacity;
                    salonGalleryCol.style.transform = `translateY(${galleryY}px)`;
                }

                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(pauseSalonVideo, 150);
            } else {
                pauseSalonVideo();
            }

            lastScrollY = window.scrollY;
            lastScrollTime = now;
        };

        window.addEventListener('scroll', onSalonScroll, { passive: true });
    }

    // ===== FALLBACK: SISTEMA WEBP (LIMITADO) =====
    if (!USE_VIDEO && heroImage) {
        console.log('🖼️ Modo WebP activado (limitado) - Considera usar video para mejor experiencia');

        // Variables para control de WebP
        let isScrolling = false;
        let scrollTimeout = null;
        let frozenFrame = null;

        // Crear canvas para congelar frames
        const freezeCanvas = document.createElement('canvas');
        freezeCanvas.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
            display: none;
            pointer-events: none;
        `;
        heroImage.parentElement.insertBefore(freezeCanvas, heroImage.nextSibling);

        const freezeCurrentFrame = () => {
            if (!heroImage.complete || heroImage.naturalWidth === 0) return;

            try {
                freezeCanvas.width = heroImage.naturalWidth;
                freezeCanvas.height = heroImage.naturalHeight;
                const ctx = freezeCanvas.getContext('2d');
                ctx.drawImage(heroImage, 0, 0);

                // Mostrar canvas congelado, ocultar animación
                freezeCanvas.style.display = 'block';
                heroImage.style.visibility = 'hidden';
            } catch (e) {
                console.warn('No se pudo congelar frame:', e);
            }
        };

        const unfreezeAnimation = () => {
            // Ocultar canvas, mostrar animación
            freezeCanvas.style.display = 'none';
            heroImage.style.visibility = 'visible';
        };

        const handleScroll = () => {
            if (!isScrolling) {
                isScrolling = true;
                unfreezeAnimation();
            }

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
                freezeCurrentFrame();
            }, 100);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        // Congelar al inicio después del loader
        setTimeout(freezeCurrentFrame, 3000);
    }

    // ===== NAVBAR SCROLL EFFECT =====
    const handleNavbarScroll = () => {
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', handleNavbarScroll, { passive: true });

    // ===== MOBILE MENU TOGGLE =====
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
    });

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            navMenu.classList.remove('active');
        });
    });

    // ===== SMOOTH SCROLL =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if (targetElement) {
                const navbarHeight = navbar.offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navbarHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ===== ACTIVE NAV LINK =====
    const sections = document.querySelectorAll('section[id]');

    const updateActiveNavLink = () => {
        const scrollPos = window.scrollY + navbar.offsetHeight + 100;

        // Ajuste para hero largo (480vh -> ~4.8 pantallas)
        // El contenido real empieza después de 480vh de scroll virtual
        if (window.scrollY < window.innerHeight * 4.3) {
            navLinks.forEach(link => link.classList.remove('active'));
            return;
        }

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    };

    window.addEventListener('scroll', updateActiveNavLink, { passive: true });

    // ===== FADE IN ANIMATIONS =====
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

    // ===== FORMULARIO DE RESERVAS =====
    const reservaForm = document.getElementById('reservaForm');

    if (reservaForm) {
        reservaForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const submitBtn = this.querySelector('.form-submit');
            const originalText = submitBtn.innerHTML;

            submitBtn.innerHTML = '<span>¡Solicitud Enviada!</span>';
            submitBtn.style.background = '#2ecc71';
            submitBtn.disabled = true;

            setTimeout(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.style.background = '';
                submitBtn.disabled = false;
                this.reset();
            }, 3000);
        });
    }

    console.log('✨ Cool System V3 - Scroll-Controlled Animation Ready');
});
