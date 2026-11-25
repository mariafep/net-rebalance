import { supabase } from '../lib/supabase'
import type { AlertStatus, RebalanceAlert } from '../types/rebalance'

const alertFields = `
  id,
  user_id,
  portfolio_id,
  run_id,
  status,
  trigger_reason,
  max_deviation,
  total_portfolio_value,
  estimated_cost,
  cost_ratio,
  recommended_actions,
  ai_summary,
  notified_at,
  created_at
`

export const alertService = {
  async getAlerts(): Promise<RebalanceAlert[]> {
    const { data, error } = await supabase
      .from('rebalance_alerts')
      .select(alertFields)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return (data ?? []) as RebalanceAlert[]
  },

  async getPendingAlertsCount(): Promise<number> {
    const { count, error } = await supabase
      .from('rebalance_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) {
      throw error
    }

    return count ?? 0
  },

  async updateAlertStatus(
    alertId: string,
    status: AlertStatus,
  ): Promise<RebalanceAlert> {
    const { data, error } = await supabase
      .from('rebalance_alerts')
      .update({ status })
      .eq('id', alertId)
      .select(alertFields)
      .single()

    if (error) {
      throw error
    }

    return data as RebalanceAlert
  },
}
