import { supabase } from '../lib/supabase'
import type {
    Asset,
    PortfolioAsset,
    PortfolioAssetFormData,
} from '../types/asset'

const assetFields = `
  id,
  ticker,
  name,
  asset_type,
  exchange,
  currency,
  is_active,
  created_at
`

const portfolioAssetFields = `
  id,
  portfolio_id,
  asset_id,
  target_weight,
  quantity,
  average_cost,
  created_at,
  updated_at
`

export const assetService = {
    async getAssets(): Promise<Asset[]> {
        const { data, error } = await supabase
            .from('assets')
            .select(assetFields)
            .eq('is_active', true)
            .order('ticker', { ascending: true })

        if (error) {
            throw error
        }

        return data ?? []
    },

    async getPortfolioAssets(
        portfolioId: string,
    ): Promise<PortfolioAsset[]> {
        const { data, error } = await supabase
            .from('portfolio_assets')
            .select(portfolioAssetFields)
            .eq('portfolio_id', portfolioId)
            .order('created_at', { ascending: true })

        if (error) {
            throw error
        }

        return data ?? []
    },

    async addPortfolioAsset(
        portfolioId: string,
        asset: PortfolioAssetFormData,
    ): Promise<PortfolioAsset> {
        const { data, error } = await supabase
            .from('portfolio_assets')
            .insert({
                portfolio_id: portfolioId,
                asset_id: asset.asset_id,
                quantity: asset.quantity,
                average_cost: asset.average_cost,
                target_weight: asset.target_weight,
            })
            .select(portfolioAssetFields)
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async updatePortfolioAsset(
        portfolioAssetId: string,
        asset: PortfolioAssetFormData,
    ): Promise<PortfolioAsset> {
        const { data, error } = await supabase
            .from('portfolio_assets')
            .update({
                quantity: asset.quantity,
                average_cost: asset.average_cost,
                target_weight: asset.target_weight,
            })
            .eq('id', portfolioAssetId)
            .select(portfolioAssetFields)
            .single()

        if (error) {
            throw error
        }

        return data
    },

    async deletePortfolioAsset(
        portfolioAssetId: string,
    ): Promise<void> {
        const { error } = await supabase
            .from('portfolio_assets')
            .delete()
            .eq('id', portfolioAssetId)

        if (error) {
            throw error
        }
    },
}