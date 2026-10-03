<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { portfolioService } from '../services/portfolio.service'
import { brokerService } from '../services/broker.service'
import { assetService } from '../services/asset.service'
import { priceService } from '../services/price.service'

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
    ] = await Promise.all([
      portfolioService.getPortfolios(),
      brokerService.getBrokers(),
      assetService.getAssets(),
      priceService.getLatestAssetPrices(),
    ])

    portfolios.value = portfolioData
    brokers.value = brokerData
    assets.value = assetData
    latestPrices.value = latestPriceData

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
    return
  }

  loadingPortfolio.value = true

  try {
    portfolioAssets.value =
        await assetService.getPortfolioAssets(
            portfolioId,
        )
  } catch (error) {
    console.error(
        'Error al cargar activos del portafolio:',
        error,
    )

    portfolioAssets.value = []
  } finally {
    loadingPortfolio.value = false
  }
}

watch(
    selectedPortfolioId,
    (portfolioId) => {
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
    <div>
      <h1 class="text-2xl font-semibold text-slate-900">
        Dashboard
      </h1>

      <p class="mt-1 text-sm text-slate-500">
        Monitorea la distribución de tus portafolios de inversión.
      </p>
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
          class="mt-8 flex items-end justify-between rounded-xl border border-slate-200 bg-white p-5"
      >
        <div class="w-full max-w-sm">
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
            class="ml-6 text-right"
        >
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
          <!-- Oportunidad -->
          <div
              class="mt-6 rounded-xl border border-slate-200 bg-white p-6"
          >
            <div
                class="flex items-center justify-between gap-8"
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
              class="mt-6 grid grid-cols-2 gap-6"
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
  </section>
</template>