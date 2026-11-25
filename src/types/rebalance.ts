export type RebalanceMode = 'traditional' | 'cash_flow'

export type RebalanceActionType = 'BUY' | 'SELL' | 'HOLD'

export interface RebalanceActionItem {
  asset_id: string
  ticker: string
  action: RebalanceActionType
  amount: number
  current_weight: number
  target_weight: number
  deviation: number
  is_deviated?: boolean
}

export interface RebalanceEvaluation {
  portfolio_id: string
  mode: RebalanceMode
  total_value: number
  cash_injection: number
  has_significant_deviation: boolean
  estimated_cost: number
  cost_ratio: number
  cost_acceptable: boolean
  in_cooldown: boolean
  should_notify: boolean
  max_deviation: number
  actions: RebalanceActionItem[]
}

export type AlertStatus = 'pending' | 'executed' | 'dismissed'

export interface RebalanceAlert {
  id: string
  user_id: string
  portfolio_id: string
  run_id: string | null
  status: AlertStatus
  trigger_reason: string
  max_deviation: number
  total_portfolio_value: number
  estimated_cost: number
  cost_ratio: number
  recommended_actions: RebalanceActionItem[]
  ai_summary: string | null
  notified_at: string | null
  created_at: string
}
