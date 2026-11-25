-- ============================================================================
-- NetRebalance — Migración 005: Perfil de Inversionista, Alertas y Motor SQL
-- ============================================================================
-- Descripción:
--   1. Extiende public.profiles con campos de perfil de riesgo del inversionista.
--   2. Crea public.rebalance_alerts con RLS granular (UPDATE solo en status)
--      e índice compuesto (portfolio_id, created_at DESC).
--   3. Centraliza la lógica matemática en el RPC evaluate_portfolio_rebalance
--      con Regla 5/25, modos traditional/cash_flow y cooldown de 7 días.
--
-- Idempotencia: Segura para reejecución múltiple.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. EXTENDER TABLA public.profiles (Perfil del Inversionista)
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS risk_profile TEXT,
  ADD COLUMN IF NOT EXISTS investment_horizon TEXT,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_risk_profile_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_risk_profile_check
      CHECK (risk_profile IS NULL OR risk_profile IN ('conservative', 'moderate', 'aggressive'));
  END IF;
END
$$;

-- Asegurar RLS y permisos de lectura/actualización para el propio usuario
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY "profiles_select_own"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "profiles_update_own"
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END
$$;


-- ----------------------------------------------------------------------------
-- 2. CREAR TABLA public.rebalance_alerts
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rebalance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  run_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  trigger_reason TEXT NOT NULL,
  max_deviation NUMERIC NOT NULL,
  total_portfolio_value NUMERIC NOT NULL,
  estimated_cost NUMERIC NOT NULL,
  cost_ratio NUMERIC NOT NULL,
  recommended_actions JSONB NOT NULL,
  ai_summary TEXT NULL,
  notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rebalance_alerts_status_check
    CHECK (status IN ('pending', 'executed', 'dismissed'))
);

-- Índice compuesto para acelerar historial y verificación de cooldown
CREATE INDEX IF NOT EXISTS idx_rebalance_alerts_portfolio_created_at
  ON public.rebalance_alerts (portfolio_id, created_at DESC);

-- Seguridad RLS + Privilegios por columna
ALTER TABLE public.rebalance_alerts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rebalance_alerts FROM anon;
REVOKE ALL ON public.rebalance_alerts FROM authenticated;

GRANT SELECT ON public.rebalance_alerts TO authenticated;
GRANT UPDATE (status) ON public.rebalance_alerts TO authenticated;
GRANT ALL ON public.rebalance_alerts TO service_role;

DROP POLICY IF EXISTS "rebalance_alerts_select_own" ON public.rebalance_alerts;
CREATE POLICY "rebalance_alerts_select_own"
  ON public.rebalance_alerts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "rebalance_alerts_update_own_status" ON public.rebalance_alerts;
CREATE POLICY "rebalance_alerts_update_own_status"
  ON public.rebalance_alerts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ----------------------------------------------------------------------------
-- 3. RPC CENTRALIZADO: evaluate_portfolio_rebalance
-- ----------------------------------------------------------------------------
-- Parámetros:
--   p_portfolio_id   : UUID del portafolio a evaluar
--   p_cash_injection : Monto de aporte en efectivo (>= 0).
--                      0 = Modo 'traditional' (compras y ventas)
--                      > 0 = Modo 'cash_flow' (solo compras sobre déficit)
--
-- Convenciones del esquema NetRebalance:
--   - portfolio_assets.target_weight: escala 0..100 (ej. 60 = 60%)
--   - brokers.percentage_commission y spread_percentage: fracciones (ej. 0.005 = 0.5%)
--   - brokers.fixed_commission: monto monetario por orden
--   - Regla 5/25: desviación >= 5% absoluto (0.05) o >= 25% relativo (0.25)
--   - Cooldown: 7 días desde la última alerta registrada para el portafolio
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.evaluate_portfolio_rebalance(
  p_portfolio_id UUID,
  p_cash_injection NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio public.portfolios%ROWTYPE;
  v_fixed_commission NUMERIC := 0;
  v_pct_commission NUMERIC := 0;
  v_spread_pct NUMERIC := 0;

  v_mode TEXT;
  v_total_value NUMERIC := 0;
  v_new_total_value NUMERIC := 0;
  v_total_deficit NUMERIC := 0;
  v_redistribution_amount NUMERIC := 0;
  v_estimated_cost NUMERIC := 0;
  v_cost_ratio NUMERIC := 0;
  v_cost_acceptable BOOLEAN := FALSE;
  v_has_significant_deviation BOOLEAN := FALSE;
  v_max_deviation NUMERIC := 0;
  v_in_cooldown BOOLEAN := FALSE;
  v_should_notify BOOLEAN := FALSE;

  v_missing_price_count INTEGER := 0;
  v_asset_count INTEGER := 0;
  v_actions JSONB := '[]'::JSONB;

  c_zero_tolerance CONSTANT NUMERIC := 0.01;
  c_max_cost_ratio CONSTANT NUMERIC := 0.02;
BEGIN
  -- Validación de parámetro de entrada
  IF p_cash_injection IS NULL OR p_cash_injection < 0 THEN
    RAISE EXCEPTION 'p_cash_injection debe ser mayor o igual a 0'
      USING ERRCODE = '22023';
  END IF;

  -- Obtener portafolio
  SELECT *
  INTO v_portfolio
  FROM public.portfolios
  WHERE id = p_portfolio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portafolio no encontrado: %', p_portfolio_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Control de acceso cuando se invoca desde usuario autenticado (no service_role)
  IF auth.uid() IS NOT NULL AND v_portfolio.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tienes permiso para evaluar este portafolio'
      USING ERRCODE = '42501';
  END IF;

  -- Obtener costos del broker (si está asignado)
  IF v_portfolio.broker_id IS NOT NULL THEN
    SELECT
      COALESCE(fixed_commission, 0),
      COALESCE(percentage_commission, 0),
      COALESCE(spread_percentage, 0)
    INTO
      v_fixed_commission,
      v_pct_commission,
      v_spread_pct
    FROM public.brokers
    WHERE id = v_portfolio.broker_id;
  END IF;

  v_mode := CASE WHEN p_cash_injection > 0 THEN 'cash_flow' ELSE 'traditional' END;

  -- Tabla temporal con el snapshot de posiciones y precios vigentes
  CREATE TEMP TABLE _eval_positions (
    asset_id UUID,
    ticker TEXT,
    quantity NUMERIC,
    target_weight NUMERIC,
    price NUMERIC,
    current_value NUMERIC,
    current_weight NUMERIC,
    deviation NUMERIC,
    is_deviated BOOLEAN,
    raw_adjustment NUMERIC,
    deficit NUMERIC,
    action TEXT,
    amount NUMERIC,
    order_cost NUMERIC
  ) ON COMMIT DROP;

  INSERT INTO _eval_positions (
    asset_id, ticker, quantity, target_weight, price, current_value
  )
  SELECT
    pa.asset_id,
    a.ticker,
    COALESCE(pa.quantity, 0),
    COALESCE(pa.target_weight, 0),
    lap.price,
    COALESCE(pa.quantity, 0) * COALESCE(lap.price, 0)
  FROM public.portfolio_assets pa
  JOIN public.assets a ON a.id = pa.asset_id
  LEFT JOIN public.latest_asset_prices lap ON lap.asset_id = pa.asset_id
  WHERE pa.portfolio_id = p_portfolio_id
  ORDER BY a.ticker ASC;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE price IS NULL OR price <= 0)
  INTO v_asset_count, v_missing_price_count
  FROM _eval_positions;

  IF v_asset_count = 0 THEN
    RAISE EXCEPTION 'El portafolio % no tiene activos configurados', p_portfolio_id
      USING ERRCODE = '22023';
  END IF;

  IF v_missing_price_count > 0 THEN
    RAISE EXCEPTION 'Faltan precios actualizados para uno o más activos del portafolio %', p_portfolio_id
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(current_value), 0)
  INTO v_total_value
  FROM _eval_positions;

  -- Calcular pesos actuales, desviaciones (en puntos porcentuales) y Regla 5/25
  UPDATE _eval_positions
  SET
    current_weight = CASE
      WHEN v_total_value > 0 THEN (current_value / v_total_value) * 100.0
      ELSE 0
    END
  WHERE asset_id IS NOT NULL;

  UPDATE _eval_positions
  SET
    deviation = current_weight - target_weight,
    is_deviated = CASE
      WHEN v_total_value <= 0 THEN FALSE
      WHEN ABS((current_weight - target_weight) / 100.0) >= 0.05 THEN TRUE
      WHEN (target_weight / 100.0) > 0
           AND (ABS((current_weight - target_weight) / 100.0) / (target_weight / 100.0)) >= 0.25 THEN TRUE
      ELSE FALSE
    END
  WHERE asset_id IS NOT NULL;

  SELECT
    COALESCE(BOOL_OR(is_deviated), FALSE),
    COALESCE(MAX(ABS(deviation)), 0)
  INTO
    v_has_significant_deviation,
    v_max_deviation
  FROM _eval_positions;

  -- Cálculo según el modo de operación
  IF v_mode = 'traditional' THEN
    IF v_total_value > 0 THEN
      UPDATE _eval_positions
      SET raw_adjustment = (v_total_value * (target_weight / 100.0)) - current_value
      WHERE asset_id IS NOT NULL;

      UPDATE _eval_positions
      SET
        action = CASE
          WHEN raw_adjustment >= c_zero_tolerance THEN 'BUY'
          WHEN raw_adjustment <= -c_zero_tolerance THEN 'SELL'
          ELSE 'HOLD'
        END,
        amount = CASE
          WHEN ABS(raw_adjustment) >= c_zero_tolerance THEN ROUND(ABS(raw_adjustment), 2)
          ELSE 0
        END
      WHERE asset_id IS NOT NULL;

      -- Monto redistribuido (lado único = suma de ajustes absolutos / 2)
      SELECT COALESCE(SUM(ABS(raw_adjustment)), 0) / 2.0
      INTO v_redistribution_amount
      FROM _eval_positions;
    ELSE
      UPDATE _eval_positions
      SET action = 'HOLD', amount = 0, raw_adjustment = 0
      WHERE asset_id IS NOT NULL;
      v_redistribution_amount := 0;
    END IF;
  ELSE
    -- Modo 'cash_flow' (Solo Compras): distribuir p_cash_injection entre activos subponderados
    v_new_total_value := v_total_value + p_cash_injection;

    UPDATE _eval_positions
    SET deficit = GREATEST(0, (v_new_total_value * (target_weight / 100.0)) - current_value)
    WHERE asset_id IS NOT NULL;

    SELECT COALESCE(SUM(deficit), 0)
    INTO v_total_deficit
    FROM _eval_positions;

    IF v_total_deficit > 0 THEN
      UPDATE _eval_positions
      SET
        raw_adjustment = CASE
          WHEN deficit > 0 THEN p_cash_injection * (deficit / v_total_deficit)
          ELSE 0
        END
      WHERE asset_id IS NOT NULL;

      UPDATE _eval_positions
      SET
        action = CASE
          WHEN raw_adjustment >= c_zero_tolerance THEN 'BUY'
          ELSE 'HOLD'
        END,
        amount = CASE
          WHEN raw_adjustment >= c_zero_tolerance THEN ROUND(raw_adjustment, 2)
          ELSE 0
        END
      WHERE asset_id IS NOT NULL;
    ELSE
      UPDATE _eval_positions
      SET action = 'HOLD', amount = 0, raw_adjustment = 0
      WHERE asset_id IS NOT NULL;
    END IF;

    v_redistribution_amount := p_cash_injection;
  END IF;

  -- Calcular costos de transacción por orden activa (BUY / SELL)
  UPDATE _eval_positions
  SET order_cost = CASE
    WHEN action IN ('BUY', 'SELL') AND amount >= c_zero_tolerance THEN
      v_fixed_commission + (amount * v_pct_commission) + (amount * v_spread_pct)
    ELSE 0
  END
  WHERE asset_id IS NOT NULL;

  SELECT COALESCE(SUM(order_cost), 0)
  INTO v_estimated_cost
  FROM _eval_positions;

  IF v_redistribution_amount > 0 THEN
    v_cost_ratio := v_estimated_cost / v_redistribution_amount;
    v_cost_acceptable := (v_cost_ratio <= c_max_cost_ratio);
  ELSE
    v_cost_ratio := 0;
    v_cost_acceptable := FALSE;
  END IF;

  -- Control de cooldown: alerta previa en los últimos 7 días
  SELECT EXISTS (
    SELECT 1
    FROM public.rebalance_alerts ra
    WHERE ra.portfolio_id = p_portfolio_id
      AND ra.created_at >= (now() - INTERVAL '7 days')
  )
  INTO v_in_cooldown;

  v_should_notify := v_has_significant_deviation AND v_cost_acceptable AND NOT v_in_cooldown;

  -- Construir arreglo JSONB de acciones recomendadas
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'asset_id', asset_id,
        'ticker', ticker,
        'action', action,
        'amount', ROUND(amount, 2),
        'current_weight', ROUND(current_weight, 4),
        'target_weight', ROUND(target_weight, 4),
        'deviation', ROUND(deviation, 4),
        'is_deviated', is_deviated
      )
      ORDER BY ticker ASC
    ),
    '[]'::JSONB
  )
  INTO v_actions
  FROM _eval_positions;

  RETURN jsonb_build_object(
    'portfolio_id', p_portfolio_id,
    'mode', v_mode,
    'total_value', ROUND(v_total_value, 2),
    'cash_injection', ROUND(p_cash_injection, 2),
    'has_significant_deviation', v_has_significant_deviation,
    'estimated_cost', ROUND(v_estimated_cost, 2),
    'cost_ratio', ROUND(v_cost_ratio, 6),
    'cost_acceptable', v_cost_acceptable,
    'in_cooldown', v_in_cooldown,
    'should_notify', v_should_notify,
    'max_deviation', ROUND(v_max_deviation, 4),
    'actions', v_actions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_portfolio_rebalance(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_portfolio_rebalance(UUID, NUMERIC) TO authenticated, service_role;

COMMIT;
