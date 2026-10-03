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

const showAssetModal = ref(false)
const savingAsset = ref(false)
const assetFormError = ref('')
const editingAsset = ref<PortfolioAsset | null>(null)

const activating = ref(false)
const activationError = ref('')
const activationSuccess = ref('')

const assetForm = ref({
  asset_id: '',
  quantity: 0,
  average_cost: null as number | null,
  target_weight: 0,
})

const deletingAssetId = ref<string | null>(null)

const portfolioId = computed(() =>
    String(route.params.id),
)

const totalWeight = computed(() =>
    portfolioAssets.value.reduce(
        (total, item) =>
            total + Number(item.target_weight),
        0,
    ),
)

const availableAssets = computed(() => {
  const usedAssetIds = new Set(
      portfolioAssets.value.map(
          (item) => item.asset_id,
      ),
  )

  return assets.value.filter(
      (asset) => !usedAssetIds.has(asset.id),
  )
})

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
  return portfolioAssets.value.reduce(
      (total, item) => {
        const currentValue = getCurrentValue(item)

        if (currentValue === null) {
          return total
        }

        return total + currentValue
      },
      0,
  )
})

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

function getCurrentWeight(item: PortfolioAsset) {
  if (!hasCompletePriceCoverage.value) {
    return null
  }

  const currentValue = getCurrentValue(item)

  if (
      currentValue === null ||
      totalCurrentValue.value <= 0
  ) {
    return null
  }

  return (
      currentValue /
      totalCurrentValue.value
  ) * 100
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
                item.id === portfolioData.broker_id,
        ) ?? null

    assets.value = assetData
    portfolioAssets.value = portfolioAssetData
    latestPrices.value = latestPriceData
  } catch (error) {
    console.error(
        'Error al cargar configuración:',
        error,
    )

    errorMessage.value =
        'No pudimos cargar la configuración del portafolio.'
  } finally {
    loading.value = false
  }
}

function openCreateAssetModal() {
  editingAsset.value = null

  assetForm.value = {
    asset_id:
        availableAssets.value[0]?.id ?? '',
    quantity: 0,
    average_cost: null,
    target_weight: 0,
  }

  assetFormError.value = ''
  showAssetModal.value = true
}

function openEditAssetModal(
    item: PortfolioAsset,
) {
  if (portfolio.value?.status !== 'draft') {
    return
  }

  editingAsset.value = item

  assetForm.value = {
    asset_id: item.asset_id,
    quantity: Number(item.quantity),
    average_cost:
        item.average_cost !== null
            ? Number(item.average_cost)
            : null,
    target_weight:
        Number(item.target_weight),
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
    assetFormError.value =
        'Selecciona un activo.'
    return
  }

  if (assetForm.value.quantity <= 0) {
    assetFormError.value =
        'La cantidad debe ser mayor a 0.'
    return
  }

  if (
      assetForm.value.average_cost !== null &&
      assetForm.value.average_cost < 0
  ) {
    assetFormError.value =
        'El costo promedio no puede ser negativo.'
    return
  }

  if (
      assetForm.value.target_weight <= 0 ||
      assetForm.value.target_weight > 100
  ) {
    assetFormError.value =
        'El peso objetivo debe ser mayor a 0 y máximo 100%.'
    return
  }

  /*
   * Si estamos editando, quitamos temporalmente
   * el peso anterior para calcular correctamente
   * el nuevo total.
   */
  const weightWithoutCurrent =
      editingAsset.value
          ? totalWeight.value -
          Number(
              editingAsset.value.target_weight,
          )
          : totalWeight.value

  const projectedWeight =
      weightWithoutCurrent +
      assetForm.value.target_weight

  if (projectedWeight > 100.001) {
    assetFormError.value =
        `La distribución superaría el 100%. El total quedaría en ${projectedWeight.toFixed(2)}%.`
    return
  }

  savingAsset.value = true

  try {
    if (editingAsset.value) {
      const updatedAsset =
          await assetService.updatePortfolioAsset(
              editingAsset.value.id,
              {
                asset_id:
                editingAsset.value.asset_id,
                quantity:
                assetForm.value.quantity,
                average_cost:
                assetForm.value.average_cost,
                target_weight:
                assetForm.value.target_weight,
              },
          )

      const index =
          portfolioAssets.value.findIndex(
              (item) =>
                  item.id === updatedAsset.id,
          )

      if (index !== -1) {
        portfolioAssets.value[index] =
            updatedAsset
      }
    } else {
      const newPortfolioAsset =
          await assetService.addPortfolioAsset(
              portfolioId.value,
              {
                asset_id:
                assetForm.value.asset_id,
                quantity:
                assetForm.value.quantity,
                average_cost:
                assetForm.value.average_cost,
                target_weight:
                assetForm.value.target_weight,
              },
          )

      portfolioAssets.value.push(
          newPortfolioAsset,
      )
    }

    showAssetModal.value = false
    editingAsset.value = null
  } catch (error) {
    console.error(
        'Error al guardar activo:',
        error,
    )

    assetFormError.value =
        'No pudimos guardar los cambios del activo.'
  } finally {
    savingAsset.value = false
  }
}

async function handleDeleteAsset(
    item: PortfolioAsset,
) {
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
    await assetService.deletePortfolioAsset(
        item.id,
    )

    portfolioAssets.value =
        portfolioAssets.value.filter(
            (portfolioAsset) =>
                portfolioAsset.id !== item.id,
        )

    activationError.value = ''
    activationSuccess.value = ''
  } catch (error) {
    console.error(
        'Error al eliminar activo:',
        error,
    )

    window.alert(
        'No pudimos quitar el activo del portafolio.',
    )
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

  if (
      Math.abs(totalWeight.value - 100) >
      0.001
  ) {
    activationError.value =
        'La distribución objetivo debe sumar exactamente 100%.'
    return
  }

  activating.value = true

  try {
    const activatedPortfolio =
        await portfolioService.activatePortfolio(
            portfolio.value.id,
        )

    portfolio.value = activatedPortfolio

    activationSuccess.value =
        'Portafolio activado correctamente.'
  } catch (error) {
    console.error(
        'Error al activar portafolio:',
        error,
    )

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

      <span class="text-slate-700">
        Configuración
      </span>
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
          {{ portfolio.status }}
        </span>
      </div>

      <!-- Información general -->
      <div
          class="mt-8 rounded-xl border border-slate-200 bg-white p-6"
      >
        <h2 class="font-semibold text-slate-900">
          Información general
        </h2>

        <div class="mt-5 grid grid-cols-3 gap-6">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Broker
            </p>

            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ broker?.name ?? 'No disponible' }}
            </p>
          </div>

          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Moneda
            </p>

            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ portfolio.currency }}
            </p>
          </div>

          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
              Estado
            </p>

            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ portfolio.status }}
            </p>
          </div>
        </div>
      </div>

      <!-- Activos -->
      <div
          class="mt-6 rounded-xl border border-slate-200 bg-white"
      >
        <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-5"
        >
          <div>
            <h2 class="font-semibold text-slate-900">
              Activos del portafolio
            </h2>

            <p class="mt-1 text-sm text-slate-500">
              Posición actual y distribución objetivo.
            </p>
          </div>

          <button
              v-if="portfolio.status === 'draft'"
              type="button"
              :disabled="availableAssets.length === 0"
              class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              @click="openCreateAssetModal"
          >
            + Agregar activo
          </button>
        </div>

        <!-- Sin activos -->
        <div
            v-if="portfolioAssets.length === 0"
            class="px-6 py-10 text-center"
        >
          <h3 class="text-sm font-semibold text-slate-800">
            Aún no has agregado activos
          </h3>

          <p class="mt-2 text-sm text-slate-500">
            Agrega los activos que forman parte de este portafolio.
          </p>
        </div>

        <!-- Tabla -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50">
            <tr class="border-b border-slate-200">
              <th class="px-5 py-3 font-medium text-slate-600">
                Activo
              </th>

              <th class="px-5 py-3 font-medium text-slate-600">
                Cantidad
              </th>

              <th class="px-5 py-3 font-medium text-slate-600">
                Precio actual
              </th>

              <th class="px-5 py-3 font-medium text-slate-600">
                Valor actual
              </th>

              <th class="px-5 py-3 font-medium text-slate-600">
                Peso actual
              </th>

              <th class="px-5 py-3 font-medium text-slate-600">
                Peso objetivo
              </th>

              <th
                  v-if="portfolio.status === 'draft'"
                  class="px-5 py-3 text-right font-medium text-slate-600"
              >
                Acción
              </th>
            </tr>
            </thead>

            <tbody class="divide-y divide-slate-100">
            <tr
                v-for="item in portfolioAssets"
                :key="item.id"
            >
              <!-- Activo -->
              <td class="px-5 py-4">
                <p class="font-semibold text-slate-900">
                  {{ getAsset(item.asset_id)?.ticker }}
                </p>

                <p class="mt-0.5 text-xs text-slate-500">
                  {{ getAsset(item.asset_id)?.name }}
                </p>
              </td>

              <!-- Cantidad -->
              <td class="px-5 py-4 text-slate-600">
                {{ Number(item.quantity) }}
              </td>

              <!-- Precio -->
              <td class="px-5 py-4 text-slate-600">
                <template
                    v-if="getLatestPrice(item.asset_id) !== null"
                >
                  {{ portfolio.currency }}
                  {{ getLatestPrice(item.asset_id)?.toFixed(2) }}
                </template>

                <span v-else class="text-slate-400">
                    Sin precio
                  </span>
              </td>

              <!-- Valor -->
              <td class="px-5 py-4 text-slate-600">
                <template
                    v-if="getCurrentValue(item) !== null"
                >
                  {{ portfolio.currency }}
                  {{ getCurrentValue(item)?.toFixed(2) }}
                </template>

                <span v-else class="text-slate-400">
                    —
                  </span>
              </td>

              <!-- Peso actual -->
              <td class="px-5 py-4 text-slate-600">
                <template
                    v-if="getCurrentWeight(item) !== null"
                >
                  {{ getCurrentWeight(item)?.toFixed(2) }}%
                </template>

                <span v-else class="text-slate-400">
                    —
                  </span>
              </td>

              <!-- Peso objetivo -->
              <td class="px-5 py-4 font-medium text-slate-700">
                {{ Number(item.target_weight).toFixed(2) }}%
              </td>

              <!-- Editar -->
              <td
                  v-if="portfolio.status === 'draft'"
                  class="px-5 py-4 text-right"
              >
                <div class="flex items-center justify-end gap-4">
                  <button
                      type="button"
                      class="font-medium text-teal-600 transition hover:text-teal-700"
                      @click="openEditAssetModal(item)"
                  >
                    Editar
                  </button>

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
          class="mt-6 grid grid-cols-2 gap-6 rounded-xl border border-slate-200 bg-white p-6"
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
              Calculado con los últimos precios disponibles.
            </p>
          </template>

          <template v-else>
            <p class="mt-2 text-lg font-semibold text-slate-500">
              Valor no disponible
            </p>

            <p class="mt-1 text-xs text-amber-600">
              Faltan precios para uno o más activos.
            </p>
          </template>
        </div>

        <div class="text-right">
          <p class="text-sm font-medium text-slate-700">
            Distribución objetivo
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
          </p>

          <p class="mt-1 text-xs text-slate-400">
            de 100%
          </p>
        </div>
      </div>

      <!-- Mensajes -->
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

      <!-- Activar -->
      <div class="mt-6 flex justify-end">
        <button
            v-if="portfolio.status === 'draft'"
            type="button"
            :disabled="
            activating ||
            portfolioAssets.length === 0 ||
            Math.abs(totalWeight - 100) > 0.001
          "
            class="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            @click="handleActivatePortfolio"
        >
          {{
            activating
                ? 'Activando...'
                : 'Activar portafolio'
          }}
        </button>

        <div
            v-else
            class="flex items-center gap-3"
        >
          <div
              class="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700"
          >
            Portafolio activo
          </div>

          <RouterLink
              :to="`/portfolios/${portfolio.id}/analysis`"
              class="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            Ver análisis
          </RouterLink>
        </div>
      </div>

      <!-- Modal Crear / Editar -->
      <div
          v-if="showAssetModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          @click.self="closeAssetModal"
      >
        <div
            class="w-full max-w-lg rounded-xl bg-white shadow-xl"
        >
          <!-- Header -->
          <div
              class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
          >
            <div>
              <h2 class="text-lg font-semibold text-slate-900">
                {{
                  editingAsset
                      ? 'Editar activo'
                      : 'Agregar activo'
                }}
              </h2>

              <p class="mt-1 text-sm text-slate-500">
                {{
                  editingAsset
                      ? 'Actualiza tu posición y distribución objetivo.'
                      : 'Ingresa tu posición y el peso objetivo.'
                }}
              </p>
            </div>

            <button
                type="button"
                class="text-xl text-slate-400 hover:text-slate-600"
                @click="closeAssetModal"
            >
              ×
            </button>
          </div>

          <!-- Formulario -->
          <form
              class="space-y-5 p-6"
              @submit.prevent="handleSaveAsset"
          >
            <!-- Activo al crear -->
            <div v-if="!editingAsset">
              <label
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Activo
              </label>

              <select
                  v-model="assetForm.asset_id"
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                <option
                    v-for="asset in availableAssets"
                    :key="asset.id"
                    :value="asset.id"
                >
                  {{ asset.ticker }} — {{ asset.name }}
                </option>
              </select>
            </div>

            <!-- Activo al editar -->
            <div v-else>
              <label
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Activo
              </label>

              <div
                  class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <p class="text-sm font-medium text-slate-800">
                  {{ getAsset(editingAsset.asset_id)?.ticker }}
                </p>

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
              <label
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Cantidad
              </label>

              <input
                  v-model.number="assetForm.quantity"
                  type="number"
                  min="0"
                  step="any"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <!-- Costo -->
            <div>
              <label
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Costo promedio

                <span class="font-normal text-slate-400">
                  (opcional)
                </span>
              </label>

              <input
                  v-model.number="assetForm.average_cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ej. 185.50"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <!-- Peso -->
            <div>
              <label
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Peso objetivo (%)
              </label>

              <input
                  v-model.number="assetForm.target_weight"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />

              <p class="mt-1.5 text-xs text-slate-400">
                La distribución total no puede superar 100%.
              </p>
            </div>

            <!-- Error -->
            <div
                v-if="assetFormError"
                class="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {{ assetFormError }}
            </div>

            <!-- Acciones -->
            <div
                class="flex justify-end gap-3 border-t border-slate-200 pt-5"
            >
              <button
                  type="button"
                  :disabled="savingAsset"
                  class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  @click="closeAssetModal"
              >
                Cancelar
              </button>

              <button
                  type="submit"
                  :disabled="savingAsset"
                  class="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {{
                  savingAsset
                      ? 'Guardando...'
                      : editingAsset
                          ? 'Guardar cambios'
                          : 'Agregar activo'
                }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </template>
  </section>
</template>