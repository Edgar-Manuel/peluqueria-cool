-- ============================================================
-- PELUQUERÍA COOL - PATCH COMPLETO v4
-- ============================================================
-- Ejecutar en Supabase Dashboard → SQL Editor → New Query
-- Es seguro ejecutarlo aunque ya hayas corrido v2 o v3.
-- Usa IF NOT EXISTS y ON CONFLICT DO NOTHING en todo.
-- ============================================================


-- ==================== 1. COLUMNAS EN RESERVATIONS ====================
-- Todo lo de v2 + v3 en un solo bloque

ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'web' CHECK (fuente IN ('web', 'whatsapp', 'telefono', 'manual')),
    ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
    ADD COLUMN IF NOT EXISTS recordatorio_enviado BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS no_show BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS hora_fin TEXT,
    ADD COLUMN IF NOT EXISTS precio_estimado DECIMAL(10,2);

-- Estas dos con FK se añaden después de crear las tablas referenciadas
-- (ver sección 5 más abajo)


-- ==================== 2. TABLA PRODUCTS ====================

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
    duration_minutes INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active products" ON products;
CREATE POLICY "Anyone can view active products" ON products
    FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Authenticated users can manage products" ON products;
CREATE POLICY "Authenticated users can manage products" ON products
    FOR ALL USING (auth.role() = 'authenticated');


-- ==================== 3. TABLA SALON_CONFIG ====================

CREATE TABLE IF NOT EXISTS salon_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE salon_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view salon config" ON salon_config;
CREATE POLICY "Anyone can view salon config" ON salon_config
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage salon config" ON salon_config;
CREATE POLICY "Authenticated users can manage salon config" ON salon_config
    FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO salon_config (key, value) VALUES
    ('webhook_url',               '""'),
    ('schedule',                  '[]'),
    ('buffer_minutos',            '10'),
    ('aviso_cancelacion_horas',   '2'),
    ('max_cancelaciones_aviso',   '3'),
    ('timezone',                  '"Europe/Madrid"'),
    ('slots_intervalo_minutos',   '15')
ON CONFLICT (key) DO NOTHING;


-- ==================== 4. TABLA SERVICIOS ====================

CREATE TABLE IF NOT EXISTS servicios (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    duracion_minutos INTEGER NOT NULL,
    precio DECIMAL(10,2),
    color_calendario TEXT DEFAULT '#3b82f6',
    activo BOOLEAN DEFAULT true,
    categoria TEXT CHECK (categoria IN ('corte', 'color', 'tratamiento', 'styling', 'otro')) DEFAULT 'otro',
    descripcion TEXT,
    requiere_preparacion BOOLEAN DEFAULT false,
    tiempo_preparacion_minutos INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active services" ON servicios;
CREATE POLICY "Anyone can view active services" ON servicios
    FOR SELECT USING (activo = true);

DROP POLICY IF EXISTS "Admins can manage services" ON servicios;
CREATE POLICY "Admins can manage services" ON servicios
    FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO servicios (id, nombre, duracion_minutos, precio, color_calendario, categoria, descripcion) VALUES
    ('corte_hombre',   'Corte Hombre',        30,  18.00, '#10b981', 'corte',       'Corte de pelo masculino'),
    ('corte_mujer',    'Corte Mujer',          45,  28.00, '#10b981', 'corte',       'Corte femenino, incluye lavado'),
    ('corte_nino',     'Corte Niño/a',         25,  14.00, '#34d399', 'corte',       'Corte infantil hasta 12 años'),
    ('flequillo',      'Arreglo Flequillo',    15,   8.00, '#6ee7b7', 'corte',       'Solo retoque de flequillo'),
    ('tinte_raiz',     'Tinte Raíz',           60,  45.00, '#f59e0b', 'color',       'Aplicación raíz + reposo + aclarado'),
    ('tinte_completo', 'Tinte Completo',       90,  60.00, '#f59e0b', 'color',       'Tinte cabellera completa + aclarado'),
    ('peinado',        'Peinado',              45,  30.00, '#8b5cf6', 'styling',     'Peinado para evento o ocasión especial'),
    ('peinado_novia',  'Peinado Novia',        90,  80.00, '#a78bfa', 'styling',     'Peinado de novia o madrina'),
    ('tratamiento',    'Tratamiento Capilar',  60,  40.00, '#06b6d4', 'tratamiento', 'Mascarilla + masaje capilar + aclarado'),
    ('solarium',       'Solárium',             20,  15.00, '#f97316', 'otro',        'Sesión de solárium'),
    ('lavado_secado',  'Lavado y Secado',      20,  15.00, '#6b7280', 'otro',        'Lavado + secado sin corte'),
    ('vip',            'Experiencia VIP',     120, 120.00, '#ec4899', 'otro',        'Combo personalizado completo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO servicios (id, nombre, duracion_minutos, precio, color_calendario, categoria, descripcion, requiere_preparacion, tiempo_preparacion_minutos) VALUES
    ('mechas',          'Mechas',           120,  85.00, '#d97706', 'color',       'Mechas completas, incluye reposo', true, 15),
    ('mechas_parciales','Mechas Parciales',  90,  65.00, '#d97706', 'color',       'Solo zona superior o corona',      true, 10),
    ('decoloracion',    'Decoloración',     120,  80.00, '#fbbf24', 'color',       'Decoloración completa',            true, 15),
    ('keratina',        'Keratina',         120,  95.00, '#0891b2', 'tratamiento', 'Alisado con keratina',             true, 20)
ON CONFLICT (id) DO NOTHING;


-- ==================== 5. TABLA SERVICIOS_COMBINADOS ====================

CREATE TABLE IF NOT EXISTS servicios_combinados (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    servicios_ids TEXT[] NOT NULL,
    duracion_real_minutos INTEGER NOT NULL,
    precio DECIMAL(10,2),
    color_calendario TEXT DEFAULT '#8b5cf6',
    activo BOOLEAN DEFAULT true,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE servicios_combinados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active combos" ON servicios_combinados;
CREATE POLICY "Anyone can view active combos" ON servicios_combinados
    FOR SELECT USING (activo = true);

DROP POLICY IF EXISTS "Admins can manage combos" ON servicios_combinados;
CREATE POLICY "Admins can manage combos" ON servicios_combinados
    FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO servicios_combinados (id, nombre, servicios_ids, duracion_real_minutos, precio, color_calendario, descripcion) VALUES
    ('tinte_corte',          'Tinte + Corte',             ARRAY['tinte_completo','corte_mujer'],                110, 80.00,  '#f59e0b', 'Corte mientras el tinte reposa'),
    ('mechas_corte',         'Mechas + Corte',            ARRAY['mechas','corte_mujer'],                        150, 105.00, '#d97706', 'Mechas + corte al retirar'),
    ('mechas_corte_peinado', 'Mechas + Corte + Peinado',  ARRAY['mechas','corte_mujer','peinado'],              180, 130.00, '#d97706', 'Servicio completo de color'),
    ('tinte_peinado',        'Tinte + Peinado',           ARRAY['tinte_completo','peinado'],                    120, 85.00,  '#f59e0b', 'Tinte + peinado para evento'),
    ('corte_tratamiento',    'Corte + Tratamiento',       ARRAY['corte_mujer','tratamiento'],                    80, 62.00,  '#10b981', 'Corte + mascarilla nutritiva'),
    ('pack_novia',           'Pack Novia Completo',       ARRAY['peinado_novia','tratamiento'],                 150, 150.00, '#a78bfa', 'Tratamiento previo + peinado novia')
ON CONFLICT (id) DO NOTHING;


-- ==================== 6. TABLA CLIENTES ====================

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    telefono TEXT UNIQUE NOT NULL,
    email TEXT,
    total_visitas INTEGER DEFAULT 0,
    ultima_visita DATE,
    ultimo_servicio_id TEXT REFERENCES servicios(id),
    ultimo_servicio_nombre TEXT,
    cancelaciones_tardias INTEGER DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage clients" ON clientes;
CREATE POLICY "Admins can manage clients" ON clientes
    FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_ultima_visita ON clientes(ultima_visita DESC);


-- ==================== 7. TABLA DIAS_CERRADOS ====================

CREATE TABLE IF NOT EXISTS dias_cerrados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL UNIQUE,
    motivo TEXT NOT NULL DEFAULT 'Festivo',
    todo_el_dia BOOLEAN DEFAULT true,
    hora_inicio TIME,
    hora_fin TIME,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dias_cerrados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view closed days" ON dias_cerrados;
CREATE POLICY "Anyone can view closed days" ON dias_cerrados
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage closed days" ON dias_cerrados;
CREATE POLICY "Admins can manage closed days" ON dias_cerrados
    FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO dias_cerrados (fecha, motivo) VALUES
    ('2026-01-01', 'Año Nuevo'),
    ('2026-01-06', 'Reyes Magos'),
    ('2026-04-02', 'Jueves Santo'),
    ('2026-04-03', 'Viernes Santo'),
    ('2026-05-01', 'Día del Trabajador'),
    ('2026-07-28', 'Día de Cantabria'),
    ('2026-08-15', 'Asunción de la Virgen'),
    ('2026-08-25', 'Vacaciones de Verano'),
    ('2026-08-26', 'Vacaciones de Verano'),
    ('2026-08-27', 'Vacaciones de Verano'),
    ('2026-08-28', 'Vacaciones de Verano'),
    ('2026-08-29', 'Vacaciones de Verano'),
    ('2026-10-12', 'Día de la Hispanidad'),
    ('2026-11-01', 'Todos los Santos'),
    ('2026-12-08', 'Inmaculada Concepción'),
    ('2026-12-25', 'Navidad')
ON CONFLICT (fecha) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_dias_cerrados_fecha ON dias_cerrados(fecha);


-- ==================== 8. FK EN RESERVATIONS (tras crear tablas) ====================

ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS servicio_id TEXT REFERENCES servicios(id),
    ADD COLUMN IF NOT EXISTS servicios_ids TEXT[],
    ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id),
    ADD COLUMN IF NOT EXISTS cancelacion_tardia BOOLEAN DEFAULT false;


-- ==================== 9. ÍNDICES EN RESERVATIONS ====================

CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_cliente ON reservations(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reservations_phone ON reservations(customer_phone);


-- ==================== 10. FUNCIONES ====================

CREATE OR REPLACE FUNCTION calc_hora_fin(hora_inicio TEXT, duracion_minutos INTEGER)
RETURNS TEXT AS $$
DECLARE
    h INTEGER;
    m INTEGER;
    total_minutos INTEGER;
BEGIN
    h := SPLIT_PART(hora_inicio, ':', 1)::INTEGER;
    m := SPLIT_PART(hora_inicio, ':', 2)::INTEGER;
    total_minutos := h * 60 + m + duracion_minutos;
    RETURN LPAD((total_minutos / 60)::TEXT, 2, '0') || ':' || LPAD((total_minutos % 60)::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION citas_se_solapan(
    inicio_a TEXT, fin_a TEXT,
    inicio_b TEXT, fin_b TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SPLIT_PART(inicio_a,':',1)::INT * 60 + SPLIT_PART(inicio_a,':',2)::INT
        <
        SPLIT_PART(fin_b,':',1)::INT * 60 + SPLIT_PART(fin_b,':',2)::INT
    ) AND (
        SPLIT_PART(fin_a,':',1)::INT * 60 + SPLIT_PART(fin_a,':',2)::INT
        >
        SPLIT_PART(inicio_b,':',1)::INT * 60 + SPLIT_PART(inicio_b,':',2)::INT
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ==================== 11. TRIGGER: AUTO HORA_FIN ====================

CREATE OR REPLACE FUNCTION set_hora_fin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.time IS NOT NULL AND NEW.duration_minutes IS NOT NULL THEN
        NEW.hora_fin := calc_hora_fin(NEW.time, NEW.duration_minutes);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_hora_fin ON reservations;
CREATE TRIGGER trg_set_hora_fin
    BEFORE INSERT OR UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION set_hora_fin();


-- ==================== 12. TRIGGER: HISTORIAL CLIENTE ====================

CREATE OR REPLACE FUNCTION actualizar_historial_cliente()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        INSERT INTO clientes (nombre, telefono, total_visitas, ultima_visita, ultimo_servicio_nombre, updated_at)
        VALUES (NEW.customer_name, NEW.customer_phone, 1, NEW.date, NEW.service_name, NOW())
        ON CONFLICT (telefono) DO UPDATE SET
            total_visitas = clientes.total_visitas + 1,
            ultima_visita = NEW.date,
            ultimo_servicio_nombre = NEW.service_name,
            updated_at = NOW();

        UPDATE reservations SET
            cliente_id = (SELECT id FROM clientes WHERE telefono = NEW.customer_phone)
        WHERE id = NEW.id;
    END IF;

    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('cancelled', 'rejected') THEN
        IF NEW.date::TIMESTAMPTZ + (
            SPLIT_PART(NEW.time,':',1)::INT * 60 + SPLIT_PART(NEW.time,':',2)::INT
        ) * INTERVAL '1 minute' - NOW() < INTERVAL '2 hours' THEN
            UPDATE clientes
            SET cancelaciones_tardias = cancelaciones_tardias + 1, updated_at = NOW()
            WHERE telefono = NEW.customer_phone;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_historial_cliente ON reservations;
CREATE TRIGGER trg_historial_cliente
    AFTER UPDATE ON reservations
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_historial_cliente();


-- ==================== 13. VISTA: CITAS DE HOY ====================

CREATE OR REPLACE VIEW vista_citas_hoy AS
SELECT
    r.id,
    r.customer_name,
    r.customer_phone,
    r.service_name,
    r.servicio_id,
    r.servicios_ids,
    r.date,
    r.time,
    r.hora_fin,
    r.duration_minutes,
    r.status,
    r.fuente,
    r.notes,
    r.precio_estimado,
    s.color_calendario,
    s.categoria
FROM reservations r
LEFT JOIN servicios s ON s.id = r.servicio_id
WHERE r.date = CURRENT_DATE
  AND r.status NOT IN ('cancelled', 'rejected')
ORDER BY r.time;


-- ============================================================
-- FIN DEL PATCH v4
-- ============================================================
-- Qué hace este script:
--  ✅ duration_minutes en reservations (soluciona el error del formulario)
--  ✅ fuente, recordatorio_enviado, updated_at, hora_fin, precio_estimado
--  ✅ Tablas: products, salon_config, servicios, servicios_combinados,
--             clientes, dias_cerrados
--  ✅ FK: servicio_id, cliente_id en reservations
--  ✅ Índices de rendimiento
--  ✅ Funciones: calc_hora_fin, citas_se_solapan
--  ✅ Triggers: auto hora_fin, historial cliente
--  ✅ Vista: vista_citas_hoy
--  ✅ RLS activado en todas las tablas
--  ✅ Festivos 2026 precargados
-- ============================================================
