<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { alertService } from '../services/alert.service'
import { portfolioService } from '../services/portfolio.service'
import type { Portfolio } from '../types/portfolio'
import type {
  AlertStatus,
  RebalanceActionItem,
  RebalanceAlert,
} from '../types/rebalance'

const alerts = ref<RebalanceAlert[]>([])
const portfolios = ref<Portfolio[]>([])

const loading = ref(true)
const errorMessage = ref('')
const statusFilter = ref<'all' | AlertStatus>('all')
const expandedAlertIds = ref<Record<string, boolean>>({})
const updatingAlertId = ref<string | null>(null)

const filteredAlerts = computed(() => {
  if (statusFilter.value === 'all') {
    return alerts.value
  }
  return alerts.value.filter((a) => a.status === statusFilter.value)
})

const countsByStatus = computed(() => ({
  all: alerts.value.length,
  pending: alerts.value.filter((a) => a.status === 'pending').length,
  executed: alerts.value.filter((a) => a.status === 'executed').length,
  dismissed: alerts.value.filter((a) => a.status === 'dismissed').length,
}))

function getPortfolio(portfolioId: string) {
  return portfolios.value.find((p) => p.id === portfolioId)
}

function toggleActions(alertId: string) {
  expandedAlertIds.value[alertId] = !expandedAlertIds.value[alertId]
}

function getStatusBadge(status: AlertStatus) {
  if (status === 'pending') {
    return {
      label: 'Pendiente',
      class: 'bg-amber-50 text-amber-700 border-amber-200',
    }
  }
  if (status === 'executed') {
    return {
      label: 'Ejecutada',
      class: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
  }
  return {
    label: 'Descartada',
    class: 'bg-slate-100 text-slate-600 border-slate-200',
  }
}

function getTriggerLabel(reason: string) {
  if (reason === 'rule_5_25') return 'Regla 5/25'
  if (reason === 'manual') return 'Evaluación Manual'
  return reason
}

function getActionBadge(action: RebalanceActionItem['action']) {
  if (action === 'BUY') {
    return { label: 'Comprar', class: 'bg-emerald-50 text-emerald-700' }
  }
  if (action === 'SELL') {
    return { label: 'Vender', class: 'bg-amber-50 text-amber-700' }
  }
  return { label: 'Mantener', class: 'bg-slate-100 text-slate-600' }
}

function formatDateTime(dateStr: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

function formatMoney(value: number | null | undefined) {
  return Number(value ?? 0).toFixed(2)
}

async function handleUpdateStatus(alert: RebalanceAlert, newStatus: AlertStatus) {
  if (updatingAlertId.value) return
  updatingAlertId.value = alert.id
  errorMessage.value = ''

  try {
    const updated = await alertService.updateAlertStatus(alert.id, newStatus)
    const idx = alerts.value.findIndex((item) => item.id === updated.id)
    if (idx !== -1) {
      alerts.value[idx] = updated
    }
  } catch (error) {
    console.error('Error al actualizar estado de alerta:', error)
    errorMessage.value = 'No pudimos actualizar el estado de la alerta.'
  } finally {
    updatingAlertId.value = null
  }
}

async function loadAlerts() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [alertsData, portfoliosData] = await Promise.all([
      alertService.getAlerts(),
      portfolioService.getPortfolios(),
    ])
    alerts.value = alertsData
    portfolios.value = portfoliosData
  } catch (error) {
    console.error('Error al cargar alertas:', error)
    errorMessage.value = 'No pudimos cargar el historial de alertas.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadAlerts()
})
</script>

<template>
  <section>
    <!-- Encabezado -->
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-slate-900">
          Historial de Alertas
        </h1>

        <p class="mt-1 text-sm text-slate-500">
          Revisa las oportunidades de rebalanceo detectadas automáticamente y su análisis contextual.
        </p>
      </div>

      <!-- Filtro de estado -->
      <div class="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-xs">
        <button
          type="button"
          class="rounded-md px-3 py-1.5 font-medium transition"
          :class="statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
          @click="statusFilter = 'all'"
        >
          Todas ({{ countsByStatus.all }})
        </button>

        <button
          type="button"
          class="rounded-md px-3 py-1.5 font-medium transition"
          :class="statusFilter === 'pending' ? 'bg-white text-amber-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
          @click="statusFilter = 'pending'"
        >
          Pendientes ({{ countsByStatus.pending }})
        </button>

        <button
          type="button"
          class="rounded-md px-3 py-1.5 font-medium transition"
          :class="statusFilter === 'executed' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
          @click="statusFilter = 'executed'"
        >
          Ejecutadas ({{ countsByStatus.executed }})
        </button>

        <button
          type="button"
          class="rounded-md px-3 py-1.5 font-medium transition"
          :class="statusFilter === 'dismissed' ? 'bg-white text-slate-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'"
          @click="statusFilter = 'dismissed'"
        >
          Descartadas ({{ countsByStatus.dismissed }})
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="mt-8 rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Cargando historial de alertas...
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
      v-else-if="filteredAlerts.length === 0"
      class="mt-8 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
    >
      <h2 class="font-semibold text-slate-900">
        No hay alertas en esta categoría
      </h2>
      <p class="mt-1 text-sm text-slate-500">
        Las alertas se generan cuando un portafolio activo supera las bandas de la Regla 5/25 con un costo aceptable.
      </p>
      <RouterLink
        to="/portfolios"
        class="mt-4 inline-block text-sm font-semibold text-teal-600 hover:underline"
      >
        Ir a Mis Portafolios →
      </RouterLink>
    </div>

    <!-- Lista de tarjetas de alerta -->
    <div v-else class="mt-8 space-y-5">
      <article
        v-for="alert in filteredAlerts"
        :key="alert.id"
        class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"
      >
        <!-- Cabecera de tarjeta -->
        <div class="flex flex-col gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <RouterLink
                :to="`/portfolios/${alert.portfolio_id}/analysis`"
                class="text-base font-semibold text-slate-900 hover:text-teal-600"
              >
                {{ getPortfolio(alert.portfolio_id)?.name ?? 'Portafolio' }}
              </RouterLink>

              <span
                class="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                :class="getStatusBadge(alert.status).class"
              >
                {{ getStatusBadge(alert.status).label }}
              </span>

              <span class="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {{ getTriggerLabel(alert.trigger_reason) }}
              </span>
            </div>

            <p class="mt-1 text-xs text-slate-400">
              Detectada el {{ formatDateTime(alert.created_at) }}
            </p>
          </div>

          <!-- Botones de acción en estado pendiente -->
          <div v-if="alert.status === 'pending'" class="flex items-center gap-2">
            <button
              type="button"
              :disabled="updatingAlertId === alert.id"
              class="rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:opacity-50"
              @click="handleUpdateStatus(alert, 'executed')"
            >
              ✓ Marcar como ejecutada
            </button>

            <button
              type="button"
              :disabled="updatingAlertId === alert.id"
              class="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              @click="handleUpdateStatus(alert, 'dismissed')"
            >
              Descartar
            </button>
          </div>
        </div>

        <!-- Métricas de la alerta -->
        <div class="grid grid-cols-2 gap-4 bg-slate-50/50 px-6 py-4 sm:grid-cols-4">
          <div>
            <span class="text-xs text-slate-400">Valor del portafolio</span>
            <p class="mt-0.5 font-mono text-sm font-semibold text-slate-900">
              {{ getPortfolio(alert.portfolio_id)?.currency ?? 'USD' }}
              {{ formatMoney(alert.total_portfolio_value) }}
            </p>
          </div>

          <div>
            <span class="text-xs text-slate-400">Desviación máxima</span>
            <p class="mt-0.5 font-mono text-sm font-semibold text-amber-700">
              {{ Number(alert.max_deviation).toFixed(2) }} pp
            </p>
          </div>

          <div>
            <span class="text-xs text-slate-400">Costo estimado</span>
            <p class="mt-0.5 font-mono text-sm font-semibold text-slate-900">
              {{ getPortfolio(alert.portfolio_id)?.currency ?? 'USD' }}
              {{ formatMoney(alert.estimated_cost) }}
            </p>
          </div>

          <div>
            <span class="text-xs text-slate-400">Costo relativo</span>
            <p class="mt-0.5 font-mono text-sm font-semibold text-emerald-700">
              {{ (Number(alert.cost_ratio) * 100).toFixed(2) }}%
            </p>
          </div>
        </div>

        <!-- Bloque destacado Análisis IA -->
        <div class="border-t border-slate-100 px-6 py-4">
          <div class="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-teal-700">
                Análisis IA
              </span>
            </div>

            <div
              v-if="alert.ai_summary"
              class="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700"
            >
              {{ alert.ai_summary }}
            </div>

            <p v-else class="mt-1.5 text-xs italic text-slate-500">
              Pendiente de análisis contextual.
            </p>
          </div>

          <!-- Desplegable de acciones recomendadas -->
          <div class="mt-4">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
              @click="toggleActions(alert.id)"
            >
              <span>
                {{ expandedAlertIds[alert.id] ? '▾ Ocultar' : '▸ Ver' }}
                acciones recomendadas ({{ alert.recommended_actions?.length ?? 0 }})
              </span>
            </button>

            <div
              v-if="expandedAlertIds[alert.id]"
              class="mt-3 overflow-x-auto rounded-lg border border-slate-200"
            >
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-600">
                  <tr class="border-b border-slate-200">
                    <th class="px-4 py-2.5 font-semibold">Ticker</th>
                    <th class="px-4 py-2.5 font-semibold">Acción</th>
                    <th class="px-4 py-2.5 font-semibold">Monto</th>
                    <th class="px-4 py-2.5 font-semibold">Peso actual</th>
                    <th class="px-4 py-2.5 font-semibold">Peso objetivo</th>
                    <th class="px-4 py-2.5 font-semibold text-right">Desviación</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  <tr
                    v-for="act in alert.recommended_actions"
                    :key="act.ticker"
                    class="hover:bg-slate-50/60"
                  >
                    <td class="px-4 py-2.5 font-semibold text-slate-900">
                      {{ act.ticker }}
                    </td>
                    <td class="px-4 py-2.5">
                      <span
                        class="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        :class="getActionBadge(act.action).class"
                      >
                        {{ getActionBadge(act.action).label }}
                      </span>
                    </td>
                    <td class="px-4 py-2.5 font-mono text-slate-800">
                      {{ getPortfolio(alert.portfolio_id)?.currency ?? 'USD' }}
                      {{ formatMoney(act.amount) }}
                    </td>
                    <td class="px-4 py-2.5 font-mono text-slate-600">
                      {{ Number(act.current_weight).toFixed(2) }}%
                    </td>
                    <td class="px-4 py-2.5 font-mono text-slate-600">
                      {{ Number(act.target_weight).toFixed(2) }}%
                    </td>
                    <td class="px-4 py-2.5 text-right font-mono text-slate-700">
                      {{ act.deviation > 0 ? '+' : '' }}{{ Number(act.deviation).toFixed(2) }} pp
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
