-- ============================================================
-- PELUQUERÍA COOL - SCHEMA V3 (Smart Scheduling)
-- ============================================================
-- Ejecutar en Supabase Dashboard: SQL Editor -> New Query
-- IMPORTANTE: Ejecutar DESPUÉS de v1 (supabase-setup.sql)
-- ============================================================

-- ==================== SERVICIOS ====================
-- Catálogo de servicios con duraciones reales

CREATE TABLE IF NOT EXISTS servicios (
    id TEXT PRIMARY KEY, -- 'corte_hombre', 'tinte_completo', etc.
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

-- Servicios con duraciones reales (ajustar precios según el salón)
INSERT INTO servicios (id, nombre, duracion_minutos, precio, color_calendario, categoria, descripcion) VALUES
    ('corte_hombre',      'Corte Hombre',           30,  18.00, '#10b981', 'corte',       'Corte de pelo masculino'),
    ('corte_mujer',       'Corte Mujer',             45,  28.00, '#10b981', 'corte',       'Corte femenino, incluye lavado'),
    ('corte_nino',        'Corte Niño/a',            25,  14.00, '#34d399', 'corte',       'Corte infantil hasta 12 años'),
    ('flequillo',         'Arreglo Flequillo',       15,   8.00, '#6ee7b7', 'corte',       'Solo retoque de flequillo'),
    ('tinte_raiz',        'Tinte Raíz',              60,  45.00, '#f59e0b', 'color',       'Aplicación raíz + tiempo de reposo + aclarado'),
    ('tinte_completo',    'Tinte Completo',          90,  60.00, '#f59e0b', 'color',       'Tinte de toda la cabellera + aclarado')
        ON CONFLICT (id) DO NOTHING;

INSERT INTO servicios (id, nombre, duracion_minutos, precio, color_calendario, categoria, descripcion, requiere_preparacion, tiempo_preparacion_minutos) VALUES
    ('mechas',            'Mechas',                 120,  85.00, '#d97706', 'color',       'Mechas completas, incluye tiempo de reposo', true, 15),
    ('mechas_parciales',  'Mechas Parciales',        90,  65.00, '#d97706', 'color',       'Solo zona superior o corona', true, 10),
    ('decoloracion',      'Decoloración',           120,  80.00, '#fbbf24', 'color',       'Decoloración completa con cuidado del cabello', true, 15),
    ('peinado',           'Peinado',                 45,  30.00, '#8b5cf6', 'styling',     'Peinado para evento o ocasión especial'),
    ('peinado_novia',     'Peinado Novia',           90,  80.00, '#a78bfa', 'styling',     'Peinado de novia o madrina, consulta previa'),
    ('tratamiento',       'Tratamiento Capilar',     60,  40.00, '#06b6d4', 'tratamiento', 'Mascarilla nutritiva + masaje capilar + aclarado'),
    ('keratina',          'Keratina',               120,  95.00, '#0891b2', 'tratamiento', 'Alisado con keratina, incluye tiempo de reposo', true, 20),
    ('solarium',          'Solárium',                20,  15.00, '#f97316', 'otro',        'Sesión de solárium (tiempo fijo)'),
    ('lavado_secado',     'Lavado y Secado',         20,  15.00, '#6b7280', 'otro',        'Lavado + secado sin corte'),
    ('vip',               'Experiencia VIP',        120, 120.00, '#ec4899', 'otro',        'Combo personalizado: consulta + servicio completo + styling')
        ON CONFLICT (id) DO NOTHING;

-- ==================== SERVICIOS COMBINADOS ====================
-- Packs con duraciones REALES (no suma directa, solapamientos incluidos)

CREATE TABLE IF NOT EXISTS servicios_combinados (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    servicios_ids TEXT[] NOT NULL, -- IDs de los servicios que incluye
    duracion_real_minutos INTEGER NOT NULL, -- duración total REAL (con solapamientos)
    precio DECIMAL(10,2),
    color_calendario TEXT DEFAULT '#8b5cf6',
    activo BOOLEAN DEFAULT true,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO servicios_combinados (id, nombre, servicios_ids, duracion_real_minutos, precio, color_calendario, descripcion) VALUES
    ('tinte_corte',         'Tinte + Corte',              ARRAY['tinte_completo','corte_mujer'],           110, 80.00,  '#f59e0b', 'Mientras el tinte reposa se hace el corte'),
    ('mechas_corte',        'Mechas + Corte',             ARRAY['mechas','corte_mujer'],                   150, 105.00, '#d97706', 'Mechas + corte al retirar el tinte'),
    ('mechas_corte_peinado','Mechas + Corte + Peinado',   ARRAY['mechas','corte_mujer','peinado'],         180, 130.00, '#d97706', 'Servicio completo de color'),
    ('tinte_peinado',       'Tinte + Peinado',            ARRAY['tinte_completo','peinado'],               120, 85.00,  '#f59e0b', 'Tinte + recogido o peinado para evento'),
    ('corte_tratamiento',   'Corte + Tratamiento',        ARRAY['corte_mujer','tratamiento'],               80, 62.00,  '#10b981', 'Corte + mascarilla nutritiva'),
    ('pack_novia',          'Pack Novia Completo',        ARRAY['peinado_novia','tratamiento'],            150, 150.00, '#a78bfa', 'Tratamiento previo + peinado de novia')
    ON CONFLICT (id) DO NOTHING;

-- ==================== CLIENTES ====================
-- Historial y fidelización de clientes

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    telefono TEXT UNIQUE NOT NULL,
    email TEXT,
    total_visitas INTEGER DEFAULT 0,
    ultima_visita DATE,
    ultimo_servicio_id TEXT REFERENCES servicios(id),
    ultimo_servicio_nombre TEXT,
    cancelaciones_tardias INTEGER DEFAULT 0, -- cancelaciones con <2h de antelación
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_ultima_visita ON clientes(ultima_visita DESC);

-- ==================== DIAS CERRADOS ====================
-- Festivos, vacaciones, días especiales

CREATE TABLE IF NOT EXISTS dias_cerrados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL UNIQUE,
    motivo TEXT NOT NULL DEFAULT 'Festivo',
    todo_el_dia BOOLEAN DEFAULT true,
    hora_inicio TIME, -- si solo cierra parte del día
    hora_fin TIME,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar festivos 2026 (Cantabria / España)
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

-- ==================== MEJORAS A RESERVATIONS ====================
-- Añadir columnas necesarias para sistema inteligente

ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS hora_fin TEXT,                          -- hora estimada de fin (HH:MM)
    ADD COLUMN IF NOT EXISTS servicio_id TEXT REFERENCES servicios(id), -- FK al catálogo
    ADD COLUMN IF NOT EXISTS servicios_ids TEXT[],                   -- múltiples servicios
    ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id), -- FK al cliente
    ADD COLUMN IF NOT EXISTS precio_estimado DECIMAL(10,2),          -- precio calculado
    ADD COLUMN IF NOT EXISTS cancelacion_tardía BOOLEAN DEFAULT false; -- canceló tarde

-- Índice compuesto para consultas de disponibilidad (muy frecuentes)
CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(date, status);
CREATE INDEX IF NOT EXISTS idx_reservations_cliente ON reservations(cliente_id);

-- ==================== CONFIG DEL SALÓN ====================
-- Buffer entre citas y otras configuraciones

INSERT INTO salon_config (key, value) VALUES
    ('buffer_minutos',    '10'),
    ('aviso_cancelacion_horas', '2'),
    ('max_cancelaciones_aviso', '3'),
    ('timezone', '"Europe/Madrid"'),
    ('slots_intervalo_minutos', '15')
    ON CONFLICT (key) DO NOTHING;

-- ==================== RLS NUEVAS TABLAS ====================

ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_combinados ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dias_cerrados ENABLE ROW LEVEL SECURITY;

-- Servicios: lectura pública, escritura admin
CREATE POLICY "Anyone can view active services" ON servicios
    FOR SELECT USING (activo = true);
CREATE POLICY "Admins can manage services" ON servicios
    FOR ALL USING (auth.role() = 'authenticated');

-- Servicios combinados: lectura pública, escritura admin
CREATE POLICY "Anyone can view active combos" ON servicios_combinados
    FOR SELECT USING (activo = true);
CREATE POLICY "Admins can manage combos" ON servicios_combinados
    FOR ALL USING (auth.role() = 'authenticated');

-- Clientes: solo admin (datos personales)
CREATE POLICY "Admins can manage clients" ON clientes
    FOR ALL USING (auth.role() = 'authenticated');

-- Días cerrados: lectura pública (para el formulario), escritura admin
CREATE POLICY "Anyone can view closed days" ON dias_cerrados
    FOR SELECT USING (true);
CREATE POLICY "Admins can manage closed days" ON dias_cerrados
    FOR ALL USING (auth.role() = 'authenticated');

-- ==================== FUNCIONES DE DISPONIBILIDAD ====================

-- Función para calcular hora_fin dado inicio y duración
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

-- Función para detectar solapamiento entre dos citas
CREATE OR REPLACE FUNCTION citas_se_solapan(
    inicio_a TEXT, fin_a TEXT,
    inicio_b TEXT, fin_b TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Convertir HH:MM a minutos para comparar
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

-- Vista: citas del día con datos completos
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

-- Trigger para auto-poblar hora_fin al insertar/actualizar reserva
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

-- Trigger para actualizar historial de cliente al completar una cita
CREATE OR REPLACE FUNCTION actualizar_historial_cliente()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo cuando se completa una cita
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        -- Buscar cliente por teléfono
        INSERT INTO clientes (nombre, telefono, total_visitas, ultima_visita, ultimo_servicio_nombre, updated_at)
        VALUES (
            NEW.customer_name,
            NEW.customer_phone,
            1,
            NEW.date,
            NEW.service_name,
            NOW()
        )
        ON CONFLICT (telefono) DO UPDATE SET
            total_visitas = clientes.total_visitas + 1,
            ultima_visita = NEW.date,
            ultimo_servicio_nombre = NEW.service_name,
            updated_at = NOW();

        -- Actualizar FK del cliente en la reserva
        UPDATE reservations SET
            cliente_id = (SELECT id FROM clientes WHERE telefono = NEW.customer_phone)
        WHERE id = NEW.id;
    END IF;

    -- Marcar cancelación tardía (<2h antes de la cita)
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('cancelled', 'rejected') THEN
        IF NEW.date::TIMESTAMPTZ + (
            SPLIT_PART(NEW.time,':',1)::INT * 60 + SPLIT_PART(NEW.time,':',2)::INT
        ) * INTERVAL '1 minute' - NOW() < INTERVAL '2 hours' THEN
            NEW.cancelacion_tardía := true;
            -- Incrementar contador en cliente
            UPDATE clientes
            SET cancelaciones_tardias = cancelaciones_tardias + 1,
                updated_at = NOW()
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

-- ==================== ÍNDICES ADICIONALES ====================
CREATE INDEX IF NOT EXISTS idx_reservations_phone ON reservations(customer_phone);
CREATE INDEX IF NOT EXISTS idx_dias_cerrados_fecha ON dias_cerrados(fecha);

-- ============================================================
-- RESUMEN DE LO QUE HACE ESTE SCRIPT:
-- 1. Tabla servicios: catálogo con duraciones, precios, colores
-- 2. Tabla servicios_combinados: packs con duración REAL
-- 3. Tabla clientes: historial de clientes, cancelaciones
-- 4. Tabla dias_cerrados: festivos y vacaciones
-- 5. Mejoras a reservations: hora_fin, FK a servicio/cliente
-- 6. Función calc_hora_fin: calcula hora de fin automáticamente
-- 7. Función citas_se_solapan: detecta solapamientos
-- 8. Vista vista_citas_hoy: citas de hoy con datos completos
-- 9. Trigger trg_set_hora_fin: calcula hora_fin automáticamente
-- 10. Trigger trg_historial_cliente: actualiza historial al completar
-- ============================================================
