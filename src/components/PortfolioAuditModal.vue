<script setup lang="ts">
import type {
  AuditCategory,
  AuditRiskAlignment,
  AuditSeverity,
  PortfolioAuditResult,
} from '../services/audit.service'

const props = defineProps<{
  show: boolean
  portfolioName: string
  currency: string
  loading: boolean
  error: string
  result: PortfolioAuditResult | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'rerun'): void
}>()

function getRiskAlignmentBadge(alignment: AuditRiskAlignment) {
  if (alignment === 'aligned') {
    return {
      label: 'Alineado',
      class: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    }
  }
  if (alignment === 'moderate_mismatch') {
    return {
      label: 'Desajuste moderado',
      class: 'border-amber-200 bg-amber-50 text-amber-700',
    }
  }
  return {
    label: 'Desajuste alto',
    class: 'border-red-200 bg-red-50 text-red-700',
  }
}

function getScoreBadgeClass(score: number) {
  if (score >= 80) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-red-200 bg-red-50 text-red-700'
}

function getCategoryLabel(category: AuditCategory) {
  const map: Record<AuditCategory, string> = {
    overlap: 'Solapamiento',
    concentration: 'Concentración',
    risk_mismatch: 'Perfil de riesgo',
    diversification: 'Diversificación',
    trend: 'Tendencia',
  }
  return map[category] ?? category
}

function getSeverityStyle(severity: AuditSeverity) {
  if (severity === 'low') {
    return {
      label: 'Baja',
      cardClass: 'border-blue-200 bg-blue-50/40',
      badgeClass: 'bg-blue-100 text-blue-800',
    }
  }
  if (severity === 'medium') {
    return {
      label: 'Media',
      cardClass: 'border-amber-200 bg-amber-50/40',
      badgeClass: 'bg-amber-100 text-amber-800',
    }
  }
  return {
    label: 'Alta',
    cardClass: 'border-red-200 bg-red-50/40',
    badgeClass: 'bg-red-100 text-red-800',
  }
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <!-- Header -->
      <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">
            Auditoría IA — {{ portfolioName }}
          </h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Evaluación contextual Core & Satellite, concentración, perfil de riesgo y tendencias 30d.
          </p>
        </div>

        <button
          type="button"
          class="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          @click="emit('close')"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6">
        <!-- Estado de carga -->
        <div
          v-if="loading"
          class="flex flex-col items-center justify-center py-14 text-center"
        >
          <svg class="h-9 w-9 animate-spin text-teal-600" viewBox="0 0 24 24" fill="none">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p class="mt-4 text-sm font-semibold text-slate-800">
            Auditando portafolio con Inteligencia Artificial...
          </p>
          <p class="mt-1 text-xs text-slate-500">
            Analizando solapamientos de ETFs, concentración de riesgo y variaciones de los últimos 30 días.
          </p>
        </div>

        <!-- Error -->
        <div
          v-else-if="error"
          class="rounded-xl border border-red-200 bg-red-50 p-5"
        >
          <p class="text-sm font-semibold text-red-800">
            No pudimos completar la auditoría
          </p>
          <p class="mt-1 text-xs text-red-700">
            {{ error }}
          </p>
          <div class="mt-4 flex gap-3">
            <button
              type="button"
              class="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              @click="emit('rerun')"
            >
              Reintentar auditoría
            </button>
            <button
              type="button"
              class="rounded-lg border border-red-300 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
              @click="emit('close')"
            >
              Cerrar
            </button>
          </div>
        </div>

        <!-- Resultado de Auditoría -->
        <div v-else-if="result" class="space-y-6">
          <!-- Encabezado de salud -->
          <div class="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex items-center gap-4">
              <div
                class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border-2 font-mono"
                :class="getScoreBadgeClass(result.overall_score)"
              >
                <span class="text-xl font-bold leading-none">{{ result.overall_score }}</span>
                <span class="mt-0.5 text-[10px] font-semibold opacity-75">/ 100</span>
              </div>

              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Salud del portafolio
                </p>
                <div class="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-full border px-3 py-0.5 text-xs font-semibold"
                    :class="getRiskAlignmentBadge(result.risk_alignment).class"
                  >
                    {{ getRiskAlignmentBadge(result.risk_alignment).label }}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              @click="emit('rerun')"
            >
              ↻ Volver a auditar
            </button>
          </div>

          <!-- Resumen ejecutivo -->
          <div class="rounded-xl border border-teal-100 bg-teal-50/40 p-4">
            <p class="text-xs font-bold uppercase tracking-wider text-teal-700">
              Resumen ejecutivo
            </p>
            <p class="mt-1.5 text-sm leading-6 text-slate-700">
              {{ result.summary }}
            </p>
          </div>

          <!-- Tendencias 30d -->
          <div v-if="result.trends_30d && result.trends_30d.length > 0">
            <h3 class="mb-2.5 text-sm font-semibold text-slate-900">
              Tendencia de mercado reciente (30 días)
            </h3>

            <div class="flex flex-wrap gap-2.5">
              <div
                v-for="t in result.trends_30d"
                :key="t.asset_id"
                class="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
              >
                <span class="font-bold text-slate-900">{{ t.ticker }}</span>
                <span
                  v-if="t.change_pct !== null"
                  class="rounded px-1.5 py-0.5 font-mono font-semibold"
                  :class="
                    t.change_pct > 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : t.change_pct < 0
                        ? 'bg-red-50 text-red-700'
                        : 'bg-slate-100 text-slate-600'
                  "
                >
                  {{ t.change_pct > 0 ? '+' : '' }}{{ Number(t.change_pct).toFixed(2) }}%
                </span>
                <span
                  v-else
                  class="text-[11px] italic text-slate-400"
                >
                  Sin historial suficiente
                </span>
                <span
                  v-if="t.latest_price !== null"
                  class="font-mono text-[11px] text-slate-400"
                >
                  ({{ props.currency }} {{ Number(t.latest_price).toFixed(2) }})
                </span>
              </div>
            </div>
          </div>

          <!-- Hallazgos -->
          <div>
            <h3 class="mb-3 text-sm font-semibold text-slate-900">
              Hallazgos detectados ({{ result.findings.length }})
            </h3>

            <div
              v-if="result.findings.length === 0"
              class="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500"
            >
              No se detectaron alertas ni hallazgos críticos en esta cartera.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="(finding, idx) in result.findings"
                :key="idx"
                class="rounded-xl border p-4"
                :class="getSeverityStyle(finding.severity).cardClass"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-sm font-semibold text-slate-900">
                    {{ finding.title }}
                  </span>

                  <div class="flex items-center gap-1.5">
                    <span class="rounded bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-2xs">
                      {{ getCategoryLabel(finding.category) }}
                    </span>
                    <span
                      class="rounded px-2 py-0.5 text-[11px] font-semibold"
                      :class="getSeverityStyle(finding.severity).badgeClass"
                    >
                      Severidad {{ getSeverityStyle(finding.severity).label }}
                    </span>
                  </div>
                </div>

                <p class="mt-1.5 text-xs leading-5 text-slate-700">
                  {{ finding.detail }}
                </p>
              </div>
            </div>
          </div>

          <!-- Recomendaciones accionables -->
          <div v-if="result.recommendations && result.recommendations.length > 0">
            <h3 class="mb-2.5 text-sm font-semibold text-slate-900">
              Recomendaciones accionables
            </h3>
            <ul class="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
              <li
                v-for="(rec, idx) in result.recommendations"
                :key="idx"
                class="flex items-start gap-2 text-xs leading-5 text-slate-700"
              >
                <span class="mt-0.5 font-bold text-teal-600">•</span>
                <span>{{ rec }}</span>
              </li>
            </ul>
          </div>

          <!-- Disclaimer legal -->
          <div class="border-t border-slate-200 pt-4 text-[11px] text-slate-400">
            {{ result.disclaimer }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
