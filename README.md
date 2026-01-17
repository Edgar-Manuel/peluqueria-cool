# ✂️ Peluquería Cool - Landing Page Premium

Bienvenido a **Peluquería Cool**, una experiencia web inmersiva para salones de belleza de alto nivel. Este proyecto utiliza técnicas avanzadas de **Scrollytelling** para guiar al usuario a través de una narrativa visual mientras desplaza la página.

---

## 🚀 Inicio Rápido

Este es un proyecto estático. No necesitas instalar bases de datos ni servidores complejos.

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/tu-usuario/peluqueria-cool.git
    ```
2.  **Abrir el proyecto**:
    Simplemente abre el archivo `index.html` en tu navegador (Chrome o Brave recomendados por su rendimiento con Canvas).
3.  **Desarrollo Local**:
    Si quieres una experiencia más fluida (como la recarga en vivo), te recomendamos usar la extensión **Live Server** en VS Code.

---

## 🎨 Personalización de Secuencias (The Secret Sauce)

El corazón de este sitio son las secuencias de imágenes que se animan según el scroll. Hay dos secciones principales:
- **Hero**: `assets/hero-sequence/split-hero/` (192 frames)
- **Salón**: `assets/salon-sequence/split-salon/` (192 frames)

### ¿Cómo crear tu propia secuencia?

Si quieres cambiar los visuales actuales por los de tu propio producto o modelo, sigue estos pasos inspirados en el flujo de trabajo de IA moderna:

1.  **Genera el Video**:
    - Utiliza herramientas como **Kling AI**, **labs.google/flow** o **Runway Gen-3** para crear un video cinemático de alta calidad (5-10 segundos).
    - Asegúrate de que el movimiento sea fluido y consistente.
2.  **Convierte a Frames**:
    - Ve a [EZGIF - Video to JPG](https://ezgif.com/video-to-jpg) o usa una herramienta similar.
    - Sube tu video y configúralo a **25 o 30 FPS**.
    - Descarga el ZIP con todos los frames.
3.  **Renombra y Organiza**:
    - El script espera un formato de 4 dígitos: `0001.gif`, `0002.gif`... hasta el final.
    - Tip: Puedes usar herramientas de renombrado masivo si tus archivos tienen nombres distintos.
4.  **Actualiza el Código**:
    - Abre `script.js` y localiza las constantes `HERO_CONFIG` o `SALON_CONFIG`.
    - Ajusta los valores si cambiaste el número de frames o el formato:
    ```javascript
    const HERO_CONFIG = {
        path: 'assets/hero-sequence/tu-carpeta/',
        count: 120, // Cambia esto al número total de imágenes
        ext: 'webp' // Puedes usar webp, jpg o png
    };
    ```

### ¿Por qué usamos Canvas en lugar de Video?
A diferencia de un video que se reproduce solo, el uso de frames en un `Canvas` nos permite sincronizar cada píxel con la posición exacta del dedo del usuario en el scroll, creando una sensación táctil y profesional ("Premium Feel").

---

## 🛠️ Estructura del Proyecto

- `index.html`: Estructura semántica y contenedores de Canvas.
- `styles.css`: Sistema de diseño basado en variables, modo oscuro y Glassmorphism.
- `script.js`: El motor de scrollytelling. Controla la carga de imágenes y la lógica del scroll centralizada.
- `assets/`: Galería de personal, lookbook y secuencias de animación.

---

## ✨ Características Premium
- **Zero Dependencies**: Código vanilla JS puro para máxima velocidad.
- **Object-Fit Cover en Canvas**: Las secuencias siempre cubren la pantalla sin deformarse.
- **Micro-interacciones**: Cursor personalizado y efectos parallax en textos.
- **Rendimiento Optimizado**: Uso de `requestAnimationFrame` para animaciones ultra suaves a 60fps.

---

## �️ Personalización de Imágenes Estáticas

Además de las secuencias animadas, puedes personalizar fácilmente las fotos fijas del sitio sustituyendo los archivos en las siguientes carpetas:

### 👥 Equipo (**assets/staff/**)
Sustituye las fotos de los estilistas manteniendo los nombres de archivo para evitar tocar el código:
- `andrea.png`, `carlos.png`, `laura.png`, `miguel.png`
- **Tip**: Usa imágenes con fondo neutro o desenfocado para mantener la estética premium.

### 🏛️ Galería del Salón (**assets/salon-gallery/**)
Cambia las imágenes que se muestran sobre el video del salón:
- `main.png`: Imagen principal.
- `ambient.png`: Imagen de ambiente.
- `detail.png`: Imagen de detalle.

### 📖 Lookbook (**assets/lookbook/**)
Actualiza la galería de trabajos realizados:
- Archivos del `01.png` al `06.png`.
- **Recomendación**: Usa fotos con una relación de aspecto consistente para que la cuadrícula se vea perfecta.

> [!IMPORTANT]
> **Formato sugerido**: Aunque el proyecto usa `.png`, te recomendamos usar `.webp` para una carga más rápida, solo asegúrate de actualizar la extensión en el archivo `index.html` si lo haces.

---

## �📅 Opciones de Reservas

Puedes adaptar la sección de reservas según tus necesidades. Aquí tienes las opciones más comunes:

### 🟢 Opción 1: EmailJS (Recomendada para empezar)
El formulario actual se puede conectar fácilmente para enviar emails reales a tu correo.
- ✅ **Gratis**: Hasta 200 emails/mes.
- ✅ **Sin Backend**: Implementación rápida en 10 min.
- ❌ **Gestión Manual**: Debes responder tú mismo a los clientes.

### 🟡 Opción 2: Calendly / SimplyBook.me
Ideal para una experiencia profesional automatizada.
- ✅ **Calendario Visual**: Los clientes eligen día y hora según tu disponibilidad real.
- ✅ **Automatización**: Confirmaciones y recordatorios automáticos.
- ✅ **Sincronización**: Compatible con Google Calendar.
- ❌ **Branding**: La versión gratuita incluye el logo del servicio.

### 🟠 Opción 3: WhatsApp Business
La forma más directa y familiar de cerrar citas.
- ✅ **Extrema Simplicidad**: Solo un botón que abre el chat con un mensaje pre-rellenado.
- ✅ **Contacto Directo**: Conversas directamente con el cliente.
- ✅ **Gratis**: Sin límites de mensajes.
- ❌ **Desorden**: No hay un calendario automático que bloquee horas.

### 🔴 Opción 4: Sistema Propio con Backend
Para negocios con gran volumen que necesitan control total.
- ✅ **Control Total**: Sin marcas externas ni límites de terceros.
- ✅ **Base de Datos**: Gestión avanzada de clientes y fidelización.
- ❌ **Complejidad**: Requiere un servidor (Node.js/Python) y base de datos (MongoDB/SQL).
- ❌ **Coste**: Mayor tiempo de desarrollo y posible coste de hosting.

---

## 🌐 Despliegue

Para que el mundo vea tu creación, puedes subirlo gratis a **Netlify** o **Vercel**:

1.  Arrastra la carpeta del proyecto a [Netlify Drop](https://app.netlify.com/drop).
2.  ¡Listo! Tendrás una URL pública en segundos.

---

Desarrollado para quienes creen que una peluquería no es solo un corte, es una experiencia artística. 💇‍♂️✨
