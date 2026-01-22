# 🔌 Auditoría de APIs - Peluquería Cool

## Resumen Ejecutivo

Este documento detalla todas las APIs y servicios externos necesarios para convertir el proyecto en una solución profesional completa con panel de administración, gestión de reservas y ventas de productos.

---

## 📊 Mapa de Servicios

```
┌─────────────────────────────────────────────────────────────────┐
│                    PELUQUERÍA COOL                              │
├─────────────────────────────────────────────────────────────────┤
│  FRONTEND (Vanilla JS)                                          │
│  ├── Landing Page (Clientes)                                    │
│  └── Panel Admin (Dueña)                                        │
├─────────────────────────────────────────────────────────────────┤
│  BACKEND SERVICES                                                │
│  ├── Supabase (Auth + DB + Realtime)                            │
│  ├── Stripe (Pagos)                                              │
│  ├── Resend (Emails)                                             │
│  ├── Twilio (SMS/WhatsApp)                                       │
│  └── Google (Analytics + Maps)                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. SUPABASE (Base de Datos + Auth)

### Propósito
- Autenticación de usuarios (admin login)
- Base de datos PostgreSQL para reservas y pedidos
- Realtime subscriptions para notificaciones en vivo

### Tablas Necesarias

```sql
-- Usuarios admin
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reservas
CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  service TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, confirmed, cancelled, completed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Productos
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  stock INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  status TEXT DEFAULT 'pending', -- pending, paid, shipped, delivered, cancelled
  total DECIMAL(10,2) NOT NULL,
  stripe_payment_id TEXT,
  shipping_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items de pedido
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL
);

-- Notificaciones
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- reservation, order
  reference_id UUID NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Configuración
- **URL**: Dashboard > Project Settings > API
- **Anon Key**: Para operaciones públicas (crear reserva)
- **Service Role Key**: Solo para backend/admin (NUNCA exponer en frontend)

### Coste
- **Free Tier**: 500MB DB, 1GB storage, 2GB bandwidth/mes
- **Pro**: $25/mes (8GB DB, 100GB storage)

### Documentación
- https://supabase.com/docs

---

## 2. STRIPE (Pagos)

### Propósito
- Procesar pagos de productos
- Gestionar links de pago
- Webhooks para notificar pagos completados

### Flujo de Pago

```
Cliente → Stripe Checkout → Webhook → Supabase (actualizar pedido)
                                    → Email confirmación
```

### Endpoints Necesarios

| Endpoint | Uso |
|----------|-----|
| `POST /v1/checkout/sessions` | Crear sesión de pago |
| `GET /v1/payment_intents/:id` | Verificar estado |
| `POST /v1/refunds` | Procesar devoluciones |

### Webhooks a Configurar

| Evento | Acción |
|--------|--------|
| `checkout.session.completed` | Marcar pedido como pagado |
| `payment_intent.succeeded` | Enviar email confirmación |
| `payment_intent.payment_failed` | Notificar admin |

### Coste
- **Por transacción**: 1.4% + 0.25€ (tarjetas europeas)
- **Sin coste fijo mensual**

### Documentación
- https://stripe.com/docs/api

---

## 3. RESEND (Emails)

### Propósito
- Emails transaccionales (confirmación reserva)
- Notificaciones de pedidos
- Recordatorios de citas

### Emails a Implementar

| Template | Disparador |
|----------|-----------|
| `reservation-confirmation` | Nueva reserva creada |
| `reservation-approved` | Admin aprueba reserva |
| `reservation-cancelled` | Admin cancela reserva |
| `reservation-reminder` | 24h antes de la cita |
| `order-confirmation` | Pago completado |
| `order-shipped` | Pedido enviado |

### Ejemplo de Uso

```javascript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: 'Peluquería Cool <reservas@peluqueriacool.es>',
  to: 'cliente@email.com',
  subject: '✅ Reserva Confirmada - Peluquería Cool',
  html: `<h1>¡Tu cita está confirmada!</h1>...`
});
```

### Coste
- **Free Tier**: 100 emails/día, 3000/mes
- **Pro**: $20/mes (50,000 emails)

### Documentación
- https://resend.com/docs

---

## 4. TWILIO (SMS/WhatsApp)

### Propósito
- Notificaciones por WhatsApp (preferido)
- SMS como fallback
- Confirmaciones de reserva instantáneas

### Templates de WhatsApp Business

| Template | Contenido |
|----------|-----------|
| `reservation_confirmed` | "¡Hola {{1}}! Tu cita para {{2}} el {{3}} a las {{4}} está confirmada. ¡Te esperamos!" |
| `reservation_reminder` | "Recordatorio: Tienes cita mañana {{1}} a las {{2}}. Responde CONFIRMAR o CANCELAR." |
| `order_shipped` | "¡Tu pedido ha sido enviado! Número de seguimiento: {{1}}" |

### Coste
- **WhatsApp**: $0.005-0.08 por mensaje (según país)
- **SMS España**: ~$0.04 por mensaje

### Documentación
- https://www.twilio.com/docs/whatsapp

---

## 5. GOOGLE SERVICES

### Google Analytics 4
- Tracking de conversiones
- Eventos: `reservation_started`, `reservation_completed`, `purchase`
- Dashboard de métricas

### Google Maps
- Mapa embebido (ya implementado)
- Opcional: Autocomplete de direcciones para envíos

### Coste
- **Analytics**: Gratis
- **Maps Embed**: Gratis
- **Maps API (avanzado)**: $2-7 por 1000 requests

---

## 📋 Resumen de Costes

### Escenario: Peluquería Pequeña (~50 reservas/mes, ~10 pedidos/mes)

| Servicio | Tier | Coste Mensual |
|----------|------|---------------|
| Supabase | Free | 0€ |
| Stripe | Per transaction | ~5€ (estimado) |
| Resend | Free | 0€ |
| Twilio WhatsApp | Per message | ~5€ (estimado) |
| Google | Free | 0€ |
| **TOTAL** | | **~10€/mes** |

### Escenario: Peluquería Media (~200 reservas/mes, ~50 pedidos/mes)

| Servicio | Tier | Coste Mensual |
|----------|------|---------------|
| Supabase | Free/Pro | 0-25€ |
| Stripe | Per transaction | ~25€ |
| Resend | Free | 0€ |
| Twilio WhatsApp | Per message | ~15€ |
| Google | Free | 0€ |
| **TOTAL** | | **~40-65€/mes** |

---

## 🔐 Seguridad

### Row Level Security (RLS) en Supabase

```sql
-- Solo admins pueden ver todas las reservas
CREATE POLICY "Admins can do everything" ON reservations
  FOR ALL USING (auth.role() = 'authenticated');

-- Clientes solo pueden crear reservas (no ver)
CREATE POLICY "Anyone can create reservations" ON reservations
  FOR INSERT WITH CHECK (true);
```

### CORS Configuration
- Limitar orígenes a `peluqueriacool.es`
- Nunca exponer Service Role Key en frontend

### Webhooks
- Verificar firma de Stripe en todos los webhooks
- Rate limiting en endpoints públicos

---

## 🚀 Prioridad de Implementación

### Fase 1: MVP Admin (Esencial)
1. ✅ Supabase Auth (login admin)
2. ✅ Supabase DB (reservas)
3. ✅ Panel Admin básico (ver/gestionar reservas)

### Fase 2: Comunicación
4. Resend (emails confirmación)
5. Twilio WhatsApp (opcional, mejora UX)

### Fase 3: E-commerce
6. Stripe Checkout (pagos productos)
7. Gestión de pedidos en admin

### Fase 4: Optimización
8. Google Analytics (tracking)
9. Notificaciones realtime
10. Recordatorios automáticos

---

## 📝 Próximos Pasos

1. [ ] Crear proyecto en Supabase
2. [ ] Configurar tablas y RLS
3. [ ] Diseñar UI del panel admin
4. [ ] Implementar login admin
5. [ ] Crear vistas de gestión de reservas
6. [ ] Integrar notificaciones
