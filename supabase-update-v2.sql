-- ============================================
-- PELUQUERÍA COOL - ACTUALIZACIÓN DE SCHEMA V2
-- ============================================

-- 1. Añadir columnas de trazabilidad y gestión
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'web' CHECK (fuente IN ('web', 'whatsapp', 'telefono', 'manual')),
ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
ADD COLUMN IF NOT EXISTS recordatorio_enviado BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30, -- Duración real de esta cita
ADD COLUMN IF NOT EXISTS no_show BOOLEAN DEFAULT false; -- Si el cliente no se presentó

-- 2. Asegurar que service_name sea obligatorio para consistencia visual
-- ALTER TABLE reservations ALTER COLUMN service_name SET NOT NULL; 
-- ^ Comentado por seguridad, mejor dejar que el JS lo maneje primero.

-- 3. Tabla para el catálogo de productos (si no existe)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url TEXT,
    stock INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    stripe_price_id TEXT,
    category TEXT,
    duration_minutes INTEGER DEFAULT 30, -- Tiempo estimado por servicio
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Habilitar Row Level Security para productos
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 5. Política para ver productos activos (Público)
DROP POLICY IF EXISTS "Anyone can view active products" ON products;
CREATE POLICY "Anyone can view active products" ON products
    FOR SELECT USING (active = true);

-- 6. Política para gestionar productos (Solo Admin Autenticado)
DROP POLICY IF EXISTS "Authenticated users can manage products" ON products;
CREATE POLICY "Authenticated users can manage products" ON products
    FOR ALL USING (auth.role() = 'authenticated');

-- 7. Tabla de configuración (Horarios, Webhooks, etc.)
CREATE TABLE IF NOT EXISTS salon_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar valores iniciales (Webhook de ejemplo)
INSERT INTO salon_config (key, value) VALUES ('webhook_url', '""') ON CONFLICT (key) DO NOTHING;
INSERT INTO salon_config (key, value) VALUES ('schedule', '[]') ON CONFLICT (key) DO NOTHING;

-- Habilitar RLS
ALTER TABLE salon_config ENABLE ROW LEVEL SECURITY;

-- Lectura pública (para el formulario)
DROP POLICY IF EXISTS "Anyone can view salon config" ON salon_config;
CREATE POLICY "Anyone can view salon config" ON salon_config
    FOR SELECT USING (true);

-- Escritura solo admin
DROP POLICY IF EXISTS "Authenticated users can manage salon config" ON salon_config;
CREATE POLICY "Authenticated users can manage salon config" ON salon_config
    FOR ALL USING (auth.role() = 'authenticated');


