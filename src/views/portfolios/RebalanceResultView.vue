<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { portfolioService } from '../../services/portfolio.service'
import { brokerService } from '../../services/broker.service'
import { assetService } from '../../services/asset.service'
import { rebalanceService } from '../../services/rebalance.service'

import type { Portfolio } from '../../types/portfolio'
import type { Broker } from '../../types/broker'
import type { Asset } from '../../types/asset'
import type {
  RebalanceActionItem,
  RebalanceEvaluation,
  RebalanceMode,
} from '../../types/rebalance'

const route = useRoute()

const portfolio = ref<Portfolio | null>(null)
const broker = ref<Broker | null>(null)
const assets = ref<Asset[]>([])

const evaluation = ref<RebalanceEvaluation | null>(null)
const traditionalEvaluation = ref<RebalanceEvaluation | null>(null)

const selectedMode = ref<RebalanceMode>('traditional')
const cashInjectionInput = ref<number>(500)

const loading = ref(true)
const calculating = ref(false)
const errorMessage = ref('')
const evaluationError = ref('')

const portfolioId = computed(() => String(route.params.id))

const isPortfolioActive = computed(
  () => portfolio.value?.status === 'active',
)

const isCashFlowMode = computed(
  () => selectedMode.value === 'cash_flow',
)

const feeSavingsVsTraditional = computed(() => {
  if (
    !isCashFlowMode.value ||
    !evaluation.value ||
    !traditionalEvaluation.value
  ) {
    return null
  }
  return (
    traditionalEvaluation.value.estimated_cost - evaluation.value.estimated_cost
  )
})

function getAsset(assetId: string) {
  return assets.value.find((asset) => asset.id === assetId)
}

function getActionBadge(action: RebalanceActionItem['action']) {
  if (action === 'BUY') {
    return {
      label: 'Comprar',
      class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
  }
  if (action === 'SELL') {
    return {
      label: 'Vender',
      class: 'bg-amber-50 text-amber-700 border-amber-200',
    }
  }
  return {
    label: 'Mantener',
    class: 'bg-slate-100 text-slate-600 border-slate-200',
  }
}

function triggersAbsolute5(item: RebalanceActionItem): boolean {
  return Math.abs(item.deviation) >= 5
}

function triggersRelative25(item: RebalanceActionItem): boolean {
  if (item.target_weight <= 0) return false
  return Math.abs(item.deviation) / item.target_weight >= 0.25
}

function formatMoney(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2)
}

function formatRateAsPercent(value: number | null | undefined) {
  return (Number(value ?? 0) * 100).toFixed(2)
}

async function runEvaluation() {
  if (!portfolio.value || !isPortfolioActive.value) {
    evaluation.value = null
    return
  }

  evaluationError.value = ''
  calculating.value = true

  try {
    const injection = isCashFlowMode.value
      ? Math.max(0, Number(cashInjectionInput.value || 0))
      : 0

    if (isCashFlowMode.value && injection <= 0) {
      evaluationError.value =
        'Ingresa un monto de aporte mayor a 0 para calcular el rebalanceo por flujo de caja.'
      calculating.value = false
      return
    }

    const result = await rebalanceService.evaluatePortfolioRebalance(
      portfolioId.value,
      injection,
    )
    evaluation.value = result

    // Si estamos en modo tradicional, guardamos la referencia base para comparar ahorro
    if (!isCashFlowMode.value) {
      traditionalEvaluation.value = result
    } else if (!traditionalEvaluation.value) {
      traditionalEvaluation.value =
        await rebalanceService.evaluatePortfolioRebalance(portfolioId.value, 0)
    }
  } catch (error) {
    console.error('Error al evaluar rebalanceo vía RPC:', error)
    const errMsg =
      error instanceof Error
        ? error.message
        : 'No se pudo ejecutar la evaluación en el motor centralizado.'
    evaluationError.value = errMsg
    evaluation.value = null
  } finally {
    calculating.value = false
  }
}

function switchMode(mode: RebalanceMode) {
  if (selectedMode.value === mode) return
  selectedMode.value = mode
  runEvaluation()
}

async function loadAnalysis() {
  loading.value = true
  errorMessage.value = ''
  evaluationError.value = ''

  try {
    const [portfolioData, brokerData, assetData] = await Promise.all([
      portfolioService.getPortfolioById(portfolioId.value),
      brokerService.getBrokers(),
      assetService.getAssets(),
    ])

    portfolio.value = portfolioData
    broker.value =
      brokerData.find((item) => item.id === portfolioData.broker_id) ?? null
    assets.value = assetData

    if (portfolioData.status === 'active') {
      await runEvaluation()
    }
  } catch (error) {
    console.error('Error al cargar análisis:', error)
    errorMessage.value = 'No pudimos cargar el análisis del portafolio.'
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

      <span class="text-slate-700">Análisis</span>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Consultando motor centralizado de rebalanceo...
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
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-slate-900">
            {{ portfolio.name }}
          </h1>

          <p class="mt-1 text-sm text-slate-500">
            Evaluación centralizada con Regla 5/25, costos del broker y soporte de flujo de caja.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <RouterLink
            to="/alerts"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Historial de alertas
          </RouterLink>

          <RouterLink
            :to="`/portfolios/${portfolio.id}/config`"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Ver configuración
          </RouterLink>
        </div>
      </div>

      <!-- Portafolio no activo -->
      <div
        v-if="!isPortfolioActive"
        class="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6"
      >
        <h2 class="font-semibold text-amber-800">
          Portafolio en configuración
        </h2>

        <p class="mt-2 text-sm text-amber-700">
          Debes activar el portafolio con pesos que sumen 100% antes de consultar el motor de rebalanceo.
        </p>

        <RouterLink
          :to="`/portfolios/${portfolio.id}/config`"
          class="mt-4 inline-block text-sm font-semibold text-amber-800 underline"
        >
          Ir a configuración
        </RouterLink>
      </div>

      <template v-else>
        <!-- Selector de Modo y Flujo de Caja -->
        <div class="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Modalidad del motor de rebalanceo
              </p>

              <div class="mt-2 inline-flex flex-wrap gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  class="rounded-md px-4 py-2 text-sm font-medium transition"
                  :class="
                    !isCashFlowMode
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  "
                  @click="switchMode('traditional')"
                >
                  Rebalanceo Tradicional (Comprar/Vender)
                </button>

                <button
                  type="button"
                  class="rounded-md px-4 py-2 text-sm font-medium transition"
                  :class="
                    isCashFlowMode
                      ? 'bg-white text-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  "
                  @click="switchMode('cash_flow')"
                >
                  Rebalanceo por Flujo de Caja (Solo Compras)
                </button>
              </div>
            </div>

            <!-- Input de aporte en modo Flujo de Caja -->
            <div
              v-if="isCashFlowMode"
              class="flex flex-wrap items-end gap-3"
            >
              <div>
                <label
                  for="cashInjection"
                  class="mb-1.5 block text-xs font-medium text-slate-600"
                >
                  Monto de aporte nuevo ({{ portfolio.currency }})
                </label>

                <div class="relative">
                  <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    {{ portfolio.currency }}
                  </span>

                  <input
                    id="cashInjection"
                    v-model.number="cashInjectionInput"
                    type="number"
                    min="1"
                    step="10"
                    class="w-44 rounded-lg border border-slate-300 py-2 pl-12 pr-3 text-sm font-medium text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    @keyup.enter="runEvaluation"
                  />
                </div>
              </div>

              <button
                type="button"
                :disabled="calculating"
                class="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
                @click="runEvaluation"
              >
                {{ calculating ? 'Calculando...' : 'Recalcular aporte' }}
              </button>
            </div>
          </div>

          <!-- Comparativa de ahorro de comisiones en Flujo de Caja -->
          <div
            v-if="isCashFlowMode && feeSavingsVsTraditional !== null && evaluation"
            class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm"
          >
            <div class="text-emerald-900">
              <span class="font-semibold">Ahorro estimado frente al modo tradicional:</span>
              al evitar órdenes de venta, tu portafolio se acerca al objetivo sin generar fricción innecesaria.
            </div>

            <span class="rounded-md bg-white px-3 py-1 font-mono text-sm font-bold text-emerald-700 shadow-2xs">
              {{
                feeSavingsVsTraditional >= 0
                  ? `Ahorras ${portfolio.currency} ${formatMoney(feeSavingsVsTraditional)}`
                  : `Diferencia: ${portfolio.currency} ${formatMoney(Math.abs(feeSavingsVsTraditional))}`
              }}
            </span>
          </div>
        </div>

        <!-- Error en evaluación RPC -->
        <div
          v-if="evaluationError"
          class="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
        >
          {{ evaluationError }}
        </div>

        <!-- Resultado del Motor -->
        <template v-else-if="evaluation">
          <!-- Banner de estado principal / Alerta / Cooldown -->
          <div
            class="mt-6 rounded-xl border p-5"
            :class="
              evaluation.should_notify
                ? 'border-emerald-200 bg-emerald-50'
                : evaluation.has_significant_deviation && evaluation.in_cooldown
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-slate-200 bg-white'
            "
          >
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-start gap-3">
                <div
                  class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  :class="
                    evaluation.should_notify
                      ? 'bg-emerald-600 text-white'
                      : evaluation.has_significant_deviation
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                  "
                >
                  {{ evaluation.should_notify ? '✓' : 'i' }}
                </div>

                <div>
                  <h2 class="font-semibold text-slate-900">
                    {{
                      evaluation.should_notify
                        ? 'Condición de alerta y rebalanceo rentable detectada'
                        : evaluation.in_cooldown && evaluation.has_significant_deviation
                          ? 'Desviación detectada (en ventana de cooldown de 7 días)'
                          : evaluation.has_significant_deviation && !evaluation.cost_acceptable
                            ? 'Desviación detectada, pero el costo supera el 2%'
                            : 'Portafolio dentro de las bandas de tolerancia (Regla 5/25)'
                    }}
                  </h2>

                  <p class="mt-1 text-sm text-slate-600">
                    {{
                      evaluation.should_notify
                        ? 'Cumple con las bandas de la Regla 5/25, el costo es aceptable (<= 2%) y no existe alerta reciente.'
                        : evaluation.in_cooldown
                          ? 'Ya se emitió una alerta para este portafolio en los últimos 7 días; el sistema evita notificaciones repetitivas.'
                          : 'Revisa el detalle de desviaciones y costos estimados en las tarjetas inferiores.'
                    }}
                  </p>
                </div>
              </div>

              <span
                class="shrink-0 self-start rounded-full px-3 py-1 text-xs font-semibold"
                :class="
                  evaluation.should_notify
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-700'
                "
              >
                {{ isCashFlowMode ? 'Modo Solo Compras' : 'Modo Tradicional' }}
              </span>
            </div>
          </div>

          <!-- Métricas resumen -->
          <div class="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Valor del portafolio
              </p>
              <p class="mt-2 font-mono text-2xl font-semibold text-slate-900">
                {{ portfolio.currency }} {{ formatMoney(evaluation.total_value) }}
              </p>
              <p v-if="isCashFlowMode" class="mt-1 text-xs text-teal-600">
                + {{ portfolio.currency }} {{ formatMoney(evaluation.cash_injection) }} de aporte
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Desviación máxima
              </p>
              <p class="mt-2 font-mono text-2xl font-semibold text-slate-900">
                {{ Number(evaluation.max_deviation).toFixed(2) }} pp
              </p>
              <p
                class="mt-1 text-xs font-medium"
                :class="evaluation.has_significant_deviation ? 'text-amber-600' : 'text-emerald-600'"
              >
                {{
                  evaluation.has_significant_deviation
                    ? 'Supera banda Regla 5/25'
                    : 'Dentro de tolerancia 5/25'
                }}
              </p>
            </div>

            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Costo estimado
              </p>
              <p class="mt-2 font-mono text-2xl font-semibold text-slate-900">
                {{ portfolio.currency }} {{ formatMoney(evaluation.estimated_cost) }}
              </p>
              <p class="mt-1 text-xs text-slate-400">
                {{ broker?.name ?? 'Sin broker asignado' }}
              </p>
            </div>

            <!-- Semáforo de Costo Aceptable -->
            <div class="rounded-xl border border-slate-200 bg-white p-5">
              <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                Semáforo de costo (<= 2%)
              </p>
              <div class="mt-2 flex items-center gap-2.5">
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full"
                  :class="
                    evaluation.cost_acceptable ? 'bg-emerald-500' : 'bg-red-500'
                  "
                />
                <p
                  class="font-mono text-2xl font-semibold"
                  :class="
                    evaluation.cost_acceptable ? 'text-emerald-700' : 'text-red-700'
                  "
                >
                  {{ formatRateAsPercent(evaluation.cost_ratio) }}%
                </p>
              </div>
              <p
                class="mt-1 text-xs font-medium"
                :class="
                  evaluation.cost_acceptable ? 'text-emerald-600' : 'text-red-600'
                "
              >
                {{
                  evaluation.cost_acceptable
                    ? 'Costo aceptable (Verde)'
                    : 'Supera el umbral del 2% (Rojo)'
                }}
              </p>
            </div>
          </div>

          <!-- Contenido principal -->
          <div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <!-- Tabla de acciones recomendadas -->
            <div class="lg:col-span-2">
              <div class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div class="border-b border-slate-200 px-6 py-5">
                  <h2 class="font-semibold text-slate-900">
                    Propuesta de operaciones ({{ isCashFlowMode ? 'Solo Compras' : 'Rebalanceo Completo' }})
                  </h2>

                  <p class="mt-1 text-sm text-slate-500">
                    Bandas evaluadas bajo la Regla 5/25 (≥ 5% absoluto o ≥ 25% relativo al peso objetivo).
                  </p>
                </div>

                <div class="overflow-x-auto">
                  <table class="w-full text-left text-sm">
                    <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                      <tr class="border-b border-slate-200">
                        <th class="px-5 py-3.5">Activo</th>
                        <th class="px-5 py-3.5">Peso actual / obj.</th>
                        <th class="px-5 py-3.5">Desviación & Regla 5/25</th>
                        <th class="px-5 py-3.5">Acción</th>
                        <th class="px-5 py-3.5 text-right">Monto</th>
                      </tr>
                    </thead>

                    <tbody class="divide-y divide-slate-100">
                      <tr
                        v-for="item in evaluation.actions"
                        :key="item.asset_id"
                        class="hover:bg-slate-50/70"
                      >
                        <td class="px-5 py-4">
                          <p class="font-semibold text-slate-900">
                            {{ item.ticker }}
                          </p>
                          <p class="mt-0.5 text-xs text-slate-500">
                            {{ getAsset(item.asset_id)?.name ?? '' }}
                          </p>
                        </td>

                        <td class="px-5 py-4 font-mono text-slate-700">
                          <span>{{ Number(item.current_weight).toFixed(2) }}%</span>
                          <span class="mx-1 text-slate-400">/</span>
                          <span class="text-slate-500">{{ Number(item.target_weight).toFixed(2) }}%</span>
                        </td>

                        <td class="px-5 py-4">
                          <div class="flex flex-col gap-1">
                            <span
                              class="font-mono font-medium"
                              :class="
                                item.is_deviated
                                  ? 'text-amber-700'
                                  : 'text-slate-600'
                              "
                            >
                              {{ item.deviation > 0 ? '+' : '' }}{{ Number(item.deviation).toFixed(2) }} pp
                            </span>

                            <div class="flex flex-wrap gap-1">
                              <span
                                v-if="triggersAbsolute5(item)"
                                class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                              >
                                Banda Abs ≥ 5%
                              </span>
                              <span
                                v-if="triggersRelative25(item)"
                                class="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800"
                              >
                                Banda Rel ≥ 25%
                              </span>
                              <span
                                v-if="!item.is_deviated"
                                class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500"
                              >
                                En banda
                              </span>
                            </div>
                          </div>
                        </td>

                        <td class="px-5 py-4">
                          <span
                            class="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                            :class="getActionBadge(item.action).class"
                          >
                            {{ getActionBadge(item.action).label }}
                          </span>
                        </td>

                        <td class="px-5 py-4 text-right font-mono font-semibold text-slate-900">
                          <span v-if="item.amount > 0">
                            {{ portfolio.currency }} {{ formatMoney(item.amount) }}
                          </span>
                          <span v-else class="font-normal text-slate-400">
                            —
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Columna derecha: Criterios y Broker -->
            <div class="space-y-6">
              <!-- Criterios del Motor -->
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <h2 class="font-semibold text-slate-900">
                  Evaluación de Reglas
                </h2>

                <div class="mt-4 space-y-4">
                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-slate-700">
                        Regla 5/25 (Bandas)
                      </p>
                      <p class="mt-0.5 text-xs text-slate-400">
                        ≥ 5% absoluto o ≥ 25% relativo
                      </p>
                    </div>

                    <span
                      class="rounded-full px-2.5 py-1 text-xs font-medium"
                      :class="
                        evaluation.has_significant_deviation
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      "
                    >
                      {{ evaluation.has_significant_deviation ? 'Activa' : 'En banda' }}
                    </span>
                  </div>

                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-slate-700">
                        Costo aceptable
                      </p>
                      <p class="mt-0.5 text-xs text-slate-400">
                        Máximo 2.00% sobre monto operado
                      </p>
                    </div>

                    <span
                      class="rounded-full px-2.5 py-1 text-xs font-medium"
                      :class="
                        evaluation.cost_acceptable
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700'
                      "
                    >
                      {{ evaluation.cost_acceptable ? 'Cumple' : 'Excede' }}
                    </span>
                  </div>

                  <div class="flex items-start justify-between gap-4">
                    <div>
                      <p class="text-sm font-medium text-slate-700">
                        Control de Cooldown
                      </p>
                      <p class="mt-0.5 text-xs text-slate-400">
                        Mínimo 7 días entre alertas
                      </p>
                    </div>

                    <span
                      class="rounded-full px-2.5 py-1 text-xs font-medium"
                      :class="
                        evaluation.in_cooldown
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      "
                    >
                      {{ evaluation.in_cooldown ? 'En cooldown' : 'Disponible' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Tarifas del Broker -->
              <div class="rounded-xl border border-slate-200 bg-white p-5">
                <h2 class="font-semibold text-slate-900">
                  Costos del Broker ({{ broker?.name ?? 'N/A' }})
                </h2>

                <div v-if="broker" class="mt-4 space-y-3 text-sm">
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Comisión fija por orden</span>
                    <span class="font-mono font-semibold text-slate-800">
                      {{ broker.currency }} {{ formatMoney(broker.fixed_commission) }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Comisión porcentual</span>
                    <span class="font-mono font-semibold text-slate-800">
                      {{ formatRateAsPercent(broker.percentage_commission) }}%
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-slate-500">Spread estimado</span>
                    <span class="font-mono font-semibold text-slate-800">
                      {{ formatRateAsPercent(broker.spread_percentage) }}%
                    </span>
                  </div>
                </div>
                <p v-else class="mt-3 text-sm text-slate-500">
                  Sin broker asociado (comisión asumida en 0).
                </p>
              </div>
            </div>
          </div>
        </template>
      </template>
    </template>
  </section>
</template>
