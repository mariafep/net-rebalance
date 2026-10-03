<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { brokerService } from '../../services/broker.service'
import { useAuth } from '../../composables/useAuth'
import type { Broker, BrokerFormData } from '../../types/broker'

const { user } = useAuth()

const brokers = ref<Broker[]>([])
const loading = ref(true)
const errorMessage = ref('')

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

const brokerForm = ref<BrokerFormData>({
  name: '',
  currency: 'USD',
  fixed_commission: 0,
  percentage_commission: 0,
  spread_percentage: 0,
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

function openCreateModal() {
  editingBroker.value = null

  brokerForm.value = {
    name: '',
    currency: 'USD',
    fixed_commission: 0,
    percentage_commission: 0,
    spread_percentage: 0,
  }

  formError.value = ''
  showBrokerModal.value = true
}

function openEditModal(broker: Broker) {
  editingBroker.value = broker

  brokerForm.value = {
    name: broker.name,
    currency: broker.currency,
    fixed_commission: Number(broker.fixed_commission),
    percentage_commission: Number(broker.percentage_commission),
    spread_percentage: Number(broker.spread_percentage),
  }

  formError.value = ''
  showBrokerModal.value = true
}

function closeModal() {
  if (saving.value) return

  showBrokerModal.value = false
  editingBroker.value = null
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
    formError.value =
        'Las comisiones y el spread no pueden ser negativos.'
    return
  }

  saving.value = true

  try {
    const formData = {
      ...brokerForm.value,
      name: brokerForm.value.name.trim(),
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

function formatNumber(value: number) {
  return Number(value).toFixed(2)
}

onMounted(() => {
  loadBrokers()
})
</script>

<template>
  <section>
    <!-- Encabezado -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">
          Mis Brokers
        </h1>

        <p class="mt-1 text-sm text-slate-500">
          Administra los brokers y costos asociados a tus inversiones.
        </p>
      </div>

      <button
          type="button"
          class="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
          @click="openCreateModal"
      >
        + Agregar broker
      </button>
    </div>

    <!-- Loading -->
    <div
        v-if="loading"
        class="mt-8 rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Cargando brokers...
      </p>
    </div>

    <!-- Error -->
    <div
        v-else-if="errorMessage"
        class="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ errorMessage }}
    </div>

    <!-- Estado vacío -->
    <div
        v-else-if="brokers.length === 0"
        class="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
    >
      <h2 class="font-semibold text-slate-900">
        Aún no tienes brokers
      </h2>

      <p class="mt-2 text-sm text-slate-500">
        Agrega tu primer broker para configurar sus costos y comisiones.
      </p>
    </div>

    <!-- Tabla -->
    <div
        v-else
        class="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <!-- Buscador -->
      <div class="border-b border-slate-200 p-4">
        <div class="relative">
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
              placeholder="Buscar broker por nombre o moneda..."
              class="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-slate-200 bg-slate-50">
          <tr>
            <th class="px-5 py-3 font-medium text-slate-600">
              Broker
            </th>

            <th class="px-5 py-3 font-medium text-slate-600">
              Moneda
            </th>

            <th class="px-5 py-3 font-medium text-slate-600">
              Comisión fija
            </th>

            <th class="px-5 py-3 font-medium text-slate-600">
              Comisión %
            </th>

            <th class="px-5 py-3 font-medium text-slate-600">
              Spread estimado
            </th>

            <th class="px-5 py-3 text-right font-medium text-slate-600">
              Acción
            </th>
          </tr>
          </thead>

          <tbody class="divide-y divide-slate-100">
          <tr
              v-for="broker in filteredBrokers"
              :key="broker.id"
              class="hover:bg-slate-50"
          >
            <td class="px-5 py-4 font-medium text-slate-900">
              {{ broker.name }}
            </td>

            <td class="px-5 py-4 text-slate-600">
              {{ broker.currency }}
            </td>

            <td class="px-5 py-4 text-slate-600">
              {{ formatNumber(broker.fixed_commission) }}
            </td>

            <td class="px-5 py-4 text-slate-600">
              {{ formatNumber(broker.percentage_commission) }}%
            </td>

            <td class="px-5 py-4 text-slate-600">
              {{ formatNumber(broker.spread_percentage) }}%
            </td>

            <td class="px-5 py-4 text-right">
              <button
                  type="button"
                  class="font-medium text-teal-600 hover:text-teal-700"
                  @click="openEditModal(broker)"
              >
                Editar
              </button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
    <!-- Modal: nuevo broker -->
    <div
        v-if="showBrokerModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
        @click.self="closeModal"
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
              {{ editingBroker ? 'Editar broker' : 'Agregar broker' }}
            </h2>

            <p class="mt-1 text-sm text-slate-500">
              Configura los costos asociados a tu broker.
            </p>
          </div>

          <button
              type="button"
              class="text-xl text-slate-400 transition hover:text-slate-600"
              @click="closeModal"
          >
            ×
          </button>
        </div>

        <!-- Formulario -->
        <form
            class="space-y-5 p-6"
            @submit.prevent="handleSaveBroker"
        >
          <div>
            <label
                for="brokerName"
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Nombre del broker
            </label>

            <input
                id="brokerName"
                v-model="brokerForm.name"
                type="text"
                placeholder="Ej. Interactive Brokers"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div>
            <label
                for="currency"
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Moneda
            </label>

            <select
                id="currency"
                v-model="brokerForm.currency"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            >
              <option value="USD">USD</option>
              <option value="PEN">PEN</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label
                  for="fixedCommission"
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Comisión fija
              </label>

              <input
                  id="fixedCommission"
                  v-model.number="brokerForm.fixed_commission"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div>
              <label
                  for="percentageCommission"
                  class="mb-2 block text-sm font-medium text-slate-700"
              >
                Comisión (%)
              </label>

              <input
                  id="percentageCommission"
                  v-model.number="brokerForm.percentage_commission"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>

          <div>
            <label
                for="spread"
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Spread estimado (%)
            </label>

            <input
                id="spread"
                v-model.number="brokerForm.spread_percentage"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div
              v-if="formError"
              class="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            {{ formError }}
          </div>

          <!-- Acciones -->
          <div
              class="flex justify-end gap-3 border-t border-slate-200 pt-5"
          >
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
                class="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
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