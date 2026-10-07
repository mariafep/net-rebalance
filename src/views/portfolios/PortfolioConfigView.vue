<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { portfolioService } from '../../services/portfolio.service'
import { brokerService } from '../../services/broker.service'
import { assetService } from '../../services/asset.service'
import { priceService } from '../../services/price.service'
import { findPresetByName } from '../../constants/brokerPresets'

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

const showAssetModal = ref(false)
const savingAsset = ref(false)
const assetFormError = ref('')
const editingAsset = ref<PortfolioAsset | null>(null)

const activating = ref(false)
const activationError = ref('')
const activationSuccess = ref('')

// Filtros para el selector de activos en el modal
const filterByCurrency = ref(true)
const selectedMarketFilter = ref<'all' | 'bvl' | 'international'>('all')

const assetForm = ref({
  asset_id: '',
  quantity: 0,
  average_cost: null as number | null,
  target_weight: 0,
})

const deletingAssetId = ref<string | null>(null)

const portfolioId = computed(() => String(route.params.id))

const isNationalBroker = computed(() => {
  if (!broker.value) return false
  const preset = findPresetByName(broker.value.name)
  return preset?.category === 'national' || broker.value.currency === 'PEN'
})

const brokerBadge = computed(() => {
  if (!broker.value) return null
  return {
    label: isNationalBroker.value ? '🇵🇪 BVL / Nacional' : '🌎 Internacional',
    badgeClass: isNationalBroker.value
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-blue-200 bg-blue-50 text-blue-700',
  }
})

function isBvlAsset(asset: Asset | null | undefined): boolean {
  if (!asset) return false
  return asset.exchange?.toUpperCase() === 'BVL'
}

const totalWeight = computed(() =>
  portfolioAssets.value.reduce(
    (total, item) => total + Number(item.target_weight),
    0,
  ),
)

const availableAssets = computed(() => {
  const usedAssetIds = new Set(
    portfolioAssets.value.map((item) => item.asset_id),
  )

  const pCurrency = portfolio.value?.currency

  return assets.value.filter((asset) => {
    // Excluir activos ya presentes en el portafolio
    if (usedAssetIds.has(asset.id)) {
      return false
    }

    // Filtrar por moneda si está activo
    if (filterByCurrency.value && pCurrency && asset.currency !== pCurrency) {
      return false
    }

    // Filtrar por mercado si está seleccionado
    if (selectedMarketFilter.value === 'bvl' && !isBvlAsset(asset)) {
      return false
    }

    if (selectedMarketFilter.value === 'international' && isBvlAsset(asset)) {
      return false
    }

    return true
  })
})

const bvlAssets = computed(() => {
  return availableAssets.value.filter((a) => isBvlAsset(a))
})

const internationalAssets = computed(() => {
  return availableAssets.value.filter((a) => !isBvlAsset(a))
})

const selectedAsset = computed(() => {
  return assets.value.find((a) => a.id === assetForm.value.asset_id)
})

const hasCompletePriceCoverage = computed(() => {
  if (portfolioAssets.value.length === 0) {
    return false
  }

  return portfolioAssets.value.every(
    (item) => getLatestPrice(item.asset_id) !== null,
  )
})

const totalCurrentValue = computed(() => {
  return portfolioAssets.value.reduce((total, item) => {
    const currentValue = getCurrentValue(item)

    if (currentValue === null) {
      return total
    }

    return total + currentValue
  }, 0)
})

function getAsset(assetId: string) {
  return assets.value.find((asset) => asset.id === assetId)
}

function getPriceData(assetId: string) {
  return latestPrices.value.find((item) => item.asset_id === assetId)
}

function getLatestPrice(assetId: string) {
  const priceData = getPriceData(assetId)

  if (priceData?.price === null || priceData?.price === undefined) {
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

function getCurrentWeight(item: PortfolioAsset) {
  if (!hasCompletePriceCoverage.value) {
    return null
  }

  const currentValue = getCurrentValue(item)

  if (currentValue === null || totalCurrentValue.value <= 0) {
    return null
  }

  return (currentValue / totalCurrentValue.value) * 100
}

async function loadPortfolio() {
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
      portfolioService.getPortfolioById(portfolioId.value),
      brokerService.getBrokers(),
      assetService.getAssets(),
      assetService.getPortfolioAssets(portfolioId.value),
      priceService.getLatestAssetPrices(),
    ])

    portfolio.value = portfolioData

    broker.value =
      brokerData.find((item) => item.id === portfolioData.broker_id) ?? null

    assets.value = assetData
    portfolioAssets.value = portfolioAssetData
    latestPrices.value = latestPriceData
  } catch (error) {
    console.error('Error al cargar configuración:', error)
    errorMessage.value = 'No pudimos cargar la configuración del portafolio.'
  } finally {
    loading.value = false
  }
}

function openCreateAssetModal() {
  editingAsset.value = null

  // Priorizar activo según el tipo de broker
  let defaultAsset: Asset | undefined
  if (isNationalBroker.value && bvlAssets.value.length > 0) {
    defaultAsset = bvlAssets.value[0]
  } else if (!isNationalBroker.value && internationalAssets.value.length > 0) {
    defaultAsset = internationalAssets.value[0]
  } else {
    defaultAsset = availableAssets.value[0]
  }

  assetForm.value = {
    asset_id: defaultAsset?.id ?? '',
    quantity: 0,
    average_cost: null,
    target_weight: 0,
  }

  assetFormError.value = ''
  showAssetModal.value = true
}

function useCurrentPriceAsAverageCost() {
  if (!assetForm.value.asset_id) return
  const price = getLatestPrice(assetForm.value.asset_id)
  if (price !== null && price !== undefined) {
    assetForm.value.average_cost = Number(price.toFixed(2))
  }
}

function openEditAssetModal(item: PortfolioAsset) {
  if (portfolio.value?.status !== 'draft') {
    return
  }

  editingAsset.value = item

  assetForm.value = {
    asset_id: item.asset_id,
    quantity: Number(item.quantity),
    average_cost:
      item.average_cost !== null ? Number(item.average_cost) : null,
    target_weight: Number(item.target_weight),
  }

  assetFormError.value = ''
  showAssetModal.value = true
}

function closeAssetModal() {
  if (savingAsset.value) return

  showAssetModal.value = false
  editingAsset.value = null
  assetFormError.value = ''
}

async function handleSaveAsset() {
  assetFormError.value = ''

  if (!assetForm.value.asset_id) {
    assetFormError.value = 'Selecciona un activo.'
    return
  }

  if (assetForm.value.quantity <= 0) {
    assetFormError.value = 'La cantidad debe ser mayor a 0.'
    return
  }

  if (
    assetForm.value.average_cost !== null &&
    assetForm.value.average_cost < 0
  ) {
    assetFormError.value = 'El costo promedio no puede ser negativo.'
    return
  }

  if (
    assetForm.value.target_weight <= 0 ||
    assetForm.value.target_weight > 100
  ) {
    assetFormError.value = 'El peso objetivo debe ser mayor a 0 y máximo 100%.'
    return
  }

  /*
   * Si estamos editando, quitamos temporalmente
   * el peso anterior para calcular correctamente
   * el nuevo total.
   */
  const weightWithoutCurrent = editingAsset.value
    ? totalWeight.value - Number(editingAsset.value.target_weight)
    : totalWeight.value

  const projectedWeight = weightWithoutCurrent + assetForm.value.target_weight

  if (projectedWeight > 100.001) {
    assetFormError.value = `La distribución superaría el 100%. El total quedaría en ${projectedWeight.toFixed(2)}%.`
    return
  }

  savingAsset.value = true

  try {
    if (editingAsset.value) {
      const updatedAsset = await assetService.updatePortfolioAsset(
        editingAsset.value.id,
        {
          asset_id: editingAsset.value.asset_id,
          quantity: assetForm.value.quantity,
          average_cost: assetForm.value.average_cost,
          target_weight: assetForm.value.target_weight,
        },
      )

      const index = portfolioAssets.value.findIndex(
        (item) => item.id === updatedAsset.id,
      )

      if (index !== -1) {
        portfolioAssets.value[index] = updatedAsset
      }
    } else {
      const newPortfolioAsset = await assetService.addPortfolioAsset(
        portfolioId.value,
        {
          asset_id: assetForm.value.asset_id,
          quantity: assetForm.value.quantity,
          average_cost: assetForm.value.average_cost,
          target_weight: assetForm.value.target_weight,
        },
      )

      portfolioAssets.value.push(newPortfolioAsset)
    }

    showAssetModal.value = false
    editingAsset.value = null
  } catch (error) {
    console.error('Error al guardar activo:', error)
    assetFormError.value = 'No pudimos guardar los cambios del activo.'
  } finally {
    savingAsset.value = false
  }
}

async function handleDeleteAsset(item: PortfolioAsset) {
  if (portfolio.value?.status !== 'draft') {
    return
  }

  const asset = getAsset(item.asset_id)

  const confirmed = window.confirm(
    `¿Deseas quitar ${asset?.ticker ?? 'este activo'} del portafolio?`,
  )

  if (!confirmed) {
    return
  }

  deletingAssetId.value = item.id

  try {
    await assetService.deletePortfolioAsset(item.id)

    portfolioAssets.value = portfolioAssets.value.filter(
      (portfolioAsset) => portfolioAsset.id !== item.id,
    )

    activationError.value = ''
    activationSuccess.value = ''
  } catch (error) {
    console.error('Error al eliminar activo:', error)
    window.alert('No pudimos quitar el activo del portafolio.')
  } finally {
    deletingAssetId.value = null
  }
}

async function handleActivatePortfolio() {
  if (!portfolio.value) return

  activationError.value = ''
  activationSuccess.value = ''

  if (portfolioAssets.value.length === 0) {
    activationError.value =
      'Agrega al menos un activo antes de activar el portafolio.'
    return
  }

  if (Math.abs(totalWeight.value - 100) > 0.001) {
    activationError.value =
      'La distribución objetivo debe sumar exactamente 100%.'
    return
  }

  activating.value = true

  try {
    const activatedPortfolio = await portfolioService.activatePortfolio(
      portfolio.value.id,
    )

    portfolio.value = activatedPortfolio

    activationSuccess.value = 'Portafolio activado correctamente.'
  } catch (error) {
    console.error('Error al activar portafolio:', error)
    activationError.value =
      'No pudimos activar el portafolio. Verifica que la distribución sea válida.'
  } finally {
    activating.value = false
  }
}

onMounted(() => {
  loadPortfolio()
})
</script>

<template>
  <section>
    <!-- Breadcrumb -->
    <div class="mb-6 flex items-center gap-2 text-sm">
      <RouterLink
        to="/portfolios"
        class="text-slate-500 transition hover:text-teal-600"
      >
        Portafolios
      </RouterLink>

      <span class="text-slate-300">/</span>

      <span class="text-slate-700"> Configuración </span>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Cargando portafolio...
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
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">
            {{ portfolio.name }}
          </h1>

          <p class="mt-1 text-sm text-slate-500">
            {{
              portfolio.status === 'draft'
                ? 'Configura los activos y la distribución objetivo de tu portafolio.'
                : 'Revisa la posición actual y distribución de tu portafolio.'
            }}
          </p>
        </div>

        <span
          class="rounded-full px-3 py-1.5 text-xs font-medium"
          :class="
            portfolio.status === 'draft'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-emerald-50 text-emerald-700'
          "
        >
          {{ portfolio.status === 'active' ? 'Activo' : 'Borrador' }}
        </span>
      </div>

      <!-- Información general -->
      <div class="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 class="font-semibold text-slate-900">
          Información general
        </h2>

        <div class="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Broker vinculado
            </p>

            <div class="mt-1 flex items-center gap-2">
              <span class="text-sm font-semibold text-slate-800">
                {{ broker?.name ?? 'No disponible' }}
              </span>

              <span
                v-if="brokerBadge"
                class="inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
                :class="brokerBadge.badgeClass"
              >
                {{ brokerBadge.label }}
              </span>
            </div>
          </div>

          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Moneda del portafolio
            </p>

            <p class="mt-1 font-mono text-sm font-semibold text-slate-800">
              {{ portfolio.currency }}
            </p>
          </div>

          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Estado
            </p>

            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ portfolio.status === 'active' ? 'Activo (Monitoreado)' : 'Borrador (En configuración)' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Activos -->
      <div class="mt-6 rounded-xl border border-slate-200 bg-white">
        <div
          class="flex items-center justify-between border-b border-slate-200 px-6 py-5"
        >
          <div>
            <h2 class="font-semibold text-slate-900">
              Activos del portafolio
            </h2>

            <p class="mt-1 text-sm text-slate-500">
              Posición actual y distribución objetivo de tu portafolio.
            </p>
          </div>

          <button
            v-if="portfolio.status === 'draft'"
            type="button"
            :disabled="availableAssets.length === 0"
            class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            @click="openCreateAssetModal"
          >
            + Agregar activo
          </button>
        </div>

        <!-- Sin activos -->
        <div
          v-if="portfolioAssets.length === 0"
          class="px-6 py-12 text-center"
        >
          <div class="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            📊
          </div>
          <h3 class="mt-3 text-sm font-semibold text-slate-800">
            Aún no has agregado activos
          </h3>

          <p class="mt-1 text-sm text-slate-500">
            Agrega los activos que forman parte de este portafolio según la moneda y el broker seleccionado.
          </p>

          <button
            v-if="portfolio.status === 'draft'"
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            @click="openCreateAssetModal"
          >
            + Agregar tu primer activo
          </button>
        </div>

        <!-- Tabla -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
              <tr class="border-b border-slate-200">
                <th class="px-5 py-3.5">
                  Activo
                </th>

                <th class="px-5 py-3.5">
                  Cantidad
                </th>

                <th class="px-5 py-3.5">
                  Precio actual
                </th>

                <th class="px-5 py-3.5">
                  Valor actual
                </th>

                <th class="px-5 py-3.5">
                  Peso actual
                </th>

                <th class="px-5 py-3.5">
                  Peso objetivo
                </th>

                <th
                  v-if="portfolio.status === 'draft'"
                  class="px-5 py-3.5 text-right"
                >
                  Acción
                </th>
              </tr>
            </thead>

            <tbody class="divide-y divide-slate-100">
              <tr v-for="item in portfolioAssets" :key="item.id" class="transition hover:bg-slate-50/60">
                <!-- Activo -->
                <td class="px-5 py-4">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-slate-900">
                      {{ getAsset(item.asset_id)?.ticker }}
                    </span>

                    <span
                      v-if="getAsset(item.asset_id)"
                      class="inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="
                        isBvlAsset(getAsset(item.asset_id))
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700'
                      "
                    >
                      {{ getAsset(item.asset_id)?.exchange }}
                    </span>

                    <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {{ getAsset(item.asset_id)?.asset_type?.toUpperCase() === 'ETF' ? 'ETF' : 'Acción' }}
                    </span>
                  </div>

                  <p class="mt-0.5 text-xs text-slate-500">
                    {{ getAsset(item.asset_id)?.name }}
                  </p>
                </td>

                <!-- Cantidad -->
                <td class="px-5 py-4 font-mono text-slate-700">
                  {{ Number(item.quantity) }}
                </td>

                <!-- Precio -->
                <td class="px-5 py-4 font-mono text-slate-700">
                  <template v-if="getLatestPrice(item.asset_id) !== null">
                    {{ portfolio.currency }}
                    {{ getLatestPrice(item.asset_id)?.toFixed(2) }}
                  </template>

                  <span v-else class="text-xs font-normal text-amber-600">
                    Sin precio
                  </span>
                </td>

                <!-- Valor -->
                <td class="px-5 py-4 font-mono text-slate-700">
                  <template v-if="getCurrentValue(item) !== null">
                    {{ portfolio.currency }}
                    {{ getCurrentValue(item)?.toFixed(2) }}
                  </template>

                  <span v-else class="text-slate-400"> — </span>
                </td>

                <!-- Peso actual -->
                <td class="px-5 py-4 font-mono text-slate-700">
                  <template v-if="getCurrentWeight(item) !== null">
                    {{ getCurrentWeight(item)?.toFixed(2) }}%
                  </template>

                  <span v-else class="text-slate-400"> — </span>
                </td>

                <!-- Peso objetivo -->
                <td class="px-5 py-4 font-mono font-medium text-slate-900">
                  {{ Number(item.target_weight).toFixed(2) }}%
                </td>

                <!-- Editar / Quitar -->
                <td
                  v-if="portfolio.status === 'draft'"
                  class="px-5 py-4 text-right"
                >
                  <div class="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      class="font-medium text-teal-600 transition hover:text-teal-700"
                      @click="openEditAssetModal(item)"
                    >
                      Editar
                    </button>

                    <span class="text-slate-300">|</span>

                    <button
                      type="button"
                      :disabled="deletingAssetId === item.id"
                      class="font-medium text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      @click="handleDeleteAsset(item)"
                    >
                      {{
                        deletingAssetId === item.id
                          ? 'Quitando...'
                          : 'Quitar'
                      }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Resumen -->
      <div
        class="mt-6 grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-white p-6 sm:grid-cols-2"
      >
        <div>
          <p class="text-sm font-medium text-slate-700">
            Valor actual del portafolio
          </p>

          <template v-if="hasCompletePriceCoverage">
            <p class="mt-2 text-2xl font-semibold text-slate-900">
              {{ portfolio.currency }}
              {{ totalCurrentValue.toFixed(2) }}
            </p>

            <p class="mt-1 text-xs text-slate-400">
              Calculado con los últimos precios disponibles de mercado.
            </p>
          </template>

          <template v-else>
            <p class="mt-2 text-lg font-semibold text-slate-500">
              Valor no disponible
            </p>

            <p class="mt-1 text-xs text-amber-600">
              Faltan precios de mercado para uno o más activos.
            </p>
          </template>
        </div>

        <div class="text-left sm:text-right">
          <p class="text-sm font-medium text-slate-700">
            Distribución objetivo acumulada
          </p>

          <p
            class="mt-2 text-2xl font-semibold"
            :class="
              Math.abs(totalWeight - 100) < 0.001
                ? 'text-emerald-600'
                : 'text-slate-900'
            "
          >
            {{ totalWeight.toFixed(2) }}%
            <span class="text-sm font-normal text-slate-400">/ 100%</span>
          </p>

          <p class="mt-1 text-xs text-slate-400">
            {{
              Math.abs(totalWeight - 100) < 0.001
                ? '✓ Distribución completa al 100%'
                : `Resta ${(100 - totalWeight).toFixed(2)}% por distribuir`
            }}
          </p>
        </div>
      </div>

      <!-- Mensajes de activación -->
      <div
        v-if="activationError"
        class="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ activationError }}
      </div>

      <div
        v-if="activationSuccess"
        class="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      >
        {{ activationSuccess }}
      </div>

      <!-- Barra de Activación -->
      <div class="mt-6 flex justify-end">
        <button
          v-if="portfolio.status === 'draft'"
          type="button"
          :disabled="
            activating ||
            portfolioAssets.length === 0 ||
            Math.abs(totalWeight - 100) > 0.001
          "
          class="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          @click="handleActivatePortfolio"
        >
          {{ activating ? 'Activando...' : 'Activar portafolio' }}
        </button>

        <div v-else class="flex items-center gap-3">
          <div
            class="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"
          >
            Portafolio activo
          </div>

          <RouterLink
            :to="`/portfolios/${portfolio.id}/analysis`"
            class="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            Ver análisis y rebalanceo →
          </RouterLink>
        </div>
      </div>

      <!-- Modal Crear / Editar Activo -->
      <div
        v-if="showAssetModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        @click.self="closeAssetModal"
      >
        <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
          <!-- Header Modal -->
          <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
          >
            <div>
              <h2 class="text-lg font-semibold text-slate-900">
                {{ editingAsset ? 'Editar posición de activo' : 'Agregar activo al portafolio' }}
              </h2>

              <p class="mt-0.5 text-xs text-slate-500">
                {{
                  editingAsset
                    ? 'Actualiza tu cantidad y el peso objetivo en este portafolio.'
                    : 'Selecciona un activo compatible con tu broker y define su peso.'
                }}
              </p>
            </div>

            <button
              type="button"
              class="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              @click="closeAssetModal"
            >
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Formulario -->
          <form class="space-y-5 p-6" @submit.prevent="handleSaveAsset">
            <!-- Selector de activo al crear -->
            <div v-if="!editingAsset" class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-medium text-slate-700">
                  Activo bursátil <span class="text-red-500">*</span>
                </label>

                <span v-if="broker" class="text-xs font-semibold text-teal-600">
                  {{ isNationalBroker ? '🇵🇪 Broker local (BVL)' : '🌎 Broker internacional' }}
                </span>
              </div>

              <!-- Pestañas de mercado -->
              <div class="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  class="flex-1 rounded-md py-1 font-medium transition"
                  :class="
                    selectedMarketFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  "
                  @click="selectedMarketFilter = 'all'"
                >
                  Todos ({{ availableAssets.length }})
                </button>

                <button
                  type="button"
                  class="flex-1 rounded-md py-1 font-medium transition"
                  :class="
                    selectedMarketFilter === 'bvl'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  "
                  @click="selectedMarketFilter = 'bvl'"
                >
                  🇵🇪 BVL ({{ bvlAssets.length }})
                </button>

                <button
                  type="button"
                  class="flex-1 rounded-md py-1 font-medium transition"
                  :class="
                    selectedMarketFilter === 'international'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  "
                  @click="selectedMarketFilter = 'international'"
                >
                  🌎 EE.UU. ({{ internationalAssets.length }})
                </button>
              </div>

              <!-- Selector -->
              <select
                v-model="assetForm.asset_id"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                <option value="" disabled>Selecciona un activo...</option>

                <!-- Grupo BVL -->
                <optgroup
                  v-if="bvlAssets.length > 0 && selectedMarketFilter !== 'international'"
                  label="🇵🇪 Bolsa de Valores de Lima (BVL)"
                >
                  <option
                    v-for="asset in bvlAssets"
                    :key="asset.id"
                    :value="asset.id"
                  >
                    {{ asset.ticker }} — {{ asset.name }} ({{ asset.currency }})
                  </option>
                </optgroup>

                <!-- Grupo Internacional -->
                <optgroup
                  v-if="internationalAssets.length > 0 && selectedMarketFilter !== 'bvl'"
                  label="🌎 Wall Street & Mercados Globales"
                >
                  <option
                    v-for="asset in internationalAssets"
                    :key="asset.id"
                    :value="asset.id"
                  >
                    {{ asset.ticker }} — {{ asset.name }} ({{ asset.exchange }} • {{ asset.currency }})
                  </option>
                </optgroup>
              </select>

              <!-- Checkbox de filtro por moneda -->
              <div class="flex items-center justify-between text-xs text-slate-500">
                <label class="flex cursor-pointer items-center gap-1.5">
                  <input
                    v-model="filterByCurrency"
                    type="checkbox"
                    class="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Mostrar solo activos en {{ portfolio.currency }} (recomendado)</span>
                </label>
              </div>

              <!-- Ficha del activo seleccionado -->
              <div
                v-if="selectedAsset"
                class="rounded-lg border border-teal-200 bg-teal-50/50 p-3 text-xs"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-900">{{ selectedAsset.ticker }}</span>
                    <span
                      class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="
                        isBvlAsset(selectedAsset)
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700'
                      "
                    >
                      {{ selectedAsset.exchange }}
                    </span>
                    <span class="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] text-slate-700">
                      {{ selectedAsset.asset_type?.toUpperCase() === 'ETF' ? 'ETF' : 'Acción' }}
                    </span>
                  </div>

                  <div class="text-right">
                    <span class="text-slate-500">Precio actual: </span>
                    <span class="font-bold text-slate-900">
                      {{ selectedAsset.currency }}
                      {{ getLatestPrice(selectedAsset.id)?.toFixed(2) ?? 'Sin precio' }}
                    </span>
                  </div>
                </div>

                <p class="mt-1 text-slate-600">{{ selectedAsset.name }}</p>
              </div>
            </div>

            <!-- Activo al editar -->
            <div v-else>
              <label class="mb-2 block text-sm font-medium text-slate-700">
                Activo
              </label>

              <div class="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-slate-900">
                    {{ getAsset(editingAsset.asset_id)?.ticker }}
                  </span>
                  <span
                    class="rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                    :class="
                      isBvlAsset(getAsset(editingAsset.asset_id))
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-blue-200 bg-blue-50 text-blue-700'
                    "
                  >
                    {{ getAsset(editingAsset.asset_id)?.exchange }}
                  </span>
                </div>

                <p class="mt-0.5 text-xs text-slate-500">
                  {{ getAsset(editingAsset.asset_id)?.name }}
                </p>
              </div>

              <p class="mt-1.5 text-xs text-slate-400">
                El activo no puede cambiarse durante la edición.
              </p>
            </div>

            <!-- Cantidad -->
            <div>
              <label class="mb-1.5 block text-sm font-medium text-slate-700">
                Cantidad de títulos / acciones <span class="text-red-500">*</span>
              </label>

              <input
                v-model.number="assetForm.quantity"
                type="number"
                min="0"
                step="any"
                placeholder="Ej. 100"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <!-- Costo promedio -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <label class="block text-sm font-medium text-slate-700">
                  Costo promedio unitario <span class="font-normal text-slate-400">(opcional)</span>
                </label>

                <button
                  v-if="selectedAsset && getLatestPrice(selectedAsset.id) !== null"
                  type="button"
                  class="text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                  @click="useCurrentPriceAsAverageCost"
                >
                  Usar precio actual ({{ selectedAsset.currency }} {{ getLatestPrice(selectedAsset.id)?.toFixed(2) }})
                </button>
              </div>

              <div class="relative">
                <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  {{ portfolio.currency }}
                </span>

                <input
                  v-model.number="assetForm.average_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej. 185.50"
                  class="w-full rounded-lg border border-slate-300 py-2.5 pl-12 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>

            <!-- Peso objetivo -->
            <div>
              <div class="mb-1.5 flex items-center justify-between">
                <label class="block text-sm font-medium text-slate-700">
                  Peso objetivo (%) <span class="text-red-500">*</span>
                </label>

                <span class="text-xs text-slate-400">
                  Restante disponible: {{ Math.max(0, 100 - totalWeight + (editingAsset ? Number(editingAsset.target_weight) : 0)).toFixed(2) }}%
                </span>
              </div>

              <div class="relative">
                <input
                  v-model.number="assetForm.target_weight"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="Ej. 25.00"
                  class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-8 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />

                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  %
                </span>
              </div>

              <p class="mt-1 text-[11px] text-slate-500">
                Porcentaje de ponderación deseado dentro de la cartera (la suma total debe alcanzar 100%).
              </p>
            </div>

            <!-- Error -->
            <div
              v-if="assetFormError"
              class="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {{ assetFormError }}
            </div>

            <!-- Acciones -->
            <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
              <button
                type="button"
                :disabled="savingAsset"
                class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                @click="closeAssetModal"
              >
                Cancelar
              </button>

              <button
                type="submit"
                :disabled="savingAsset"
                class="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <svg
                  v-if="savingAsset"
                  class="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{
                  savingAsset
                    ? 'Guardando...'
                    : editingAsset
                      ? 'Guardar cambios'
                      : 'Agregar al portafolio'
                }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </template>
  </section>
</template>