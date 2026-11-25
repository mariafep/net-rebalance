-- ============================================================================
-- NetRebalance — Migración 006: Tendencias Históricas 30 Días (RPC)
-- ============================================================================
-- Descripción:
--   Crea el RPC public.get_portfolio_30d_trends(p_portfolio_id UUID) que retorna
--   un arreglo JSONB con la variación de precio de cada activo del portafolio
--   comparando el último precio vigente contra el precio más cercano a 30 días
--   antes (con fallback al registro más antiguo disponible anterior al cierre).
--
-- Idempotencia: Segura para reejecución múltiple.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_portfolio_30d_trends(
  p_portfolio_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio public.portfolios%ROWTYPE;
  v_trends JSONB := '[]'::JSONB;
BEGIN
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
    RAISE EXCEPTION 'No tienes permiso para consultar tendencias de este portafolio'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'asset_id', t.asset_id,
        'ticker', t.ticker,
        'latest_price', t.latest_price,
        'latest_date', t.latest_date,
        'reference_price', t.reference_price,
        'reference_date', t.reference_date,
        'change_pct', CASE
          WHEN t.latest_price IS NOT NULL
               AND t.reference_price IS NOT NULL
               AND t.reference_price > 0
          THEN ROUND(((t.latest_price - t.reference_price) / t.reference_price) * 100.0, 2)
          ELSE NULL
        END,
        'days_span', CASE
          WHEN t.latest_date IS NOT NULL AND t.reference_date IS NOT NULL
          THEN (t.latest_date - t.reference_date)
          ELSE 0
        END
      )
      ORDER BY t.ticker ASC
    ),
    '[]'::JSONB
  )
  INTO v_trends
  FROM (
    SELECT
      pa.asset_id,
      a.ticker,
      lap.price AS latest_price,
      lap.price_date AS latest_date,
      ref.price AS reference_price,
      ref.price_date AS reference_date
    FROM public.portfolio_assets pa
    JOIN public.assets a ON a.id = pa.asset_id
    LEFT JOIN public.latest_asset_prices lap ON lap.asset_id = pa.asset_id
    LEFT JOIN LATERAL (
      SELECT
        ap.price,
        ap.price_date
      FROM public.asset_prices ap
      WHERE ap.asset_id = pa.asset_id
        AND lap.price_date IS NOT NULL
        AND ap.price_date < lap.price_date
      ORDER BY
        ABS(ap.price_date - (lap.price_date - INTERVAL '30 days')::DATE) ASC,
        ap.price_date ASC,
        ap.created_at DESC
      LIMIT 1
    ) ref ON TRUE
    WHERE pa.portfolio_id = p_portfolio_id
  ) t;

  RETURN v_trends;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portfolio_30d_trends(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portfolio_30d_trends(UUID) TO authenticated, service_role;

COMMIT;
