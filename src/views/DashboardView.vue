<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { portfolioService } from '../services/portfolio.service'
import { brokerService } from '../services/broker.service'
import { assetService } from '../services/asset.service'
import { priceService } from '../services/price.service'
import { alertService } from '../services/alert.service'
import { auditService, type PortfolioAuditResult } from '../services/audit.service'
import { transactionService } from '../services/transaction.service'
import PortfolioAuditModal from '../components/PortfolioAuditModal.vue'
import PortfolioGrowthChart from '../components/PortfolioGrowthChart.vue'
import RecordTransactionModal from '../components/RecordTransactionModal.vue'
import type {
  PortfolioPerformancePoint,
  PortfolioTransaction,
} from '../types/transaction'

import type { Portfolio } from '../types/portfolio'
import type { Broker } from '../types/broker'
import type {
  Asset,
  PortfolioAsset,
  LatestAssetPrice,
} from '../types/asset'

const portfolios = ref<Portfolio[]>([])
const brokers = ref<Broker[]>([])
const assets = ref<Asset[]>([])
const portfolioAssets = ref<PortfolioAsset[]>([])
const latestPrices = ref<LatestAssetPrice[]>([])
const transactions = ref<PortfolioTransaction[]>([])
const performanceHistory = ref<PortfolioPerformancePoint[]>([])
const pendingAlertsCount = ref(0)
const showTxModal = ref(false)

// Auditoría IA
const showAuditModal = ref(false)
const auditing = ref(false)
const auditError = ref('')
const auditResult = ref<PortfolioAuditResult | null>(null)

async function handleRunAudit() {
  if (!selectedPortfolio.value || selectedPortfolio.value.status !== 'active' || auditing.value) {
    return
  }

  showAuditModal.value = true
  auditing.value = true
  auditError.value = ''

  try {
    auditResult.value = await auditService.runPortfolioAudit(selectedPortfolio.value.id)
  } catch (error) {
    console.error('Error al auditar portafolio:', error)
    auditError.value =
      error instanceof Error
        ? error.message
        : 'No se pudo completar la auditoría IA.'
  } finally {
    auditing.value = false
  }
}

const selectedPortfolioId = ref('')

const loading = ref(true)
const loadingPortfolio = ref(false)
const errorMessage = ref('')

/*
|--------------------------------------------------------------------------
| PORTAFOLIO SELECCIONADO
|--------------------------------------------------------------------------
*/

const selectedPortfolio = computed(() =>
    portfolios.value.find(
        (portfolio) =>
            portfolio.id === selectedPortfolioId.value,
    ) ?? null,
)

const selectedBroker = computed(() => {
  if (!selectedPortfolio.value) {
    return null
  }

  return (
      brokers.value.find(
          (broker) =>
              broker.id ===
              selectedPortfolio.value?.broker_id,
      ) ?? null
  )
})

/*
|--------------------------------------------------------------------------
| ACTIVOS Y PRECIOS
|--------------------------------------------------------------------------
*/

function getAsset(assetId: string) {
  return assets.value.find(
      (asset) => asset.id === assetId,
  )
}

function getPriceData(assetId: string) {
  return latestPrices.value.find(
      (price) => price.asset_id === assetId,
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
  const value = getCurrentValue(item)

  if (
      !hasCompletePriceCoverage.value ||
      value === null ||
      totalCurrentValue.value === null ||
      totalCurrentValue.value <= 0
  ) {
    return null
  }

  return (
      value /
      totalCurrentValue.value
  ) * 100
}

function getDeviation(item: PortfolioAsset) {
  const currentWeight =
      getCurrentWeight(item)

  if (currentWeight === null) {
    return null
  }

  return (
      currentWeight -
      Number(item.target_weight)
  )
}

/*
|--------------------------------------------------------------------------
| INFORMACIÓN PARA LISTA DE PORTAFOLIOS
|--------------------------------------------------------------------------
*/

function getBrokerName(brokerId: string) {
  return (
      brokers.value.find(
          (broker) => broker.id === brokerId,
      )?.name ?? 'No disponible'
  )
}

/*
|--------------------------------------------------------------------------
| CARGA INICIAL
|--------------------------------------------------------------------------
*/

async function loadDashboard() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      portfolioData,
      brokerData,
      assetData,
      latestPriceData,
      alertsCount,
    ] = await Promise.all([
      portfolioService.getPortfolios(),
      brokerService.getBrokers(),
      assetService.getAssets(),
      priceService.getLatestAssetPrices(),
      alertService.getPendingAlertsCount().catch(() => 0),
    ])

    portfolios.value = portfolioData
    brokers.value = brokerData
    assets.value = assetData
    latestPrices.value = latestPriceData
    pendingAlertsCount.value = alertsCount

    /*
     * Preferimos mostrar inicialmente
     * un portafolio activo.
     */
    const firstActive =
        portfolioData.find(
            (portfolio) =>
                portfolio.status === 'active',
        )

    selectedPortfolioId.value =
        firstActive?.id ??
        portfolioData[0]?.id ??
        ''
  } catch (error) {
    console.error(
        'Error al cargar dashboard:',
        error,
    )

    errorMessage.value =
        'No pudimos cargar la información del dashboard.'
  } finally {
    loading.value = false
  }
}

/*
|--------------------------------------------------------------------------
| CARGAR ACTIVOS DEL PORTAFOLIO SELECCIONADO
|--------------------------------------------------------------------------
*/

async function loadSelectedPortfolioAssets(
    portfolioId: string,
) {
  if (!portfolioId) {
    portfolioAssets.value = []
    transactions.value = []
    performanceHistory.value = []
    return
  }

  loadingPortfolio.value = true

  try {
    const [assetsList, txList, perfPoints] = await Promise.all([
      assetService.getPortfolioAssets(portfolioId),
      transactionService.getPortfolioTransactions(portfolioId).catch(() => []),
      transactionService.getPerformanceHistory(portfolioId, 365).catch(() => []),
    ])
    portfolioAssets.value = assetsList
    transactions.value = txList
    performanceHistory.value = perfPoints
  } catch (error) {
    console.error(
        'Error al cargar activos del portafolio:',
        error,
    )

    portfolioAssets.value = []
    transactions.value = []
    performanceHistory.value = []
  } finally {
    loadingPortfolio.value = false
  }
}

const totalInvestedCostBasis = computed(() =>
  portfolioAssets.value.reduce((sum, item) => {
    const qty = Number(item.quantity ?? 0)
    const avg = Number(item.average_cost ?? 0)
    return sum + qty * avg
  }, 0),
)

const unrealizedPnl = computed(() => {
  if (totalCurrentValue.value === null) return null
  return totalCurrentValue.value - totalInvestedCostBasis.value
})

const portfolioRoiPct = computed(() => {
  if (unrealizedPnl.value === null || totalInvestedCostBasis.value <= 0) return null
  return (unrealizedPnl.value / totalInvestedCostBasis.value) * 100
})

const realizedPnlTotal = computed(() =>
  transactions.value.reduce((sum, tx) => sum + Number(tx.realized_pnl ?? 0), 0),
)

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

watch(
    selectedPortfolioId,
    (portfolioId) => {
      showAuditModal.value = false
      auditResult.value = null
      auditError.value = ''
      loadSelectedPortfolioAssets(portfolioId)
    },
)

onMounted(() => {
  loadDashboard()
})
</script>

<template>
  <section>
    <!-- Encabezado -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">
          Dashboard
        </h1>

        <p class="mt-1 text-sm text-slate-500">
          Monitorea la distribución de tus portafolios de inversión.
        </p>
      </div>

      <!-- Tarjeta de Alertas Pendientes -->
      <RouterLink
        to="/alerts"
        class="flex items-center gap-3 rounded-xl border px-4 py-3 transition"
        :class="
          pendingAlertsCount > 0
            ? 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
            : 'border-slate-200 bg-white hover:bg-slate-50'
        "
      >
        <div
          class="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold"
          :class="
            pendingAlertsCount > 0
              ? 'bg-amber-600 text-white'
              : 'bg-slate-100 text-slate-600'
          "
        >
          {{ pendingAlertsCount }}
        </div>
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Alertas pendientes
          </p>
          <p class="text-sm font-semibold text-slate-900">
            {{
              pendingAlertsCount === 0
                ? 'Todo al día'
                : pendingAlertsCount === 1
                  ? '1 alerta por revisar →'
                  : `${pendingAlertsCount} alertas por revisar →`
            }}
          </p>
        </div>
      </RouterLink>
    </div>

    <!-- Loading -->
    <div
        v-if="loading"
        class="mt-8 rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Cargando información...
      </p>
    </div>

    <!-- Error -->
    <div
        v-else-if="errorMessage"
        class="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ errorMessage }}
    </div>

    <!-- Sin portafolios -->
    <div
        v-else-if="portfolios.length === 0"
        class="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
    >
      <h2 class="font-semibold text-slate-900">
        Aún no tienes portafolios
      </h2>

      <p class="mt-2 text-sm text-slate-500">
        Crea tu primer portafolio para comenzar a monitorear tus inversiones.
      </p>

      <RouterLink
          to="/portfolios"
          class="mt-5 inline-block rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
      >
        Crear portafolio
      </RouterLink>
    </div>

    <template v-else>
      <!-- Selector -->
      <div
          class="mt-8 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div class="w-full sm:max-w-sm">
          <label
              class="mb-2 block text-sm font-medium text-slate-700"
          >
            Portafolio seleccionado
          </label>

          <select
              v-model="selectedPortfolioId"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            <option
                v-for="portfolio in portfolios"
                :key="portfolio.id"
                :value="portfolio.id"
            >
              {{ portfolio.name }}
            </option>
          </select>
        </div>

        <div
            v-if="selectedPortfolio"
            class="flex flex-wrap items-center justify-between gap-3 sm:ml-6 sm:justify-end sm:gap-4"
        >
          <button
              v-if="selectedPortfolio.status === 'active'"
              type="button"
              :disabled="auditing"
              class="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              @click="handleRunAudit"
          >
            <svg
                v-if="auditing"
                class="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{{ auditing ? 'Auditando...' : '✨ Auditar portafolio con IA' }}</span>
          </button>

          <div class="text-right">
            <span
                class="inline-flex rounded-full px-3 py-1.5 text-xs font-medium"
                :class="
                selectedPortfolio.status === 'active'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              "
            >
              {{
                selectedPortfolio.status === 'active'
                    ? 'Activo'
                    : 'Borrador'
              }}
            </span>

            <p class="mt-2 text-xs text-slate-400">
              {{ selectedBroker?.name ?? 'Broker no disponible' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Loading portafolio -->
      <div
          v-if="loadingPortfolio"
          class="mt-6 rounded-xl border border-slate-200 bg-white p-6"
      >
        <p class="text-sm text-slate-500">
          Cargando portafolio...
        </p>
      </div>

      <template
          v-else-if="selectedPortfolio"
      >
        <!-- Portafolio draft -->
        <div
            v-if="selectedPortfolio.status !== 'active'"
            class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6"
        >
          <h2 class="font-semibold text-amber-800">
            Portafolio en configuración
          </h2>

          <p class="mt-2 text-sm leading-6 text-amber-700">
            Este portafolio todavía no está activo. Completa su distribución objetivo para comenzar a monitorearlo.
          </p>

          <RouterLink
              :to="`/portfolios/${selectedPortfolio.id}/config`"
              class="mt-4 inline-block text-sm font-semibold text-amber-800 underline"
          >
            Continuar configuración
          </RouterLink>
        </div>

        <!-- Portafolio activo -->
        <template v-else>
          <!-- KPIs de Valor, Capital Invertido y ROI -->
          <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Valor actual
              </p>
              <p class="mt-2 font-mono text-2xl font-semibold text-slate-900">
                {{
                  totalCurrentValue !== null
                    ? `${selectedPortfolio.currency} ${totalCurrentValue.toFixed(2)}`
                    : 'Pendiente'
                }}
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Capital invertido
              </p>
              <p class="mt-2 font-mono text-2xl font-semibold text-slate-900">
                {{ selectedPortfolio.currency }} {{ totalInvestedCostBasis.toFixed(2) }}
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Retorno no realizado (ROI)
              </p>
              <div class="mt-2 flex items-baseline gap-2">
                <p
                  class="font-mono text-2xl font-semibold"
                  :class="
                    unrealizedPnl === null
                      ? 'text-slate-400'
                      : unrealizedPnl >= 0
                        ? 'text-emerald-600'
                        : 'text-red-600'
                  "
                >
                  {{
                    unrealizedPnl !== null
                      ? `${unrealizedPnl >= 0 ? '+' : ''}${selectedPortfolio.currency} ${unrealizedPnl.toFixed(2)}`
                      : '—'
                  }}
                </p>
                <span
                  v-if="portfolioRoiPct !== null"
                  class="rounded px-1.5 py-0.5 font-mono text-xs font-semibold"
                  :class="
                    portfolioRoiPct >= 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  "
                >
                  {{ portfolioRoiPct >= 0 ? '+' : '' }}{{ portfolioRoiPct.toFixed(2) }}%
                </span>
              </div>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Ganancia realizada (Ventas)
              </p>
              <p
                class="mt-2 font-mono text-2xl font-semibold"
                :class="
                  realizedPnlTotal >= 0 ? 'text-slate-900' : 'text-red-600'
                "
              >
                {{ realizedPnlTotal >= 0 ? '+' : '' }}{{ selectedPortfolio.currency }} {{ realizedPnlTotal.toFixed(2) }}
              </p>
            </div>
          </div>

          <!-- Gráfica de Crecimiento Histórico -->
          <div class="mt-6 rounded-xl border border-slate-200 bg-white p-6">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="font-semibold text-slate-900">
                  Crecimiento de la Cartera en el Tiempo
                </h2>
                <p class="mt-0.5 text-xs text-slate-500">
                  Evolución del valor de mercado frente al capital neto invertido.
                </p>
              </div>

              <button
                type="button"
                class="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-teal-700"
                @click="showTxModal = true"
              >
                + Registrar Compra / Venta
              </button>
            </div>

            <PortfolioGrowthChart
              :points="performanceHistory"
              :currency="selectedPortfolio.currency"
            />
          </div>

          <!-- Oportunidad -->
          <div
              class="mt-6 rounded-xl border border-slate-200 bg-white p-6"
          >
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
            >
              <div>
                <p
                    class="text-xs font-medium uppercase tracking-wide text-slate-400"
                >
                  Oportunidad de rebalanceo
                </p>

                <h2
                    class="mt-2 text-lg font-semibold text-slate-900"
                >
                  Resultado automático pendiente
                </h2>

                <p
                    class="mt-2 max-w-2xl text-sm leading-6 text-slate-500"
                >
                  El módulo automático evalúa las desviaciones,
                  costos de transacción y conveniencia del rebalanceo.
                </p>
              </div>

              <RouterLink
                  :to="`/portfolios/${selectedPortfolio.id}/analysis`"
                  class="shrink-0 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
              >
                Ver análisis
              </RouterLink>
            </div>
          </div>

          <!-- Distribución y comparación -->
          <div
              class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2"
          >
            <!-- Distribución -->
            <div
                class="rounded-xl border border-slate-200 bg-white p-6"
            >
              <div>
                <h2 class="font-semibold text-slate-900">
                  Distribución del portafolio
                </h2>

                <p class="mt-1 text-sm text-slate-500">
                  Peso actual de cada activo.
                </p>
              </div>

              <!-- Sin precios -->
              <div
                  v-if="!hasCompletePriceCoverage"
                  class="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700"
              >
                No se puede calcular la distribución porque faltan precios.
              </div>

              <!-- Barras -->
              <div
                  v-else
                  class="mt-6 space-y-5"
              >
                <div
                    v-for="item in portfolioAssets"
                    :key="item.id"
                >
                  <div
                      class="mb-2 flex items-center justify-between"
                  >
                    <div>
                      <span
                          class="text-sm font-semibold text-slate-800"
                      >
                        {{ getAsset(item.asset_id)?.ticker }}
                      </span>

                      <span
                          class="ml-2 text-xs text-slate-400"
                      >
                        {{ getAsset(item.asset_id)?.name }}
                      </span>
                    </div>

                    <span
                        class="text-sm font-semibold text-slate-700"
                    >
                      {{ getCurrentWeight(item)?.toFixed(2) }}%
                    </span>
                  </div>

                  <div
                      class="h-2.5 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                        class="h-full rounded-full bg-teal-500 transition-all"
                        :style="{
                        width: `${Math.min(
                          getCurrentWeight(item) ?? 0,
                          100,
                        )}%`,
                      }"
                    />
                  </div>
                </div>

                <div
                    v-if="totalCurrentValue !== null"
                    class="border-t border-slate-100 pt-4"
                >
                  <div
                      class="flex items-center justify-between"
                  >
                    <span class="text-sm text-slate-500">
                      Valor actual
                    </span>

                    <span
                        class="font-semibold text-slate-900"
                    >
                      {{ selectedPortfolio.currency }}
                      {{ totalCurrentValue.toFixed(2) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Comparación -->
            <div
                class="overflow-hidden rounded-xl border border-slate-200 bg-white"
            >
              <div
                  class="border-b border-slate-200 px-6 py-5"
              >
                <h2 class="font-semibold text-slate-900">
                  Comparación de pesos
                </h2>

                <p class="mt-1 text-sm text-slate-500">
                  Distribución actual frente al objetivo.
                </p>
              </div>

              <div
                  v-if="!hasCompletePriceCoverage"
                  class="p-6"
              >
                <div
                    class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700"
                >
                  Faltan precios para realizar la comparación.
                </div>
              </div>

              <div
                  v-else
                  class="overflow-x-auto"
              >
                <table class="w-full text-left text-sm">
                  <thead class="bg-slate-50">
                  <tr>
                    <th
                        class="px-5 py-3 font-medium text-slate-600"
                    >
                      Activo
                    </th>

                    <th
                        class="px-5 py-3 font-medium text-slate-600"
                    >
                      Actual
                    </th>

                    <th
                        class="px-5 py-3 font-medium text-slate-600"
                    >
                      Objetivo
                    </th>

                    <th
                        class="px-5 py-3 font-medium text-slate-600"
                    >
                      Diferencia
                    </th>
                  </tr>
                  </thead>

                  <tbody
                      class="divide-y divide-slate-100"
                  >
                  <tr
                      v-for="item in portfolioAssets"
                      :key="item.id"
                  >
                    <td
                        class="px-5 py-4 font-semibold text-slate-900"
                    >
                      {{ getAsset(item.asset_id)?.ticker }}
                    </td>

                    <td
                        class="px-5 py-4 text-slate-600"
                    >
                      {{ getCurrentWeight(item)?.toFixed(2) }}%
                    </td>

                    <td
                        class="px-5 py-4 text-slate-600"
                    >
                      {{ Number(item.target_weight).toFixed(2) }}%
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
                      }}
                      {{ getDeviation(item)?.toFixed(2) }}%
                    </td>
                  </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </template>

        <!-- Mis portafolios -->
        <div
            class="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div
              class="flex items-center justify-between border-b border-slate-200 px-6 py-5"
          >
            <div>
              <h2 class="font-semibold text-slate-900">
                Mis portafolios
              </h2>

              <p class="mt-1 text-sm text-slate-500">
                Revisa tus portafolios registrados.
              </p>
            </div>

            <RouterLink
                to="/portfolios"
                class="text-sm font-semibold text-teal-600 transition hover:text-teal-700"
            >
              Ver todos
            </RouterLink>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50">
              <tr>
                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Portafolio
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Broker
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Moneda
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Estado
                </th>

                <th
                    class="px-5 py-3 text-right font-medium text-slate-600"
                >
                  Acción
                </th>
              </tr>
              </thead>

              <tbody
                  class="divide-y divide-slate-100"
              >
              <tr
                  v-for="item in portfolios"
                  :key="item.id"
                  class="transition hover:bg-slate-50"
              >
                <td
                    class="px-5 py-4 font-medium text-slate-900"
                >
                  {{ item.name }}
                </td>

                <td
                    class="px-5 py-4 text-slate-600"
                >
                  {{ getBrokerName(item.broker_id) }}
                </td>

                <td
                    class="px-5 py-4 text-slate-600"
                >
                  {{ item.currency }}
                </td>

                <td class="px-5 py-4">
                    <span
                        class="rounded-full px-2.5 py-1 text-xs font-medium"
                        :class="
                        item.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      "
                    >
                      {{
                        item.status === 'active'
                            ? 'Activo'
                            : 'Borrador'
                      }}
                    </span>
                </td>

                <td
                    class="px-5 py-4 text-right"
                >
                  <RouterLink
                      :to="`/portfolios/${item.id}/config`"
                      class="font-medium text-teal-600 transition hover:text-teal-700"
                  >
                    {{
                      item.status === 'active'
                          ? 'Ver detalle'
                          : 'Continuar'
                    }}
                  </RouterLink>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <!-- Historial de Operaciones / Lotes de la cartera seleccionada -->
    <div
      v-if="selectedPortfolio && selectedPortfolio.status === 'active'"
      class="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 class="font-semibold text-slate-900">
            Registro de Operaciones y Lotes ({{ transactions.length }})
          </h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Control activo de compras, ventas, días en cartera y P&L realizado.
          </p>
        </div>

        <button
          type="button"
          class="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          @click="showTxModal = true"
        >
          + Nueva operación
        </button>
      </div>

      <div
        v-if="transactions.length === 0"
        class="px-6 py-8 text-center text-xs text-slate-500"
      >
        Aún no hay operaciones registradas en este portafolio.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-600">
            <tr class="border-b border-slate-200">
              <th class="px-4 py-3 font-semibold">Fecha</th>
              <th class="px-4 py-3 font-semibold">Activo</th>
              <th class="px-4 py-3 font-semibold">Tipo</th>
              <th class="px-4 py-3 font-semibold">Días</th>
              <th class="px-4 py-3 font-semibold">Q Nominales</th>
              <th class="px-4 py-3 font-semibold">Precio compra/venta</th>
              <th class="px-4 py-3 font-semibold">Monto</th>
              <th class="px-4 py-3 font-semibold text-right">P&L Realizado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="tx in transactions"
              :key="tx.id"
              class="hover:bg-slate-50/70"
            >
              <td class="px-4 py-3 font-mono text-slate-600">
                {{ tx.transaction_date }}
              </td>
              <td class="px-4 py-3 font-semibold text-slate-900">
                {{ getAsset(tx.asset_id)?.ticker ?? '—' }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  :class="
                    tx.transaction_type === 'BUY'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  "
                >
                  {{ tx.transaction_type === 'BUY' ? 'COMPRA' : 'VENTA' }}
                </span>
              </td>
              <td class="px-4 py-3 font-mono text-slate-500">
                {{ daysSince(tx.transaction_date) }}d
              </td>
              <td class="px-4 py-3 font-mono text-slate-700">
                {{ Number(tx.quantity).toFixed(4) }}
              </td>
              <td class="px-4 py-3 font-mono text-slate-700">
                {{ selectedPortfolio.currency }} {{ Number(tx.unit_price).toFixed(2) }}
              </td>
              <td class="px-4 py-3 font-mono font-medium text-slate-900">
                {{ selectedPortfolio.currency }} {{ Number(tx.total_amount).toFixed(2) }}
              </td>
              <td class="px-4 py-3 text-right font-mono">
                <span
                  v-if="tx.realized_pnl !== null"
                  :class="Number(tx.realized_pnl) >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'"
                >
                  {{ Number(tx.realized_pnl) >= 0 ? '+' : '' }}{{ selectedPortfolio.currency }} {{ Number(tx.realized_pnl).toFixed(2) }}
                </span>
                <span v-else class="text-slate-400">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Auditoría IA -->
    <PortfolioAuditModal
      :show="showAuditModal"
      :portfolio-name="selectedPortfolio?.name ?? 'Portafolio'"
      :currency="selectedPortfolio?.currency ?? 'USD'"
      :loading="auditing"
      :error="auditError"
      :result="auditResult"
      @close="showAuditModal = false"
      @rerun="handleRunAudit"
    />

    <!-- Modal Registrar Compra / Venta -->
    <RecordTransactionModal
      v-if="selectedPortfolio"
      :show="showTxModal"
      :portfolio-id="selectedPortfolio.id"
      :currency="selectedPortfolio.currency"
      :assets="assets"
      @close="showTxModal = false"
      @saved="loadSelectedPortfolioAssets(selectedPortfolio.id)"
    />
  </section>
</template>