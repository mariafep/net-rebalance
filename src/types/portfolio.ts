export interface Portfolio {
    id: string
    user_id: string
    broker_id: string
    name: string
    currency: string
    status: string
    created_at: string
    updated_at: string
}

export interface PortfolioFormData {
    name: string
    broker_id: string
    currency: string
}