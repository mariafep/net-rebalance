export interface BrokerPreset {
  id: string
  name: string
  category: 'national' | 'international'
  categoryLabel: string
  country: string
  currency: 'USD' | 'PEN'
  fixed_commission: number
  percentage_commission: number // Porcentaje visible al usuario (ej. 0.50 para 0.50%)
  spread_percentage: number // Porcentaje visible al usuario (ej. 0.15 para 0.15%)
  description: string
  features: string[]
}

export const BROKER_PRESETS: BrokerPreset[] = [
  // ==========================================
  // BROKERS NACIONALES (Perú - BVL / SABs SMV)
  // ==========================================
  {
    id: 'trii-pe',
    name: 'Trii Perú (Kallpa SAB)',
    category: 'national',
    categoryLabel: 'Nacional (BVL / Retail)',
    country: 'Perú',
    currency: 'PEN',
    fixed_commission: 12.50,
    percentage_commission: 0.50,
    spread_percentage: 0.10,
    description:
      'App móvil más popular en Perú para inversionistas particulares en la Bolsa de Valores de Lima (BVL). Opera mediante Kallpa SAB con tarifa plana baja.',
    features: ['Acceso directo a BVL', 'Comisión fija en Soles', 'Ideal montos accesibles'],
  },
  {
    id: 'kallpa-sab',
    name: 'Kallpa SAB',
    category: 'national',
    categoryLabel: 'Nacional (SAB Líder)',
    country: 'Perú',
    currency: 'USD',
    fixed_commission: 10.00,
    percentage_commission: 0.60,
    spread_percentage: 0.15,
    description:
      'Una de las principales Sociedades Agentes de Bolsa del Perú autorizadas por la SMV. Especialista en renta variable local, mineras y mercado exterior.',
    features: ['Líder en volumen BVL', 'Asesoría bursátil', 'Renta variable local y global'],
  },
  {
    id: 'renta4-pe',
    name: 'Renta 4 SAB Perú',
    category: 'national',
    categoryLabel: 'Nacional (BVL / Global)',
    country: 'Perú',
    currency: 'USD',
    fixed_commission: 10.00,
    percentage_commission: 0.50,
    spread_percentage: 0.10,
    description:
      'Filial de Renta 4 Banco en Perú. Ofrece plataforma digital intuitiva para operar tanto acciones de la BVL como mercados internacionales.',
    features: ['Plataforma web en línea', 'BVL y mercados internacionales', 'Custodia local SMV'],
  },
  {
    id: 'credicorp-sab',
    name: 'Credicorp Capital SAB',
    category: 'national',
    categoryLabel: 'Nacional (Grupo BCP)',
    country: 'Perú',
    currency: 'USD',
    fixed_commission: 25.00,
    percentage_commission: 0.75,
    spread_percentage: 0.15,
    description:
      'La mayor SAB del mercado peruano, parte del Grupo Credicorp / BCP. Amplia solvencia y orientación a banca privada y clientes patrimoniales.',
    features: ['Mayor respaldo patrimonial', 'Red Grupo BCP', 'Amplia cobertura institucional'],
  },
  {
    id: 'inteligo-sab',
    name: 'Inteligo SAB',
    category: 'national',
    categoryLabel: 'Nacional (Grupo Intercorp)',
    country: 'Perú',
    currency: 'USD',
    fixed_commission: 20.00,
    percentage_commission: 0.60,
    spread_percentage: 0.15,
    description:
      'Sociedad Agente de Bolsa del Grupo Intercorp (Interbank). Asesoría integral en renta fija y variable para el mercado peruano.',
    features: ['Respaldo Grupo Interbank', 'Renta fija y variable', 'Asesoría personalizada'],
  },
  {
    id: 'seminario-sab',
    name: 'Seminario y Cía SAB',
    category: 'national',
    categoryLabel: 'Nacional (Tradicional)',
    country: 'Perú',
    currency: 'USD',
    fixed_commission: 20.00,
    percentage_commission: 0.65,
    spread_percentage: 0.15,
    description:
      'Firma bursátil tradicional y de gran trayectoria en el mercado de capitales peruano y la BVL.',
    features: ['Larga trayectoria bursátil', 'Especialistas en mercado local', 'Regulada por la SMV'],
  },

  // ==========================================
  // BROKERS INTERNACIONALES (Wall Street / Global)
  // ==========================================
  {
    id: 'interactive-brokers',
    name: 'Interactive Brokers (IBKR)',
    category: 'international',
    categoryLabel: 'Internacional (Global)',
    country: 'EE.UU. / Global',
    currency: 'USD',
    fixed_commission: 1.00,
    percentage_commission: 0.01,
    spread_percentage: 0.02,
    description:
      'El broker predilecto por inversionistas en Perú para indexación pasiva, ETFs irlandeses (UCITS) y acciones globales en Wall Street y Europa.',
    features: ['Tarifa fija mínima $1', 'Acceso a +150 bolsas', 'ETFs UCITS de acumulación'],
  },
  {
    id: 'hapi',
    name: 'Hapi',
    category: 'international',
    categoryLabel: 'Internacional (Fintech LatAm)',
    country: 'EE.UU. / LatAm',
    currency: 'USD',
    fixed_commission: 0.15,
    percentage_commission: 0.00,
    spread_percentage: 0.15,
    description:
      'Broker regulado en EE.UU. (SEC/FINRA) enfocado en inversionistas peruanos y de LatAm, con depósitos y retiros desde cuentas bancarias peruanas.',
    features: ['Depósitos en Soles y Dólares', 'Sin costo fijo de mantenimiento', 'Acciones fraccionadas'],
  },
  {
    id: 'charles-schwab',
    name: 'Charles Schwab',
    category: 'international',
    categoryLabel: 'Internacional (EE.UU.)',
    country: 'EE.UU.',
    currency: 'USD',
    fixed_commission: 0.00,
    percentage_commission: 0.00,
    spread_percentage: 0.02,
    description:
      'Uno de los brokers más grandes y seguros de EE.UU. Permite apertura a peruanos y cuenta con $0 comisiones en acciones y ETFs de EE.UU.',
    features: ['$0 comisión en acciones/ETFs', 'Alta solidez y reputación', 'Plataforma profesional'],
  },
  {
    id: 'etoro',
    name: 'eToro',
    category: 'international',
    categoryLabel: 'Internacional (Social Trading)',
    country: 'Global',
    currency: 'USD',
    fixed_commission: 0.00,
    percentage_commission: 0.00,
    spread_percentage: 0.15,
    description:
      'Plataforma global de inversión con 0% de comisión fija en acciones al contado y facilidad para operar desde Perú y América Latina.',
    features: ['0% comisión fija en acciones', 'Depósitos con tarjetas/bancos', 'Trading social'],
  },
  {
    id: 'folionet',
    name: 'Folionet',
    category: 'international',
    categoryLabel: 'Internacional (EE.UU. / LatAm)',
    country: 'EE.UU.',
    currency: 'USD',
    fixed_commission: 0.00,
    percentage_commission: 0.00,
    spread_percentage: 0.20,
    description:
      'Broker estadounidense (FINRA/SIPC) diseñado para la comunidad hispanohablante para invertir en Wall Street sin comisión fija.',
    features: ['Sin comisiones fijas', 'Regulado SEC y FINRA', 'Soporte 100% en español'],
  },
]

export const NATIONAL_BROKERS = BROKER_PRESETS.filter(
  (b) => b.category === 'national',
)

export const INTERNATIONAL_BROKERS = BROKER_PRESETS.filter(
  (b) => b.category === 'international',
)

export function getPresetById(id: string): BrokerPreset | undefined {
  return BROKER_PRESETS.find((b) => b.id === id)
}

export function findPresetByName(name: string): BrokerPreset | undefined {
  const normalized = name.trim().toLowerCase()
  return BROKER_PRESETS.find((b) => {
    const presetName = b.name.toLowerCase()
    return (
      presetName === normalized ||
      presetName.includes(normalized) ||
      normalized.includes(presetName)
    )
  })
}

/**
 * Convierte una tasa almacenada en DB (fracción decimal ej. 0.005)
 * o porcentaje directo a un valor porcentual legible para formulario/UI (ej. 0.50).
 */
export function toPercentDisplay(val: number | null | undefined): number {
  const n = Number(val ?? 0)
  if (n <= 0) return 0
  // Si está almacenado como fracción decimal (< 0.20), lo multiplicamos por 100
  const pct = n <= 0.2 ? n * 100 : n
  return Number(pct.toFixed(4))
}

/**
 * Convierte un porcentaje ingresado por el usuario (ej. 0.50 para 0.50%)
 * a la fracción decimal que espera el modelo de cálculo de RebalanceResultView (0.005).
 */
export function toFractionDb(pct: number | null | undefined): number {
  const n = Number(pct ?? 0)
  if (n <= 0) return 0
  return Number((n / 100).toFixed(6))
}
