<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { portfolioService } from '../../services/portfolio.service'
import { brokerService } from '../../services/broker.service'
import { assetService } from '../../services/asset.service'
import { priceService } from '../../services/price.service'

import type { Portfolio } from '../../types/portfolio'
import type { Broker } from '../../types/broker'
import type {
  Asset,
  PortfolioAsset,
  LatestAssetPrice,
} from '../../types/asset'

const route = useRoute()

const portfolio = ref<Portfolio | null>(null)
const broker = ref<Broker | null>(null)

const assets = ref<Asset[]>([])
const portfolioAssets = ref<PortfolioAsset[]>([])
const latestPrices = ref<LatestAssetPrice[]>([])

const loading = ref(true)
const errorMessage = ref('')

const portfolioId = computed(() =>
    String(route.params.id),
)

/*
|--------------------------------------------------------------------------
| REGLAS DEL MVP
|--------------------------------------------------------------------------
*/

const MIN_DEVIATION = 5
const MAX_COST_RATIO = 0.02
const ZERO_TOLERANCE = 0.01

/*
|--------------------------------------------------------------------------
| PRECIOS Y CÁLCULOS
|--------------------------------------------------------------------------
*/

function getAsset(assetId: string) {
  return assets.value.find(
      (asset) => asset.id === assetId,
  )
}

function getPriceData(assetId: string) {
  return latestPrices.value.find(
      (item) => item.asset_id === assetId,
  )
}

function getLatestPrice(assetId: string) {
  const priceData = getPriceData(assetId)

  if (
      priceData?.price === null ||
      priceData?.price === undefined
  ) {
    return null
  }

  return Number(priceData.price)
}

function getCurrentValue(item: PortfolioAsset) {
  const price = getLatestPrice(item.asset_id)

  if (price === null) {
    return null
  }

  return Number(item.quantity) * price
}

const hasCompletePriceCoverage = computed(() => {
  if (portfolioAssets.value.length === 0) {
    return false
  }

  return portfolioAssets.value.every(
      (item) =>
          getLatestPrice(item.asset_id) !== null,
  )
})

const totalCurrentValue = computed(() => {
  if (!hasCompletePriceCoverage.value) {
    return null
  }

  return portfolioAssets.value.reduce(
      (total, item) => {
        const value = getCurrentValue(item)

        return total + (value ?? 0)
      },
      0,
  )
})

function getCurrentWeight(item: PortfolioAsset) {
  const currentValue = getCurrentValue(item)

  if (
      !hasCompletePriceCoverage.value ||
      currentValue === null ||
      totalCurrentValue.value === null ||
      totalCurrentValue.value <= 0
  ) {
    return null
  }

  return (
      currentValue /
      totalCurrentValue.value
  ) * 100
}

function getDeviation(item: PortfolioAsset) {
  const currentWeight = getCurrentWeight(item)

  if (currentWeight === null) {
    return null
  }

  return (
      currentWeight -
      Number(item.target_weight)
  )
}

function getTargetValue(item: PortfolioAsset) {
  if (totalCurrentValue.value === null) {
    return null
  }

  return (
      totalCurrentValue.value *
      (Number(item.target_weight) / 100)
  )
}

function getAdjustment(item: PortfolioAsset) {
  const currentValue = getCurrentValue(item)
  const targetValue = getTargetValue(item)

  if (
      currentValue === null ||
      targetValue === null
  ) {
    return null
  }

  return targetValue - currentValue
}

function getSuggestedAction(item: PortfolioAsset) {
  const adjustment = getAdjustment(item)

  if (adjustment === null) {
    return 'No disponible'
  }

  if (Math.abs(adjustment) < ZERO_TOLERANCE) {
    return 'Mantener'
  }

  return adjustment > 0
      ? 'Comprar'
      : 'Vender'
}

function getActionClass(item: PortfolioAsset) {
  const action = getSuggestedAction(item)

  if (action === 'Comprar') {
    return 'bg-blue-50 text-blue-700'
  }

  if (action === 'Vender') {
    return 'bg-amber-50 text-amber-700'
  }

  return 'bg-emerald-50 text-emerald-700'
}

const totalTargetWeight = computed(() =>
    portfolioAssets.value.reduce(
        (total, item) =>
            total + Number(item.target_weight),
        0,
    ),
)

const canCalculateAnalysis = computed(() => {
  return (
      portfolio.value?.status === 'active' &&
      portfolioAssets.value.length > 0 &&
      hasCompletePriceCoverage.value &&
      totalCurrentValue.value !== null &&
      totalCurrentValue.value > 0 &&
      Math.abs(
          totalTargetWeight.value - 100,
      ) < 0.001
  )
})

/*
|--------------------------------------------------------------------------
| COSTOS DEL REBALANCEO
|--------------------------------------------------------------------------
*/

function getOperationCost(item: PortfolioAsset) {
  if (!broker.value) {
    return null
  }

  const adjustment = getAdjustment(item)

  if (adjustment === null) {
    return null
  }

  const operationAmount = Math.abs(adjustment)

  if (operationAmount < ZERO_TOLERANCE) {
    return 0
  }

  const fixedCommission =
      Number(broker.value.fixed_commission ?? 0)

  const percentageCommission =
      Number(
          broker.value.percentage_commission ?? 0,
      )

  const spreadPercentage =
      Number(
          broker.value.spread_percentage ?? 0,
      )

  return (
      fixedCommission +
      operationAmount * percentageCommission +
      operationAmount * spreadPercentage
  )
}

const totalRebalanceCost = computed(() => {
  if (
      !canCalculateAnalysis.value ||
      !broker.value
  ) {
    return null
  }

  return portfolioAssets.value.reduce(
      (total, item) =>
          total + (getOperationCost(item) ?? 0),
      0,
  )
})

const totalRedistributionAmount = computed(() => {
  if (!canCalculateAnalysis.value) {
    return null
  }

  const totalAbsoluteAdjustment =
      portfolioAssets.value.reduce(
          (total, item) => {
            const adjustment = getAdjustment(item)

            return (
                total +
                Math.abs(adjustment ?? 0)
            )
          },
          0,
      )

  return totalAbsoluteAdjustment / 2
})

const costRatio = computed(() => {
  if (
      totalRebalanceCost.value === null ||
      totalRedistributionAmount.value === null ||
      totalRedistributionAmount.value <= 0
  ) {
    return null
  }

  return (
      totalRebalanceCost.value /
      totalRedistributionAmount.value
  )
})

const maxAbsoluteDeviation = computed(() => {
  if (!canCalculateAnalysis.value) {
    return null
  }

  return Math.max(
      ...portfolioAssets.value.map(
          (item) =>
              Math.abs(getDeviation(item) ?? 0),
      ),
  )
})

const hasSignificantDeviation = computed(() => {
  return (
      maxAbsoluteDeviation.value !== null &&
      maxAbsoluteDeviation.value >=
      MIN_DEVIATION
  )
})

const hasAcceptableCost = computed(() => {
  return (
      costRatio.value !== null &&
      costRatio.value <= MAX_COST_RATIO
  )
})

const shouldNotify = computed(() => {
  return (
      canCalculateAnalysis.value &&
      broker.value !== null &&
      hasSignificantDeviation.value &&
      hasAcceptableCost.value
  )
})

/*
|--------------------------------------------------------------------------
| FECHA DE PRECIOS
|--------------------------------------------------------------------------
*/

const priceDates = computed(() => {
  return portfolioAssets.value
      .map(
          (item) =>
              getPriceData(item.asset_id)
                  ?.price_date,
      )
      .filter(
          (date): date is string =>
              Boolean(date),
      )
})

const latestPriceDate = computed(() => {
  if (priceDates.value.length === 0) {
    return null
  }

  return [...priceDates.value]
      .sort()
      .reverse()[0]
})

function formatPriceDate(date: string | null) {
  if (!date) {
    return 'No disponible'
  }

  const [year, month, day] =
      date.split('-').map(Number)

  return new Intl.DateTimeFormat(
      'es-PE',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      },
  ).format(
      new Date(year, month - 1, day),
  )
}

/*
|--------------------------------------------------------------------------
| FORMATO
|--------------------------------------------------------------------------
*/

function formatMoney(
    value: number | null | undefined,
) {
  return Number(value ?? 0).toFixed(2)
}

function formatRateAsPercent(
    value: number | null | undefined,
) {
  return (
      Number(value ?? 0) * 100
  ).toFixed(2)
}

/*
|--------------------------------------------------------------------------
| CARGA
|--------------------------------------------------------------------------
*/

async function loadAnalysis() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      portfolioData,
      brokerData,
      assetData,
      portfolioAssetData,
      latestPriceData,
    ] = await Promise.all([
      portfolioService.getPortfolioById(
          portfolioId.value,
      ),
      brokerService.getBrokers(),
      assetService.getAssets(),
      assetService.getPortfolioAssets(
          portfolioId.value,
      ),
      priceService.getLatestAssetPrices(),
    ])

    portfolio.value = portfolioData

    broker.value =
        brokerData.find(
            (item) =>
                item.id ===
                portfolioData.broker_id,
        ) ?? null

    assets.value = assetData
    portfolioAssets.value =
        portfolioAssetData
    latestPrices.value =
        latestPriceData
  } catch (error) {
    console.error(
        'Error al cargar análisis:',
        error,
    )

    errorMessage.value =
        'No pudimos cargar el análisis del portafolio.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAnalysis()
})
</script>

<template>
  <section>
    <!-- Breadcrumb -->
    <div class="mb-5 flex items-center gap-2 text-sm">
      <RouterLink
          to="/portfolios"
          class="text-slate-500 transition hover:text-teal-600"
      >
        Portafolios
      </RouterLink>

      <span class="text-slate-300">/</span>

      <RouterLink
          :to="`/portfolios/${portfolioId}/config`"
          class="text-slate-500 transition hover:text-teal-600"
      >
        {{ portfolio?.name ?? 'Portafolio' }}
      </RouterLink>

      <span class="text-slate-300">/</span>

      <span class="font-medium text-slate-700">
        Resultado de rebalanceo
      </span>
    </div>

    <!-- Loading -->
    <div
        v-if="loading"
        class="rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Cargando análisis...
      </p>
    </div>

    <!-- Error -->
    <div
        v-else-if="errorMessage"
        class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ errorMessage }}
    </div>

    <template v-else-if="portfolio">
      <!-- Encabezado -->
      <div class="flex items-start justify-between gap-6">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">
            Resultado de rebalanceo
          </h1>

          <p class="mt-1 text-sm text-slate-500">
            Revisa la distribución actual y la conveniencia estimada de rebalancear el portafolio.
          </p>
        </div>

        <RouterLink
            :to="`/portfolios/${portfolio.id}/config`"
            class="shrink-0 rounded-lg border border-teal-600 px-4 py-2.5 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
        >
          ← Volver al portafolio
        </RouterLink>
      </div>

      <!-- No activo -->
      <div
          v-if="portfolio.status !== 'active'"
          class="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5"
      >
        <h2 class="font-semibold text-amber-800">
          Portafolio no activo
        </h2>

        <p class="mt-1 text-sm text-amber-700">
          Completa la configuración y activa el portafolio antes de consultar su análisis.
        </p>
      </div>

      <template v-else>
        <!-- Información del portafolio -->
        <div
            class="mt-7 rounded-xl border border-slate-200 bg-white p-5"
        >
          <div class="grid grid-cols-[1.3fr_1fr] gap-6">
            <div>
              <div class="flex items-center gap-3">
                <h2 class="text-lg font-semibold text-slate-900">
                  {{ portfolio.name }}
                </h2>

                <span
                    class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                >
                  ● Activo
                </span>
              </div>

              <div
                  class="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500"
              >
                <span>
                  Broker:
                  <strong class="font-medium text-slate-700">
                    {{ broker?.name ?? 'No disponible' }}
                  </strong>
                </span>

                <span class="text-slate-300">|</span>

                <span>
                  Moneda:
                  <strong class="font-medium text-slate-700">
                    {{ portfolio.currency }}
                  </strong>
                </span>
              </div>
            </div>

            <div class="border-l border-slate-200 pl-6">
              <p
                  class="text-xs font-medium uppercase tracking-wide text-slate-400"
              >
                Fecha de precios
              </p>

              <p class="mt-2 font-semibold text-slate-900">
                {{ formatPriceDate(latestPriceDate) }}
              </p>

              <p class="mt-1 text-xs text-slate-400">
                Últimos precios disponibles para los activos.
              </p>
            </div>
          </div>
        </div>

        <!-- No se puede calcular -->
        <div
            v-if="!canCalculateAnalysis"
            class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <h2 class="font-semibold text-amber-800">
            El análisis no está disponible
          </h2>

          <p class="mt-2 text-sm leading-6 text-amber-700">
            Verifica que el portafolio tenga activos,
            precios disponibles, un valor total mayor a cero
            y una distribución objetivo de 100%.
          </p>
        </div>

        <template v-else>
          <!-- Resultado -->
          <div
              class="mt-6 rounded-xl border p-6"
              :class="
              shouldNotify
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-slate-200 bg-white'
            "
          >
            <div class="flex items-center justify-between gap-8">
              <div class="flex items-start gap-4">
                <div
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
                    :class="
                    shouldNotify
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  "
                >
                  {{ shouldNotify ? '✓' : '—' }}
                </div>

                <div>
                  <p
                      class="text-lg font-semibold"
                      :class="
                      shouldNotify
                        ? 'text-emerald-800'
                        : 'text-slate-800'
                    "
                  >
                    {{
                      shouldNotify
                          ? 'Existe oportunidad de rebalanceo'
                          : 'No se recomienda rebalancear'
                    }}
                  </p>

                  <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                    <template v-if="shouldNotify">
                      La desviación supera el umbral definido y el costo estimado se mantiene dentro del límite aceptable.
                    </template>

                    <template v-else>
                      El portafolio no cumple simultáneamente con los criterios de desviación mínima y costo máximo definidos para el MVP.
                    </template>
                  </p>
                </div>
              </div>

              <div class="shrink-0 border-l border-slate-200 pl-8">
                <p class="text-xs font-medium text-slate-500">
                  Costo estimado
                </p>

                <p class="mt-1 text-lg font-semibold text-slate-900">
                  {{ portfolio.currency }}
                  {{ formatMoney(totalRebalanceCost) }}
                </p>

                <p class="mt-1 text-xs text-slate-500">
                  {{
                    costRatio !== null
                        ? `${(costRatio * 100).toFixed(2)}% del monto redistribuido`
                        : 'No disponible'
                  }}
                </p>
              </div>
            </div>
          </div>

          <!-- Contenido -->
          <div
              class="mt-6 grid grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] items-start gap-6"
          >
            <!-- Columna izquierda -->
            <div class="space-y-6">
              <!-- Detalle -->
              <div
                  class="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div class="border-b border-slate-200 px-6 py-5">
                  <h2 class="font-semibold text-slate-900">
                    Detalle por activo
                  </h2>

                  <p class="mt-1 text-sm text-slate-500">
                    Distribución actual, desviación y ajuste monetario estimado.
                  </p>
                </div>

                <div class="overflow-x-auto">
                  <table
                      class="w-full min-w-[900px] text-left text-sm"
                  >
                    <thead class="bg-slate-50">
                    <tr class="border-b border-slate-200">
                      <th class="px-5 py-3 font-medium text-slate-600">
                        Ticker
                      </th>

                      <th class="px-5 py-3 font-medium text-slate-600">
                        Peso objetivo
                      </th>

                      <th class="px-5 py-3 font-medium text-slate-600">
                        Peso actual
                      </th>

                      <th class="px-5 py-3 font-medium text-slate-600">
                        Desviación
                      </th>

                      <th class="px-5 py-3 font-medium text-slate-600">
                        Acción
                      </th>

                      <th class="px-5 py-3 font-medium text-slate-600">
                        Monto estimado
                      </th>
                    </tr>
                    </thead>

                    <tbody class="divide-y divide-slate-100">
                    <tr
                        v-for="item in portfolioAssets"
                        :key="item.id"
                    >
                      <td class="px-5 py-4">
                        <p class="font-semibold text-slate-900">
                          {{ getAsset(item.asset_id)?.ticker }}
                        </p>

                        <p class="mt-0.5 text-xs text-slate-400">
                          {{ getAsset(item.asset_id)?.name }}
                        </p>
                      </td>

                      <td class="px-5 py-4 font-medium text-slate-700">
                        {{ Number(item.target_weight).toFixed(2) }}%
                      </td>

                      <td class="px-5 py-4 text-slate-600">
                        {{ getCurrentWeight(item)?.toFixed(2) }}%
                      </td>

                      <td
                          class="px-5 py-4 font-medium"
                          :class="
                            (getDeviation(item) ?? 0) > 0
                              ? 'text-amber-600'
                              : (getDeviation(item) ?? 0) < 0
                                ? 'text-blue-600'
                                : 'text-emerald-600'
                          "
                      >
                        {{
                          (getDeviation(item) ?? 0) > 0
                              ? '+'
                              : ''
                        }}{{ getDeviation(item)?.toFixed(2) }} pp
                      </td>

                      <td class="px-5 py-4">
                          <span
                              class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                              :class="getActionClass(item)"
                          >
                            {{ getSuggestedAction(item) }}
                          </span>
                      </td>

                      <td class="px-5 py-4 font-medium text-slate-700">
                        {{ portfolio.currency }}
                        {{ formatMoney(Math.abs(getAdjustment(item) ?? 0)) }}
                      </td>
                    </tr>
                    </tbody>
                  </table>
                </div>

                <div
                    class="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-5 py-4"
                >
                  <span class="text-sm text-slate-500">
                    Valor actual del portafolio
                  </span>

                  <span class="font-semibold text-slate-900">
                    {{ portfolio.currency }}
                    {{ formatMoney(totalCurrentValue) }}
                  </span>
                </div>
              </div>

              <!-- Resumen -->
              <div
                  class="rounded-xl border border-slate-200 bg-white p-6"
              >
                <div class="flex items-start gap-4">
                  <div
                      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 font-semibold text-teal-700"
                  >
                    ↻
                  </div>

                  <div>
                    <h2 class="font-semibold text-slate-900">
                      Resumen de la acción sugerida
                    </h2>

                    <p class="mt-2 text-sm font-medium text-slate-700">
                      {{
                        shouldNotify
                            ? 'Se recomienda considerar el rebalanceo.'
                            : 'No se recomienda realizar el rebalanceo en este momento.'
                      }}
                    </p>

                    <p class="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                      La decisión considera una desviación mínima de
                      {{ MIN_DEVIATION }} puntos porcentuales y un costo máximo
                      equivalente al {{ (MAX_COST_RATIO * 100).toFixed(0) }}%
                      del monto estimado a redistribuir.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Columna derecha -->
            <div class="space-y-6">
              <!-- Comisiones -->
              <div
                  class="rounded-xl border border-slate-200 bg-white p-5"
              >
                <h2 class="font-semibold text-slate-900">
                  Comisiones consideradas
                </h2>

                <div
                    v-if="broker"
                    class="mt-5 space-y-4"
                >
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-sm text-slate-500">
                      Comisión fija
                    </span>

                    <span class="text-sm font-semibold text-slate-800">
                      {{ portfolio.currency }}
                      {{ formatMoney(broker.fixed_commission) }}
                    </span>
                  </div>

                  <div class="flex items-center justify-between gap-4">
                    <span class="text-sm text-slate-500">
                      Comisión porcentual
                    </span>

                    <span class="text-sm font-semibold text-slate-800">
                      {{ formatRateAsPercent(broker.percentage_commission) }}%
                    </span>
                  </div>

                  <div class="flex items-center justify-between gap-4">
                    <span class="text-sm text-slate-500">
                      Spread estimado
                    </span>

                    <span class="text-sm font-semibold text-slate-800">
                      {{ formatRateAsPercent(broker.spread_percentage) }}%
                    </span>
                  </div>

                  <div class="border-t border-slate-200 pt-4">
                    <div class="flex items-center justify-between gap-4">
                      <span class="text-sm font-medium text-slate-700">
                        Monto a redistribuir
                      </span>

                      <span class="text-sm font-semibold text-slate-900">
                        {{ portfolio.currency }}
                        {{ formatMoney(totalRedistributionAmount) }}
                      </span>
                    </div>

                    <div class="mt-3 flex items-center justify-between gap-4">
                      <span class="text-sm font-medium text-slate-700">
                        Costo estimado
                      </span>

                      <span class="text-sm font-semibold text-slate-900">
                        {{ portfolio.currency }}
                        {{ formatMoney(totalRebalanceCost) }}
                      </span>
                    </div>

                    <div class="mt-3 flex items-center justify-between gap-4">
                      <span class="text-sm font-medium text-slate-700">
                        Costo relativo
                      </span>

                      <span
                          class="text-sm font-semibold"
                          :class="
                          hasAcceptableCost
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        "
                      >
                        {{
                          costRatio !== null
                              ? `${(costRatio * 100).toFixed(2)}%`
                              : 'No disponible'
                        }}
                      </span>
                    </div>
                  </div>
                </div>

                <p
                    v-else
                    class="mt-4 text-sm text-slate-500"
                >
                  No hay información del broker disponible.
                </p>
              </div>

              <!-- Criterios -->
              <div
                  class="rounded-xl border border-slate-200 bg-white p-5"
              >
                <h2 class="font-semibold text-slate-900">
                  Criterios del MVP
                </h2>

                <div class="mt-4 space-y-4">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-slate-700">
                        Desviación significativa
                      </p>

                      <p class="mt-1 text-xs text-slate-400">
                        Al menos {{ MIN_DEVIATION }} pp
                      </p>
                    </div>

                    <span
                        class="rounded-full px-2.5 py-1 text-xs font-medium"
                        :class="
                        hasSignificantDeviation
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      "
                    >
                      {{ hasSignificantDeviation ? 'Cumple' : 'No cumple' }}
                    </span>
                  </div>

                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-slate-700">
                        Costo aceptable
                      </p>

                      <p class="mt-1 text-xs text-slate-400">
                        Máximo {{ (MAX_COST_RATIO * 100).toFixed(0) }}%
                      </p>
                    </div>

                    <span
                        class="rounded-full px-2.5 py-1 text-xs font-medium"
                        :class="
                        hasAcceptableCost
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      "
                    >
                      {{ hasAcceptableCost ? 'Cumple' : 'No cumple' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Supuestos -->
              <div
                  class="rounded-xl border border-slate-200 bg-white p-5"
              >
                <h2 class="font-semibold text-slate-900">
                  Supuestos del análisis
                </h2>

                <ul class="mt-4 space-y-3 text-sm leading-5 text-slate-500">
                  <li class="flex gap-2">
                    <span class="text-teal-600">•</span>
                    <span>
                      Se utilizan los últimos precios disponibles.
                    </span>
                  </li>

                  <li class="flex gap-2">
                    <span class="text-teal-600">•</span>
                    <span>
                      El valor actual se obtiene mediante cantidad × precio.
                    </span>
                  </li>

                  <li class="flex gap-2">
                    <span class="text-teal-600">•</span>
                    <span>
                      Los pesos objetivo del portafolio suman 100%.
                    </span>
                  </li>

                  <li class="flex gap-2">
                    <span class="text-teal-600">•</span>
                    <span>
                      La comisión porcentual y el spread se interpretan como fracciones.
                    </span>
                  </li>

                  <li class="flex gap-2">
                    <span class="text-teal-600">•</span>
                    <span>
                      NetRebalance genera recomendaciones, pero no ejecuta operaciones de compra o venta.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </template>
      </template>
    </template>
  </section>
</template>