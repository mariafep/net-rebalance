import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DISCLAIMER =
  'Análisis informativo generado por IA. No constituye asesoría financiera regulada.'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: 'Supabase environment not configured' }, 500)
    }

    if (!openAiApiKey) {
      return jsonResponse({ error: 'OPENAI_API_KEY is not configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    // Cliente Supabase con el JWT del usuario para respetar RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = await req.json().catch(() => null)
    const portfolioId = body?.portfolio_id

    if (!portfolioId || typeof portfolioId !== 'string') {
      return jsonResponse({ error: 'portfolio_id is required' }, 400)
    }

    // 1. Obtener portafolio, broker y activos (protegido por RLS)
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select(`
        id,
        user_id,
        name,
        currency,
        status,
        brokers (
          id,
          name,
          currency,
          fixed_commission,
          percentage_commission,
          spread_percentage
        ),
        portfolio_assets (
          asset_id,
          quantity,
          target_weight,
          average_cost,
          assets (
            id,
            ticker,
            name,
            asset_type,
            exchange,
            currency
          )
        )
      `)
      .eq('id', portfolioId)
      .single()

    if (portfolioError || !portfolio) {
      return jsonResponse(
        { error: 'Portafolio no encontrado o sin acceso' },
        404,
      )
    }

    // 2. Obtener perfil del inversionista
    const { data: profile } = await supabase
      .from('profiles')
      .select('risk_profile, investment_horizon, risk_score')
      .eq('id', user.id)
      .single()

    // 3. Evaluar rebalanceo actual (si hay precios faltantes, no abortamos la auditoría)
    const { data: rebalanceEval, error: evalError } = await supabase.rpc(
      'evaluate_portfolio_rebalance',
      {
        p_portfolio_id: portfolioId,
        p_cash_injection: 0,
      },
    )

    // 4. Obtener tendencias históricas de 30 días
    const { data: trends30d, error: trendsError } = await supabase.rpc(
      'get_portfolio_30d_trends',
      {
        p_portfolio_id: portfolioId,
      },
    )

    if (trendsError) {
      console.warn('Error consultando get_portfolio_30d_trends:', trendsError.message)
    }

    const safeTrends = Array.isArray(trends30d) ? trends30d : []

    const auditContext = {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        currency: portfolio.currency,
        status: portfolio.status,
        broker: portfolio.brokers,
        positions: portfolio.portfolio_assets,
      },
      investor_profile: profile ?? {
        risk_profile: null,
        investment_horizon: null,
        risk_score: null,
      },
      rebalance_evaluation: evalError ? { unavailable_reason: evalError.message } : rebalanceEval,
      trends_30d: safeTrends,
    }

    const systemPrompt = `Eres un auditor informativo senior de portafolios de inversión bajo la metodología Core & Satellite (NetRebalance).
Tu tarea es auditar el portafolio proporcionado utilizando EXCLUSIVAMENTE los datos reales del JSON entregado. Nunca inventes precios, tickers ni rentabilidades que no estén en los datos.

Debes evaluar obligatoriamente estos 4 ejes:
1. Solapamiento de ETFs (category: "overlap"): Detecta índices o exposiciones redundantes (ej. VOO + SPY, VOO + VTI, QQQ + alta concentración tech similar).
2. Concentración de riesgo y diversificación (category: "concentration" o "diversification"): Evalúa exceso de peso en un solo activo, sector o geografía (ej. >35-40% en una sola acción individual o falta de diversificación).
3. Alineación con el perfil de riesgo (category: "risk_mismatch"): Compara la composición y volatilidad implícita del portafolio frente a investor_profile.risk_profile ("conservative" ~85/15, "moderate" ~75/25, "aggressive" ~60/40) y investment_horizon. Si risk_profile es null, indícalo como hallazgo para que complete su perfilador.
4. Contexto de tendencia reciente (category: "trend"): Analiza las variaciones de los últimos 30 días (change_pct y days_span en trends_30d) sin dar consejos de market timing.

Responde ÚNICAMENTE con un objeto JSON válido con exactamente esta estructura y valores permitidos:
{
  "overall_score": <entero de 0 a 100>,
  "risk_alignment": "<'aligned' | 'moderate_mismatch' | 'high_mismatch'>",
  "summary": "<Resumen ejecutivo breve de 2 a 3 líneas en español>",
  "findings": [
    {
      "category": "<'overlap' | 'concentration' | 'risk_mismatch' | 'diversification' | 'trend'>",
      "severity": "<'low' | 'medium' | 'high'>",
      "title": "<Título concreto>",
      "detail": "<Explicación concreta basada en los pesos y cifras reales>"
    }
  ],
  "recommendations": [
    "<Acción informativa sugerida 1>",
    "<Acción informativa sugerida 2>"
  ]
}`

    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Audita el siguiente portafolio:\n${JSON.stringify(auditContext)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!openAiRes.ok) {
      const errText = await openAiRes.text()
      console.error('OpenAI API error:', openAiRes.status, errText)
      return jsonResponse(
        { error: `Error al consultar OpenAI (${openAiRes.status})` },
        502,
      )
    }

    const openAiJson = await openAiRes.json()
    const rawContent = openAiJson?.choices?.[0]?.message?.content

    if (!rawContent) {
      return jsonResponse({ error: 'Respuesta vacía de OpenAI' }, 502)
    }

    const parsed = JSON.parse(rawContent)

    return jsonResponse({
      overall_score: Number(parsed.overall_score ?? 0),
      risk_alignment: ['aligned', 'moderate_mismatch', 'high_mismatch'].includes(parsed.risk_alignment)
        ? parsed.risk_alignment
        : 'moderate_mismatch',
      summary: parsed.summary ?? '',
      findings: Array.isArray(parsed.findings) ? parsed.findings : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      trends_30d: safeTrends,
      disclaimer: DISCLAIMER,
    })
  } catch (err) {
    console.error('Error en audit-portfolio:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return jsonResponse({ error: message }, 500)
  }
})
