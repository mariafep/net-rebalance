import { supabase } from '../lib/supabase'

export type AuditRiskAlignment =
  | 'aligned'
  | 'moderate_mismatch'
  | 'high_mismatch'

export type AuditCategory =
  | 'overlap'
  | 'concentration'
  | 'risk_mismatch'
  | 'diversification'
  | 'trend'

export type AuditSeverity = 'low' | 'medium' | 'high'

export interface AuditFinding {
  category: AuditCategory
  severity: AuditSeverity
  title: string
  detail: string
}

export interface AssetTrend30d {
  asset_id: string
  ticker: string
  latest_price: number | null
  latest_date: string | null
  reference_price: number | null
  reference_date: string | null
  change_pct: number | null
  days_span: number
}

export interface PortfolioAuditResult {
  overall_score: number
  risk_alignment: AuditRiskAlignment
  summary: string
  findings: AuditFinding[]
  recommendations: string[]
  trends_30d: AssetTrend30d[]
  disclaimer: string
}

export const auditService = {
  async runPortfolioAudit(portfolioId: string): Promise<PortfolioAuditResult> {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente para auditar.')
    }

    const { data, error } = await supabase.functions.invoke<PortfolioAuditResult>(
      'audit-portfolio',
      {
        body: { portfolio_id: portfolioId },
      },
    )

    if (error) {
      throw new Error(
        error.message || 'No se pudo completar la auditoría IA del portafolio.',
      )
    }

    if (!data) {
      throw new Error('La función de auditoría no devolvió resultados.')
    }

    return data
  },
}
