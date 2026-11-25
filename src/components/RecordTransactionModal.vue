<script setup lang="ts">
import { computed, ref } from 'vue'
import { transactionService } from '../services/transaction.service'
import type { Asset } from '../types/asset'
import type { TransactionType } from '../types/transaction'

const props = defineProps<{
  show: boolean
  portfolioId: string
  currency: string
  assets: Asset[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const txType = ref<TransactionType>('BUY')
const assetId = ref('')
const quantity = ref<number>(0)
const unitPrice = ref<number>(0)
const fees = ref<number>(0)
const transactionDate = ref(new Date().toISOString().split('T')[0])
const notes = ref('')

const saving = ref(false)
const errorMessage = ref('')

const compatibleAssets = computed(() =>
  props.assets.filter((a) => a.currency === props.currency),
)

const totalAmount = computed(() =>
  Number((Number(quantity.value || 0) * Number(unitPrice.value || 0)).toFixed(2)),
)

async function handleSubmit() {
  errorMessage.value = ''

  if (!assetId.value) {
    errorMessage.value = 'Selecciona un activo.'
    return
  }

  if (quantity.value <= 0) {
    errorMessage.value = 'La cantidad debe ser mayor a 0.'
    return
  }

  if (unitPrice.value < 0) {
    errorMessage.value = 'El precio unitario no puede ser negativo.'
    return
  }

  saving.value = true

  try {
    await transactionService.recordTransaction({
      portfolio_id: props.portfolioId,
      asset_id: assetId.value,
      transaction_type: txType.value,
      quantity: quantity.value,
      unit_price: unitPrice.value,
      fees: fees.value || 0,
      transaction_date: transactionDate.value,
      notes: notes.value.trim() || undefined,
    })

    quantity.value = 0
    unitPrice.value = 0
    fees.value = 0
    notes.value = ''

    emit('saved')
    emit('close')
  } catch (error) {
    console.error('Error al registrar operación:', error)
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'No se pudo registrar la operación.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg rounded-xl bg-white shadow-2xl">
      <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">
            Registrar Operación (Compra / Venta)
          </h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Sincroniza automáticamente tus posiciones, costo promedio y P&L realizado.
          </p>
        </div>

        <button
          type="button"
          class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <form class="space-y-4 p-6" @submit.prevent="handleSubmit">
        <!-- Tipo -->
        <div class="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
          <button
            type="button"
            class="rounded-md py-2 transition"
            :class="txType === 'BUY' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600'"
            @click="txType = 'BUY'"
          >
            Compra (BUY)
          </button>
          <button
            type="button"
            class="rounded-md py-2 transition"
            :class="txType === 'SELL' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'"
            @click="txType = 'SELL'"
          >
            Venta (SELL)
          </button>
        </div>

        <!-- Activo -->
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-700">
            Activo ({{ currency }})
          </label>
          <select
            v-model="assetId"
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600"
          >
            <option value="" disabled>Selecciona un activo...</option>
            <option
              v-for="asset in compatibleAssets"
              :key="asset.id"
              :value="asset.id"
            >
              {{ asset.ticker }} — {{ asset.name }}
            </option>
          </select>
        </div>

        <!-- Cantidad y Precio -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-700">
              Cantidad nominal
            </label>
            <input
              v-model.number="quantity"
              type="number"
              min="0"
              step="any"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-700">
              Precio unitario ({{ currency }})
            </label>
            <input
              v-model.number="unitPrice"
              type="number"
              min="0"
              step="0.0001"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </div>
        </div>

        <!-- Fecha y Comisión -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-700">
              Fecha de operación
            </label>
            <input
              v-model="transactionDate"
              type="date"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-medium text-slate-700">
              Comisión / Fee ({{ currency }})
            </label>
            <input
              v-model.number="fees"
              type="number"
              min="0"
              step="0.01"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </div>
        </div>

        <!-- Notas -->
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-700">
            Notas (opcional)
          </label>
          <input
            v-model="notes"
            type="text"
            placeholder="Ej. Aporte mensual o toma de ganancias"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
          />
        </div>

        <!-- Total calculado -->
        <div class="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5 text-xs">
          <span class="text-slate-500">Monto total de la operación:</span>
          <span class="font-mono text-sm font-bold text-slate-900">
            {{ currency }} {{ totalAmount.toFixed(2) }}
          </span>
        </div>

        <div
          v-if="errorMessage"
          class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {{ errorMessage }}
        </div>

        <div class="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            :disabled="saving"
            class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            @click="emit('close')"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="saving"
            class="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {{ saving ? 'Guardando...' : 'Registrar operación' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
