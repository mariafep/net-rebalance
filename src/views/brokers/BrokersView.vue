<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { brokerService } from '../../services/broker.service'
import { useAuth } from '../../composables/useAuth'
import type { Broker, BrokerFormData } from '../../types/broker'
import {
  BROKER_PRESETS,
  NATIONAL_BROKERS,
  INTERNATIONAL_BROKERS,
  getPresetById,
  findPresetByName,
  toPercentDisplay,
  toFractionDb,
} from '../../constants/brokerPresets'

const { user } = useAuth()

const brokers = ref<Broker[]>([])
const loading = ref(true)
const errorMessage = ref('')
const deletingBrokerId = ref<string | null>(null)

const searchTerm = ref('')

const filteredBrokers = computed(() => {
  const search = searchTerm.value.trim().toLowerCase()

  if (!search) {
    return brokers.value
  }

  return brokers.value.filter((broker) => {
    return (
      broker.name.toLowerCase().includes(search) ||
      broker.currency.toLowerCase().includes(search)
    )
  })
})

// Modal
const showBrokerModal = ref(false)
const saving = ref(false)
const formError = ref('')

const editingBroker = ref<Broker | null>(null)
const selectedPresetId = ref<string>('custom')

const brokerForm = ref<{
  name: string
  currency: string
  fixed_commission: number
  percentage_commission: number
  spread_percentage: number
}>({
  name: '',
  currency: 'USD',
  fixed_commission: 0,
  percentage_commission: 0,
  spread_percentage: 0,
})

const activePreset = computed(() => {
  return getPresetById(selectedPresetId.value)
})

async function loadBrokers() {
  loading.value = true
  errorMessage.value = ''

  try {
    brokers.value = await brokerService.getBrokers()
  } catch (error) {
    console.error('Error al cargar brokers:', error)
    errorMessage.value = 'No pudimos cargar tus brokers.'
  } finally {
    loading.value = false
  }
}

function openCreateModal(presetId: string = 'custom') {
  editingBroker.value = null
  selectedPresetId.value = presetId

  if (presetId !== 'custom') {
    const preset = getPresetById(presetId)
    if (preset) {
      brokerForm.value = {
        name: preset.name,
        currency: preset.currency,
        fixed_commission: preset.fixed_commission,
        percentage_commission: preset.percentage_commission,
        spread_percentage: preset.spread_percentage,
      }
    } else {
      resetForm()
    }
  } else {
    resetForm()
  }

  formError.value = ''
  showBrokerModal.value = true
}

function resetForm() {
  brokerForm.value = {
    name: '',
    currency: 'USD',
    fixed_commission: 0,
    percentage_commission: 0,
    spread_percentage: 0,
  }
}

function openEditModal(broker: Broker) {
  editingBroker.value = broker

  // Detectar si el nombre coincide con algún preset conocido
  const matched = findPresetByName(broker.name)
  selectedPresetId.value = matched ? matched.id : 'custom'

  brokerForm.value = {
    name: broker.name,
    currency: broker.currency,
    fixed_commission: Number(broker.fixed_commission),
    percentage_commission: toPercentDisplay(broker.percentage_commission),
    spread_percentage: toPercentDisplay(broker.spread_percentage),
  }

  formError.value = ''
  showBrokerModal.value = true
}

function onPresetChange() {
  formError.value = ''

  if (selectedPresetId.value === 'custom') {
    return
  }

  const preset = getPresetById(selectedPresetId.value)
  if (preset) {
    brokerForm.value = {
      name: preset.name,
      currency: preset.currency,
      fixed_commission: preset.fixed_commission,
      percentage_commission: preset.percentage_commission,
      spread_percentage: preset.spread_percentage,
    }
  }
}

function closeModal() {
  if (saving.value) return

  showBrokerModal.value = false
  editingBroker.value = null
  selectedPresetId.value = 'custom'
  formError.value = ''
}

async function handleSaveBroker() {
  formError.value = ''

  if (!user.value) {
    formError.value = 'No se encontró una sesión activa.'
    return
  }

  if (!brokerForm.value.name.trim()) {
    formError.value = 'Ingresa el nombre del broker.'
    return
  }

  if (!brokerForm.value.currency) {
    formError.value = 'Selecciona una moneda.'
    return
  }

  if (
    brokerForm.value.fixed_commission < 0 ||
    brokerForm.value.percentage_commission < 0 ||
    brokerForm.value.spread_percentage < 0
  ) {
    formError.value = 'Las comisiones y el spread no pueden ser negativos.'
    return
  }

  saving.value = true

  try {
    const formData: BrokerFormData = {
      name: brokerForm.value.name.trim(),
      currency: brokerForm.value.currency,
      fixed_commission: Number(brokerForm.value.fixed_commission),
      percentage_commission: toFractionDb(brokerForm.value.percentage_commission),
      spread_percentage: toFractionDb(brokerForm.value.spread_percentage),
    }

    if (editingBroker.value) {
      const updatedBroker = await brokerService.updateBroker(
        editingBroker.value.id,
        formData,
      )

      const index = brokers.value.findIndex(
        (broker) => broker.id === updatedBroker.id,
      )

      if (index !== -1) {
        brokers.value[index] = updatedBroker
      }
    } else {
      const newBroker = await brokerService.createBroker(
        user.value.id,
        formData,
      )

      brokers.value.unshift(newBroker)
    }

    showBrokerModal.value = false
    editingBroker.value = null
  } catch (error) {
    console.error('Error al guardar broker:', error)
    formError.value = 'No pudimos guardar los cambios del broker.'
  } finally {
    saving.value = false
  }
}

async function handleDeleteBroker(broker: Broker) {
  if (saving.value || deletingBrokerId.value) return

  const confirmDelete = window.confirm(
    `¿Estás seguro de que deseas eliminar el broker "${broker.name}"? Esta acción no se puede deshacer.`,
  )

  if (!confirmDelete) return

  deletingBrokerId.value = broker.id
  errorMessage.value = ''

  try {
    await brokerService.deleteBroker(broker.id)
    brokers.value = brokers.value.filter((b) => b.id !== broker.id)
  } catch (error) {
    console.error('Error al eliminar broker:', error)
    errorMessage.value =
      'No se pudo eliminar el broker. Es posible que esté asignado a uno de tus portafolios existentes.'
  } finally {
    deletingBrokerId.value = null
  }
}

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2)
}

function formatPercent(value: number | null | undefined) {
  return toPercentDisplay(value).toFixed(2)
}

function getBrokerBadge(brokerName: string) {
  const preset = findPresetByName(brokerName)
  if (!preset) return null

  return {
    label: preset.category === 'national' ? '🇵🇪 BVL / Nacional' : '🌎 Internacional',
    badgeClass:
      preset.category === 'national'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-blue-50 text-blue-700 border-blue-200',
  }
}

onMounted(() => {
  loadBrokers()
})
</script>

<template>
  <section>
    <!-- Encabezado -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">
          Mis Brokers
        </h1>

        <p class="mt-1 text-sm text-slate-500">
          Configura tus intermediarios bursátiles con sus costos y comisiones para el rebalanceo de tus portafolios.
        </p>
      </div>

      <button
        type="button"
        class="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
        @click="openCreateModal('custom')"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Agregar broker
      </button>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center"
    >
      <div class="inline-flex items-center gap-2 text-sm text-slate-500">
        <svg class="h-5 w-5 animate-spin text-teal-600" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Cargando brokers...
      </div>
    </div>

    <!-- Error -->
    <div
      v-else-if="errorMessage"
      class="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      <div class="flex items-center justify-between">
        <p>{{ errorMessage }}</p>
        <button
          type="button"
          class="font-medium underline hover:text-red-900"
          @click="loadBrokers"
        >
          Reintentar
        </button>
      </div>
    </div>

    <!-- Estado vacío con accesos rápidos -->
    <div
      v-else-if="brokers.length === 0"
      class="mt-8 rounded-xl border border-slate-200 bg-white p-6 sm:p-10"
    >
      <div class="text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-600">
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>

        <h2 class="mt-3 text-lg font-semibold text-slate-900">
          Aún no tienes brokers registrados
        </h2>

        <p class="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Registra un broker para vincular tus portafolios y calcular costos reales de rebalanceo. Elige uno de los más conocidos en Perú para autocompletarlo:
        </p>
      </div>

      <!-- Grid de brokers recomendados -->
      <div class="mt-8">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Brokers sugeridos (Nacionales e Internacionales)
        </p>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="preset in BROKER_PRESETS.slice(0, 6)"
            :key="preset.id"
            type="button"
            class="group flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-left transition hover:border-teal-500 hover:bg-teal-50/30 hover:shadow-sm"
            @click="openCreateModal(preset.id)"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-900 group-hover:text-teal-700">
                {{ preset.name }}
              </span>
              <span
                class="rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
                :class="
                  preset.category === 'national'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700'
                "
              >
                {{ preset.category === 'national' ? '🇵🇪 BVL' : '🌎 Int.' }}
              </span>
            </div>

            <p class="mt-2 line-clamp-2 text-xs text-slate-500">
              {{ preset.description }}
            </p>

            <div class="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs text-slate-600">
              <span>Moneda: <strong>{{ preset.currency }}</strong></span>
              <span class="font-medium text-teal-600 group-hover:underline">+ Seleccionar</span>
            </div>
          </button>
        </div>

        <div class="mt-6 text-center">
          <button
            type="button"
            class="text-sm font-semibold text-teal-600 hover:text-teal-700 hover:underline"
            @click="openCreateModal('custom')"
          >
            + O agregar otro broker personalizado
          </button>
        </div>
      </div>
    </div>

    <!-- Tabla de Brokers -->
    <div
      v-else
      class="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <!-- Barra superior: Buscador y contador -->
      <div class="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="relative w-full sm:max-w-xs">
          <svg
            class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>

          <input
            v-model="searchTerm"
            type="text"
            placeholder="Buscar por nombre o moneda..."
            class="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </div>

        <div class="text-xs text-slate-500">
          Mostrando {{ filteredBrokers.length }} de {{ brokers.length }} brokers registrados
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              <th class="px-5 py-3.5">
                Broker
              </th>

              <th class="px-5 py-3.5">
                Moneda
              </th>

              <th class="px-5 py-3.5">
                Comisión fija
              </th>

              <th class="px-5 py-3.5">
                Comisión %
              </th>

              <th class="px-5 py-3.5">
                Spread estimado
              </th>

              <th class="px-5 py-3.5 text-right">
                Acciones
              </th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100">
            <tr
              v-for="broker in filteredBrokers"
              :key="broker.id"
              class="transition hover:bg-slate-50/75"
            >
              <td class="px-5 py-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium text-slate-900">
                    {{ broker.name }}
                  </span>

                  <span
                    v-if="getBrokerBadge(broker.name)"
                    class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                    :class="getBrokerBadge(broker.name)!.badgeClass"
                  >
                    {{ getBrokerBadge(broker.name)!.label }}
                  </span>
                </div>
              </td>

              <td class="px-5 py-4">
                <span class="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                  {{ broker.currency }}
                </span>
              </td>

              <td class="px-5 py-4 font-mono text-slate-700">
                {{ broker.currency }} {{ formatNumber(broker.fixed_commission) }}
              </td>

              <td class="px-5 py-4 font-mono text-slate-700">
                {{ formatPercent(broker.percentage_commission) }}%
              </td>

              <td class="px-5 py-4 font-mono text-slate-700">
                {{ formatPercent(broker.spread_percentage) }}%
              </td>

              <td class="px-5 py-4 text-right">
                <div class="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    class="font-medium text-teal-600 transition hover:text-teal-700"
                    @click="openEditModal(broker)"
                  >
                    Editar
                  </button>

                  <span class="text-slate-300">|</span>

                  <button
                    type="button"
                    :disabled="deletingBrokerId === broker.id"
                    class="font-medium text-red-600 transition hover:text-red-700 disabled:opacity-50"
                    @click="handleDeleteBroker(broker)"
                  >
                    {{ deletingBrokerId === broker.id ? 'Eliminando...' : 'Eliminar' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: nuevo / editar broker -->
    <div
      v-if="showBrokerModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      @click.self="closeModal"
    >
      <div class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">
              {{ editingBroker ? 'Editar broker' : 'Agregar broker' }}
            </h2>

            <p class="mt-0.5 text-xs text-slate-500">
              Configura los costos y tarifas asociados para evaluar la conveniencia del rebalanceo.
            </p>
          </div>

          <button
            type="button"
            class="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            @click="closeModal"
          >
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Formulario -->
        <form
          class="space-y-5 p-6"
          @submit.prevent="handleSaveBroker"
        >
          <!-- Selector de Broker Predefinido -->
          <div>
            <label
              for="presetSelector"
              class="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700"
            >
              <span>Seleccionar broker conocido</span>
              <span class="text-xs font-normal text-teal-600">Autocompleta tarifas estimadas</span>
            </label>

            <select
              id="presetSelector"
              v-model="selectedPresetId"
              class="w-full rounded-lg border border-teal-300 bg-teal-50/20 px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-600 focus:bg-white focus:ring-2 focus:ring-teal-100"
              @change="onPresetChange"
            >
              <option value="custom">✏️ Personalizado (Ingresar manualmente)</option>

              <optgroup label="🇵🇪 Brokers Nacionales (Perú / BVL)">
                <option
                  v-for="preset in NATIONAL_BROKERS"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.name }} ({{ preset.currency }})
                </option>
              </optgroup>

              <optgroup label="🌎 Brokers Internacionales">
                <option
                  v-for="preset in INTERNATIONAL_BROKERS"
                  :key="preset.id"
                  :value="preset.id"
                >
                  {{ preset.name }} ({{ preset.currency }})
                </option>
              </optgroup>
            </select>
          </div>

          <!-- Banner Informativo del Preset Seleccionado -->
          <div
            v-if="activePreset"
            class="rounded-lg border border-teal-200 bg-teal-50/60 p-3.5 text-xs text-slate-700"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-teal-900">
                {{ activePreset.name }}
              </span>

              <span
                class="rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                :class="
                  activePreset.category === 'national'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800'
                "
              >
                {{ activePreset.categoryLabel }}
              </span>
            </div>

            <p class="mt-1 text-slate-600">
              {{ activePreset.description }}
            </p>

            <div class="mt-2.5 flex flex-wrap gap-1.5">
              <span
                v-for="feat in activePreset.features"
                :key="feat"
                class="rounded bg-white/80 px-2 py-0.5 text-[11px] font-medium text-teal-800 shadow-2xs"
              >
                ✓ {{ feat }}
              </span>
            </div>

            <p class="mt-2 border-t border-teal-200/60 pt-2 text-[11px] text-teal-700">
              💡 Los valores se han llenado automáticamente con tarifas referenciales. Puedes ajustarlos abajo si cuentas con un plan preferencial.
            </p>
          </div>

          <!-- Nombre del broker -->
          <div>
            <label
              for="brokerName"
              class="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Nombre del broker <span class="text-red-500">*</span>
            </label>

            <input
              id="brokerName"
              v-model="brokerForm.name"
              type="text"
              placeholder="Ej. Interactive Brokers, Trii, Kallpa SAB..."
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <!-- Moneda -->
          <div>
            <label
              for="currency"
              class="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Moneda principal del broker <span class="text-red-500">*</span>
            </label>

            <select
              id="currency"
              v-model="brokerForm.currency"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              <option value="USD">USD - Dólares estadounidenses</option>
              <option value="PEN">PEN - Soles peruanos</option>
            </select>
            <p class="mt-1 text-xs text-slate-500">
              Tus portafolios asociados a este broker operarán bajo esta divisa.
            </p>
          </div>

          <!-- Comisión fija y Comisión porcentual -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                for="fixedCommission"
                class="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Comisión fija ({{ brokerForm.currency }})
              </label>

              <div class="relative">
                <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  {{ brokerForm.currency }}
                </span>

                <input
                  id="fixedCommission"
                  v-model.number="brokerForm.fixed_commission"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full rounded-lg border border-slate-300 py-2.5 pl-12 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <p class="mt-1 text-[11px] text-slate-500">
                Costo fijo mínimo por transacción (ej. 1.00 USD o 12.50 PEN).
              </p>
            </div>

            <div>
              <label
                for="percentageCommission"
                class="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Comisión porcentual (%)
              </label>

              <div class="relative">
                <input
                  id="percentageCommission"
                  v-model.number="brokerForm.percentage_commission"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-8 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />

                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  %
                </span>
              </div>

              <p class="mt-1 text-[11px] text-slate-500">
                Porcentaje sobre el volumen operado (ej. 0.50 para 0.50%).
              </p>
            </div>
          </div>

          <!-- Spread estimado -->
          <div>
            <label
              for="spread"
              class="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Spread estimado (%)
            </label>

            <div class="relative">
              <input
                id="spread"
                v-model.number="brokerForm.spread_percentage"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-8 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />

              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                %
              </span>
            </div>

            <p class="mt-1 text-[11px] text-slate-500">
              Diferencia promedio de compra/venta o deslizamiento de mercado (ej. 0.10 para 0.10%).
            </p>
          </div>

          <!-- Alerta de Error -->
          <div
            v-if="formError"
            class="rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {{ formError }}
          </div>

          <!-- Acciones -->
          <div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              :disabled="saving"
              class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              @click="closeModal"
            >
              Cancelar
            </button>

            <button
              type="submit"
              :disabled="saving"
              class="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                v-if="saving"
                class="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {{
                saving
                  ? 'Guardando...'
                  : editingBroker
                    ? 'Guardar cambios'
                    : 'Guardar broker'
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>