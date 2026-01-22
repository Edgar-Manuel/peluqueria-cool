# Panel de Administración - Diseño

> **Para Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Fecha:** 2026-01-18  
**Estado:** ✅ Aprobado

---

## Resumen Ejecutivo

Sistema de administración para Peluquería Cool que permite a la dueña gestionar reservas, pedidos y productos desde un panel visual con calendario, métricas y notificaciones automáticas.

---

## Arquitectura

### Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Frontend | Vanilla HTML/CSS/JS |
| Base de datos | Supabase (PostgreSQL) |
| Autenticación | Supabase Auth |
| Pagos | Stripe Checkout |
| Emails | Resend API |
| WhatsApp | Twilio (opcional) |

### Estructura de Archivos

```
peluqueria-cool/
├── index.html                 # Landing pública
├── admin.html                 # Panel de administración
├── styles.css                 # Estilos públicos
├── admin.css                  # Estilos del panel
├── script.js                  # JS público
├── admin.js                   # JS del panel
├── js/
│   ├── supabase-client.js     # Conexión a Supabase
│   ├── auth.js                # Login/Logout
│   ├── reservations.js        # CRUD reservas
│   ├── orders.js              # CRUD pedidos
│   ├── products.js            # CRUD productos
│   └── notifications.js       # Sistema de alertas
├── schedule-config.js         # Configuración horarios
├── .env                       # Variables de entorno
└── .env.example               # Template de variables
```

---

## Layout del Panel

```
┌──────────────────────────────────────────────────────────────────────┐
│  NAVBAR (Logo + Notificaciones + Perfil Admin)                       │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  SIDEBAR   │              CONTENIDO PRINCIPAL                        │
│            │                                                         │
│  ◉ Dashboard│  ┌─────────────────────────────────────────────────┐   │
│  ○ Reservas │  │  MÉTRICAS RÁPIDAS (4 cards)                     │   │
│  ○ Pedidos  │  │  [Hoy] [Pendientes] [Semana] [Ingresos]         │   │
│  ○ Productos│  └─────────────────────────────────────────────────┘   │
│  ○ Clientes │                                                         │
│  ─────────  │  ┌──────────────────────┬──────────────────────────┐   │
│  ○ Config   │  │  CALENDARIO SEMANAL  │  LISTA DE HOY            │   │
│  ○ Salir    │  │  (Vista principal)   │  (Sidebar derecho)       │   │
│            │  └──────────────────────┴──────────────────────────┘   │
└────────────┴─────────────────────────────────────────────────────────┘
```

---

## Flujo de Reservas

### Estados

```
[PENDIENTE] ───► [CONFIRMADA] ───► [COMPLETADA]
     │                │
     └──► [RECHAZADA] └──► [CANCELADA]
```

### Acciones

| Acción | Efecto | Notificación |
|--------|--------|--------------|
| Aceptar | Cambia a "Confirmada" | Email + WhatsApp al cliente |
| Rechazar | Cambia a "Rechazada" | Email explicando (opcional motivo) |
| Completar | Marca como realizada | Ninguna |
| Cancelar | Cliente canceló | Libera el slot |
| Añadir Nota | Comentario interno | Solo visible para admin |

---

## Flujo de Pedidos

### Estados

```
[PENDIENTE] ───► [PAGADO] ───► [ENVIADO] ───► [ENTREGADO]
                    │
                    └──► [REEMBOLSADO]
```

---

## Base de Datos (Supabase)

### Tablas

1. **admins** - Usuarios administradores
2. **reservations** - Citas de clientes
3. **products** - Catálogo de productos
4. **orders** - Pedidos de productos
5. **order_items** - Items de cada pedido
6. **notifications** - Alertas del sistema

Ver esquema completo en `docs/API-AUDIT.md`

---

## Acceso al Panel

**Método:** Triple click en el logo "COOL" del footer
- Gesto discreto que solo la dueña conoce
- Muestra modal de login
- Si login exitoso → redirige a `admin.html`

---

## Seguridad

| Capa | Implementación |
|------|----------------|
| Frontend | Verificar sesión antes de mostrar panel |
| Supabase RLS | Solo usuarios autenticados pueden leer/escribir |
| Rate Limiting | Máximo 5 intentos de login por minuto |
| Sesión | Token JWT con expiración de 24h |

---

## Próximos Pasos

Ver plan de implementación detallado en:
`docs/plans/2026-01-18-admin-panel-implementation.md`
