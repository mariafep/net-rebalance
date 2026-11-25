import { supabase } from '../lib/supabase'
import type { RebalanceEvaluation } from '../types/rebalance'

export const rebalanceService = {
  async evaluatePortfolioRebalance(
    portfolioId: string,
    cashInjection = 0,
  ): Promise<RebalanceEvaluation> {
    const { data, error } = await supabase.rpc(
      'evaluate_portfolio_rebalance',
      {
        p_portfolio_id: portfolioId,
        p_cash_injection: cashInjection,
      },
    )

    if (error) {
      throw error
    }

    return data as RebalanceEvaluation
  },
}
