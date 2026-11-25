import { supabase } from '../lib/supabase'
import type {
  PortfolioPerformancePoint,
  PortfolioTransaction,
  RecordTransactionPayload,
} from '../types/transaction'

const txFields = `
  id,
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
  notes,
  created_at
`

export const transactionService = {
  async getPortfolioTransactions(
    portfolioId: string,
  ): Promise<PortfolioTransaction[]> {
    const { data, error } = await supabase
      .from('portfolio_transactions')
      .select(txFields)
      .eq('portfolio_id', portfolioId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return (data ?? []) as PortfolioTransaction[]
  },

  async recordTransaction(
    payload: RecordTransactionPayload,
  ): Promise<{ transaction_id: string; total_amount: number; realized_pnl: number | null }> {
    const { data, error } = await supabase.rpc('record_portfolio_transaction', {
      p_portfolio_id: payload.portfolio_id,
      p_asset_id: payload.asset_id,
      p_transaction_type: payload.transaction_type,
      p_quantity: payload.quantity,
      p_unit_price: payload.unit_price,
      p_fees: payload.fees ?? 0,
      p_transaction_date: payload.transaction_date ?? null,
      p_notes: payload.notes ?? null,
    })

    if (error) {
      throw error
    }

    return data
  },

  async getPerformanceHistory(
    portfolioId: string,
    days = 365,
  ): Promise<PortfolioPerformancePoint[]> {
    const { data, error } = await supabase.rpc(
      'get_portfolio_performance_history',
      {
        p_portfolio_id: portfolioId,
        p_days: days,
      },
    )

    if (error) {
      throw error
    }

    return (Array.isArray(data) ? data : []) as PortfolioPerformancePoint[]
  },
}
