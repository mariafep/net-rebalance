export type TransactionType = 'BUY' | 'SELL'
export type TransactionStatus = 'OPEN' | 'CLOSED'

export interface PortfolioTransaction {
  id: string
  user_id: string
  portfolio_id: string
  asset_id: string
  transaction_type: TransactionType
  status: TransactionStatus
  quantity: number
  unit_price: number
  total_amount: number
  fees: number
  realized_pnl: number | null
  transaction_date: string
  notes: string | null
  created_at: string
}

export interface RecordTransactionPayload {
  portfolio_id: string
  asset_id: string
  transaction_type: TransactionType
  quantity: number
  unit_price: number
  fees?: number
  transaction_date?: string
  notes?: string
}

export interface PortfolioPerformancePoint {
  date: string
  portfolio_value: number
  invested_capital: number
  unrealized_pnl: number
  roi_pct: number
}
