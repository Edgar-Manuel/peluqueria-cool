-- ============================================================
-- 20260518120000 — add_idempotency_to_reservations
-- ============================================================
-- Fase 1: cerrar el doble camino de creación.
-- La Edge Function `create-appointment` pasa a ser la única vía;
-- esta columna permite reintentos seguros desde web/Notis/admin
-- sin duplicar reservas.
-- ============================================================

ALTER TABLE reservations
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Índice único parcial: solo aplica a filas que tengan clave.
-- Las reservas antiguas (NULL) no se ven afectadas.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reservations_idempotency_key
    ON reservations(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN reservations.idempotency_key IS
'UUID generado por el cliente (web/Notis/admin) en cada intento de crear cita. La Edge Function create-appointment lo guarda y, si vuelve a recibir el mismo, devuelve la reserva existente en lugar de crear una nueva. Soporta reintentos por timeout/red sin duplicar.';
