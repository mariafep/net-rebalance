-- ============================================================================
-- NetRebalance — Migración 007: Transacciones Activas, ROI y Crecimiento
-- ============================================================================
-- Descripción:
--   1. Crea public.portfolio_transactions para registrar lotes de compra/venta,
--      fechas de operación, comisiones y P&L realizado.
--   2. Crea RPC record_portfolio_transaction para registrar compras/ventas y
--      sincronizar automáticamente portfolio_assets (cantidad y costo promedio).
--   3. Crea RPC get_portfolio_performance_history para graficar el crecimiento
--      histórico de la cartera (Valor vs. Capital Invertido y ROI %).
--
-- Idempotencia: Segura para reejecución múltiple.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. TABLA public.portfolio_transactions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.portfolio_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('BUY', 'SELL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  fees NUMERIC NOT NULL DEFAULT 0 CHECK (fees >= 0),
  realized_pnl NUMERIC NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_transactions_portfolio_date
  ON public.portfolio_transactions (portfolio_id, transaction_date DESC, created_at DESC);

ALTER TABLE public.portfolio_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.portfolio_transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_transactions TO authenticated;
GRANT ALL ON public.portfolio_transactions TO service_role;

DROP POLICY IF EXISTS "portfolio_transactions_select_own" ON public.portfolio_transactions;
CREATE POLICY "portfolio_transactions_select_own"
  ON public.portfolio_transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "portfolio_transactions_insert_own" ON public.portfolio_transactions;
CREATE POLICY "portfolio_transactions_insert_own"
  ON public.portfolio_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "portfolio_transactions_update_own" ON public.portfolio_transactions;
CREATE POLICY "portfolio_transactions_update_own"
  ON public.portfolio_transactions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "portfolio_transactions_delete_own" ON public.portfolio_transactions;
CREATE POLICY "portfolio_transactions_delete_own"
  ON public.portfolio_transactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());


-- ----------------------------------------------------------------------------
-- 2. RPC: record_portfolio_transaction
-- ----------------------------------------------------------------------------
-- Registra una compra o venta y actualiza automáticamente portfolio_assets
-- (cantidad total y costo promedio ponderado en compras; P&L realizado en ventas).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_portfolio_transaction(
  p_portfolio_id UUID,
  p_asset_id UUID,
  p_transaction_type TEXT,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_fees NUMERIC DEFAULT 0,
  p_transaction_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio public.portfolios%ROWTYPE;
  v_position public.portfolio_assets%ROWTYPE;
  v_total_amount NUMERIC;
  v_new_qty NUMERIC;
  v_new_avg_cost NUMERIC;
  v_realized_pnl NUMERIC := NULL;
  v_tx_id UUID;
BEGIN
  IF p_transaction_type NOT IN ('BUY', 'SELL') THEN
    RAISE EXCEPTION 'Tipo de transacción inválido: %', p_transaction_type USING ERRCODE = '22023';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0' USING ERRCODE = '22023';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'El precio unitario no puede ser negativo' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_portfolio FROM public.portfolios WHERE id = p_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portafolio no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL AND v_portfolio.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tienes permiso sobre este portafolio' USING ERRCODE = '42501';
  END IF;

  v_total_amount := ROUND(p_quantity * p_unit_price, 6);

  SELECT *
  INTO v_position
  FROM public.portfolio_assets
  WHERE portfolio_id = p_portfolio_id
    AND asset_id = p_asset_id;

  IF p_transaction_type = 'BUY' THEN
    IF FOUND THEN
      v_new_qty := COALESCE(v_position.quantity, 0) + p_quantity;
      v_new_avg_cost := CASE
        WHEN v_new_qty > 0 THEN
          ((COALESCE(v_position.quantity, 0) * COALESCE(v_position.average_cost, p_unit_price)) + v_total_amount) / v_new_qty
        ELSE p_unit_price
      END;

      UPDATE public.portfolio_assets
      SET
        quantity = v_new_qty,
        average_cost = ROUND(v_new_avg_cost, 4),
        updated_at = now()
      WHERE id = v_position.id;
    ELSE
      INSERT INTO public.portfolio_assets (
        portfolio_id, asset_id, quantity, average_cost, target_weight
      ) VALUES (
        p_portfolio_id, p_asset_id, p_quantity, ROUND(p_unit_price, 4), 0
      );
    END IF;
  ELSE
    -- SELL
    IF NOT FOUND OR COALESCE(v_position.quantity, 0) < p_quantity THEN
      RAISE EXCEPTION 'Cantidad insuficiente para vender (disponible: %)', COALESCE(v_position.quantity, 0)
        USING ERRCODE = '22023';
    END IF;

    v_new_qty := v_position.quantity - p_quantity;
    v_realized_pnl := ROUND(
      ((p_unit_price - COALESCE(v_position.average_cost, p_unit_price)) * p_quantity) - COALESCE(p_fees, 0),
      2
    );

    UPDATE public.portfolio_assets
    SET
      quantity = v_new_qty,
      updated_at = now()
    WHERE id = v_position.id;
  END IF;

  INSERT INTO public.portfolio_transactions (
    user_id,
    portfolio_id,
    asset_id,
    transaction_type,
    status,
    quantity,
    unit_price,
    total_amount,
    fees,
    realized_pnl,
    transaction_date,
    notes
  ) VALUES (
    v_portfolio.user_id,
    p_portfolio_id,
    p_asset_id,
    p_transaction_type,
    CASE WHEN p_transaction_type = 'SELL' THEN 'CLOSED' ELSE 'OPEN' END,
    p_quantity,
    p_unit_price,
    v_total_amount,
    COALESCE(p_fees, 0),
    v_realized_pnl,
    COALESCE(p_transaction_date, CURRENT_DATE),
    p_notes
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'transaction_type', p_transaction_type,
    'total_amount', ROUND(v_total_amount, 2),
    'realized_pnl', v_realized_pnl
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_portfolio_transaction(UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_portfolio_transaction(UUID, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, DATE, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. RPC: get_portfolio_performance_history
-- ----------------------------------------------------------------------------
-- Reconstruye la serie histórica de crecimiento del portafolio:
--   - Capital invertido acumulado por fecha de transacción
--   - Valor de mercado estimado usando cotizaciones históricas (o costo unitario
--     como fallback para fechas previas a la primera cotización en asset_prices)
--   - P&L no realizado y ROI %
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_portfolio_performance_history(
  p_portfolio_id UUID,
  p_days INTEGER DEFAULT 365
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio public.portfolios%ROWTYPE;
  v_min_date DATE;
  v_history JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_portfolio FROM public.portfolios WHERE id = p_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portafolio no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL AND v_portfolio.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No tienes permiso sobre este portafolio' USING ERRCODE = '42501';
  END IF;

  SELECT MIN(transaction_date)
  INTO v_min_date
  FROM public.portfolio_transactions
  WHERE portfolio_id = p_portfolio_id;

  IF v_min_date IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  v_min_date := GREATEST(v_min_date, CURRENT_DATE - COALESCE(p_days, 365));

  WITH event_dates AS (
    -- Fechas clave: días con transacciones, días con precios registrados y hoy
    SELECT DISTINCT d AS ref_date
    FROM (
      SELECT transaction_date AS d
      FROM public.portfolio_transactions
      WHERE portfolio_id = p_portfolio_id
        AND transaction_date >= v_min_date
      UNION
      SELECT ap.price_date AS d
      FROM public.asset_prices ap
      JOIN public.portfolio_assets pa ON pa.asset_id = ap.asset_id
      WHERE pa.portfolio_id = p_portfolio_id
        AND ap.price_date >= v_min_date
      UNION
      SELECT CURRENT_DATE AS d
    ) all_dates
    WHERE d <= CURRENT_DATE
    ORDER BY d ASC
  ),
  portfolio_assets_list AS (
    SELECT DISTINCT asset_id
    FROM (
      SELECT asset_id FROM public.portfolio_assets WHERE portfolio_id = p_portfolio_id
      UNION
      SELECT asset_id FROM public.portfolio_transactions WHERE portfolio_id = p_portfolio_id
    ) u
  ),
  daily_valuation AS (
    SELECT
      ed.ref_date,
      COALESCE(SUM(
        holdings.net_qty * COALESCE(px.price, holdings.avg_tx_price, 0)
      ), 0) AS portfolio_value,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN pt.transaction_type = 'BUY' THEN pt.total_amount + pt.fees
            ELSE -(pt.total_amount - pt.fees)
          END
        )
        FROM public.portfolio_transactions pt
        WHERE pt.portfolio_id = p_portfolio_id
          AND pt.transaction_date <= ed.ref_date
      ), 0) AS invested_capital
    FROM event_dates ed
    CROSS JOIN portfolio_assets_list pal
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(CASE WHEN pt.transaction_type = 'BUY' THEN pt.quantity ELSE -pt.quantity END), 0) AS net_qty,
        AVG(pt.unit_price) AS avg_tx_price
      FROM public.portfolio_transactions pt
      WHERE pt.portfolio_id = p_portfolio_id
        AND pt.asset_id = pal.asset_id
        AND pt.transaction_date <= ed.ref_date
    ) holdings ON TRUE
    LEFT JOIN LATERAL (
      SELECT ap.price
      FROM public.asset_prices ap
      WHERE ap.asset_id = pal.asset_id
        AND ap.price_date <= ed.ref_date
      ORDER BY ap.price_date DESC, ap.created_at DESC
      LIMIT 1
    ) px ON TRUE
    GROUP BY ed.ref_date
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'date', dv.ref_date,
        'portfolio_value', ROUND(dv.portfolio_value, 2),
        'invested_capital', ROUND(dv.invested_capital, 2),
        'unrealized_pnl', ROUND(dv.portfolio_value - dv.invested_capital, 2),
        'roi_pct', CASE
          WHEN dv.invested_capital > 0
          THEN ROUND(((dv.portfolio_value - dv.invested_capital) / dv.invested_capital) * 100.0, 2)
          ELSE 0
        END
      )
      ORDER BY dv.ref_date ASC
    ),
    '[]'::JSONB
  )
  INTO v_history
  FROM daily_valuation dv
  WHERE dv.invested_capital > 0 OR dv.portfolio_value > 0;

  RETURN v_history;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portfolio_performance_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portfolio_performance_history(UUID, INTEGER) TO authenticated, service_role;

COMMIT;
