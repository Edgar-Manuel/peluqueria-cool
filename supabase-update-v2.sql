-- ============================================
-- PELUQUERÍA COOL - ACTUALIZACIÓN DE SCHEMA V2
-- ============================================

-- 1. Añadir columnas de trazabilidad y gestión
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'web' CHECK (fuente IN ('web', 'whatsapp', 'telefono', 'manual')),
ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
ADD COLUMN IF NOT EXISTS recordatorio_enviado BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Habilitar Row Level Security para productos
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 5. Política para ver productos activos (Público)
CREATE POLICY IF NOT EXISTS "Anyone can view active products" ON products
    FOR SELECT USING (active = true);

-- 6. Política para gestionar productos (Solo Admin Autenticado)
CREATE POLICY IF NOT EXISTS "Authenticated users can manage products" ON products
    FOR ALL USING (auth.role() = 'authenticated');
