import { supabase } from '../lib/supabase'
import type {
    Portfolio,
    PortfolioFormData,
} from '../types/portfolio'

const portfolioFields = `
  id,
  user_id,
  broker_id,
  name,
  currency,
  status,
  created_at,
  updated_at
`

export const portfolioService = {
    async getPortfolios(): Promise<Portfolio[]> {
        const { data, error } = await supabase
            .from('portfolios')
            .select(portfolioFields)
            .order('created_at', { ascending: false })

        if (error) {
            throw error
        }

        return data ?? []
    },

    async getPortfolioById(
        portfolioId: string,
    ): Promise<Portfolio> {
        const { data, error } = await supabase
            .from('portfolios')
            .select(portfolioFields)
            .eq('id', portfolioId)
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async createPortfolio(
        userId: string,
        portfolio: PortfolioFormData,
    ): Promise<Portfolio> {
        const { data, error } = await supabase
            .from('portfolios')
            .insert({
                user_id: userId,
                broker_id: portfolio.broker_id,
                name: portfolio.name,
                currency: portfolio.currency,
                status: 'draft',
            })
            .select(portfolioFields)
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async activatePortfolio(
        portfolioId: string,
    ): Promise<Portfolio> {
        const { data, error } = await supabase.rpc(
            'activate_portfolio',
            {
                p_portfolio_id: portfolioId,
            },
        )

        if (error) {
            throw error
        }

        return data
    },
}