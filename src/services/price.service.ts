import { supabase } from '../lib/supabase'
import type { LatestAssetPrice } from '../types/asset'

export const priceService = {
    async getLatestAssetPrices(): Promise<LatestAssetPrice[]> {
        const { data, error } = await supabase
            .from('latest_asset_prices')
            .select(`
        asset_id,
        price,
        price_date,
        source
      `)

        if (error) {
            throw error
        }

        return data ?? []
    },
}