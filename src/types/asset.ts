export interface Asset {
    id: string
    ticker: string
    name: string
    asset_type: string
    exchange: string
    currency: string
    is_active: boolean
    created_at: string
}

export interface PortfolioAsset {
    id: string
    portfolio_id: string
    asset_id: string
    target_weight: number
    quantity: number
    average_cost: number | null
    created_at: string
    updated_at: string
}

export interface PortfolioAssetFormData {
    asset_id: string
    quantity: number
    average_cost: number | null
    target_weight: number
}

export interface LatestAssetPrice {
    asset_id: string | null
    price: number | null
    price_date: string | null
    source: string | null
}