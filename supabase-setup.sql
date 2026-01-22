-- ============================================
-- PELUQUERÍA COOL - SUPABASE DATABASE SETUP
-- ============================================
-- Ejecutar este script en Supabase Dashboard:
-- SQL Editor -> New Query -> Pegar y ejecutar
-- ============================================

-- ==================== ADMINS ====================
-- Tabla de administradores (usuarios con acceso al panel)
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar admin inicial (CAMBIAR EMAIL Y CREAR USUARIO EN AUTH)
-- Primero crea el usuario en: Authentication -> Users -> Invite user
-- INSERT INTO admins (email, name) VALUES ('tu-email@ejemplo.com', 'Administrador');

-- ==================== RESERVATIONS ====================
-- Tabla principal de reservas/citas
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    service TEXT NOT NULL,
    service_name TEXT,
    date DATE NOT NULL,
    time TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'rejected')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created ON reservations(created_at DESC);

-- ==================== PRODUCTS ====================
-- Catálogo de productos para venta
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

-- ==================== ORDERS ====================
-- Pedidos de productos
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
    total DECIMAL(10,2) NOT NULL,
    stripe_payment_id TEXT,
    shipping_address TEXT,
    tracking_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generar número de pedido automático
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'PC-' || LPAD(CAST((SELECT COUNT(*) + 1 FROM orders) AS TEXT), 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL)
    EXECUTE FUNCTION generate_order_number();

-- ==================== ORDER ITEMS ====================
-- Items individuales de cada pedido
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL
);

-- ==================== NOTIFICATIONS ====================
-- Sistema de notificaciones internas
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('reservation', 'order', 'system')),
    reference_id UUID,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ==================== CLIENTS (opcional) ====================
-- Historial de clientes para fidelización
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT,
    total_visits INTEGER DEFAULT 0,
    last_visit DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==================== ROW LEVEL SECURITY ====================
-- Habilitar RLS en todas las tablas
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Políticas para RESERVATIONS
-- Cualquiera puede crear reservas (formulario público)
CREATE POLICY "Anyone can create reservations" ON reservations
    FOR INSERT WITH CHECK (true);

-- Solo usuarios autenticados pueden ver/editar
CREATE POLICY "Authenticated users can view reservations" ON reservations
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update reservations" ON reservations
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Políticas para PRODUCTS (lectura pública, escritura admin)
CREATE POLICY "Anyone can view active products" ON products
    FOR SELECT USING (active = true);

CREATE POLICY "Authenticated users can manage products" ON products
    FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para NOTIFICATIONS
CREATE POLICY "Authenticated users can view notifications" ON notifications
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update notifications" ON notifications
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "System can create notifications" ON notifications
    FOR INSERT WITH CHECK (true);

-- Políticas para ADMINS
CREATE POLICY "Authenticated users can view admins" ON admins
    FOR SELECT USING (auth.role() = 'authenticated');

-- Políticas para ORDERS y ORDER_ITEMS
CREATE POLICY "Authenticated users can manage orders" ON orders
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage order items" ON order_items
    FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para CLIENTS
CREATE POLICY "Authenticated users can manage clients" ON clients
    FOR ALL USING (auth.role() = 'authenticated');

-- ==================== FUNCIONES ÚTILES ====================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para reservations
CREATE TRIGGER update_reservations_updated_at
    BEFORE UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para orders
CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==================== DATOS DE EJEMPLO (opcional) ====================
-- Descomentar para insertar datos de prueba

/*
-- Productos de ejemplo
INSERT INTO products (name, description, price, stock, category) VALUES
('Champú Reparador', 'Fórmula profesional para cabello dañado', 28.00, 15, 'cuidado'),
('Aceite de Argán', 'Hidratación intensa para puntas', 35.00, 10, 'tratamiento'),
('Mascarilla Nutritiva', 'Tratamiento semanal de keratina', 42.00, 8, 'tratamiento'),
('Spray Protector Térmico', 'Protección hasta 230°C', 22.00, 20, 'styling');

-- Reserva de ejemplo
INSERT INTO reservations (customer_name, customer_phone, service, service_name, date, time, status) VALUES
('María García', '+34600000001', 'corte', 'Corte & Styling', CURRENT_DATE + 1, '10:00', 'pending'),
('Juan Pérez', '+34600000002', 'color', 'Coloración', CURRENT_DATE + 1, '16:00', 'confirmed');
*/

-- ============================================
-- ¡IMPORTANTE! DESPUÉS DE EJECUTAR ESTE SQL:
-- ============================================
-- 1. Ve a Authentication -> Users -> Invite user
-- 2. Envía invitación al email del admin
-- 3. El admin acepta y crea contraseña
-- 4. Descomenta y ejecuta:
--    INSERT INTO admins (email, name) VALUES ('email-del-admin@ejemplo.com', 'Nombre Admin');
-- ============================================
