<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PortfolioPerformancePoint } from '../types/transaction'

const props = defineProps<{
  points: PortfolioPerformancePoint[]
  currency: string
}>()

const hoveredIndex = ref<number | null>(null)

const width = 760
const height = 240
const padLeft = 56
const padRight = 18
const padTop = 18
const padBottom = 28

const innerWidth = width - padLeft - padRight
const innerHeight = height - padTop - padBottom

const minMax = computed(() => {
  if (props.points.length === 0) {
    return { min: 0, max: 100 }
  }
  let min = Infinity
  let max = -Infinity
  for (const p of props.points) {
    min = Math.min(min, Number(p.portfolio_value), Number(p.invested_capital))
    max = Math.max(max, Number(p.portfolio_value), Number(p.invested_capital))
  }
  if (min === max) {
    return { min: Math.max(0, min - 10), max: max + 10 }
  }
  const pad = (max - min) * 0.12
  return {
    min: Math.max(0, min - pad),
    max: max + pad,
  }
})

function xPos(index: number) {
  if (props.points.length <= 1) return padLeft + innerWidth / 2
  return padLeft + (index / (props.points.length - 1)) * innerWidth
}

function yPos(val: number) {
  const { min, max } = minMax.value
  const ratio = (val - min) / (max - min || 1)
  return padTop + innerHeight - ratio * innerHeight
}

const valueLinePath = computed(() => {
  if (props.points.length === 0) return ''
  return props.points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xPos(idx).toFixed(1)} ${yPos(Number(p.portfolio_value)).toFixed(1)}`)
    .join(' ')
})

const valueAreaPath = computed(() => {
  if (props.points.length === 0) return ''
  const firstX = xPos(0).toFixed(1)
  const lastX = xPos(props.points.length - 1).toFixed(1)
  const bottomY = (padTop + innerHeight).toFixed(1)
  return `${valueLinePath.value} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`
})

const investedLinePath = computed(() => {
  if (props.points.length === 0) return ''
  return props.points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xPos(idx).toFixed(1)} ${yPos(Number(p.invested_capital)).toFixed(1)}`)
    .join(' ')
})

const yTicks = computed(() => {
  const { min, max } = minMax.value
  return [0, 0.5, 1].map((t) => {
    const val = min + (max - min) * t
    return {
      val,
      y: yPos(val),
      label: val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0),
    }
  })
})

const activePoint = computed(() => {
  if (props.points.length === 0) return null
  const idx = hoveredIndex.value ?? props.points.length - 1
  return props.points[idx] ?? null
})
</script>

<template>
  <div>
    <!-- Sin historial -->
    <div
      v-if="points.length === 0"
      class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500"
    >
      Registra operaciones (compras o ventas) para visualizar la curva de crecimiento de tu cartera en el tiempo.
    </div>

    <div v-else>
      <!-- Leyenda y punto activo -->
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-4">
          <span class="inline-flex items-center gap-1.5 font-medium text-slate-700">
            <span class="h-2.5 w-2.5 rounded-full bg-teal-600" />
            Valor de Cartera
          </span>
          <span class="inline-flex items-center gap-1.5 font-medium text-slate-500">
            <span class="h-0.5 w-4 border-t-2 border-dashed border-slate-400" />
            Capital Invertido
          </span>
        </div>

        <div v-if="activePoint" class="flex flex-wrap items-center gap-3 font-mono text-xs">
          <span class="text-slate-400">{{ activePoint.date }}</span>
          <span class="font-semibold text-slate-900">
            Valor: {{ currency }} {{ Number(activePoint.portfolio_value).toFixed(2) }}
          </span>
          <span class="text-slate-500">
            Invertido: {{ currency }} {{ Number(activePoint.invested_capital).toFixed(2) }}
          </span>
          <span
            class="rounded px-1.5 py-0.5 font-semibold"
            :class="
              Number(activePoint.roi_pct) >= 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            "
          >
            {{ Number(activePoint.roi_pct) >= 0 ? '+' : '' }}{{ Number(activePoint.roi_pct).toFixed(2) }}% ROI
          </span>
        </div>
      </div>

      <!-- SVG Chart -->
      <div class="w-full overflow-x-auto">
        <svg
          :viewBox="`0 0 ${width} ${height}`"
          class="h-60 w-full min-w-[520px] select-none"
          @mouseleave="hoveredIndex = null"
        >
          <defs>
            <linearGradient id="portfolioAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#0d9488" stop-opacity="0.22" />
              <stop offset="100%" stop-color="#0d9488" stop-opacity="0.01" />
            </linearGradient>
          </defs>

          <!-- Grid horizontal -->
          <g v-for="tick in yTicks" :key="tick.label">
            <line
              :x1="padLeft"
              :x2="width - padRight"
              :y1="tick.y"
              :y2="tick.y"
              stroke="#e2e8f0"
              stroke-dasharray="3 3"
            />
            <text
              :x="padLeft - 8"
              :y="tick.y + 4"
              text-anchor="end"
              class="fill-slate-400 text-[10px] font-mono"
            >
              {{ tick.label }}
            </text>
          </g>

          <!-- Área y curva de Valor -->
          <path :d="valueAreaPath" fill="url(#portfolioAreaGrad)" />
          <path
            :d="investedLinePath"
            fill="none"
            stroke="#94a3b8"
            stroke-width="2"
            stroke-dasharray="5 4"
          />
          <path
            :d="valueLinePath"
            fill="none"
            stroke="#0d9488"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- Línea guía vertical hover -->
          <line
            v-if="hoveredIndex !== null"
            :x1="xPos(hoveredIndex)"
            :x2="xPos(hoveredIndex)"
            :y1="padTop"
            :y2="padTop + innerHeight"
            stroke="#cbd5e1"
            stroke-width="1"
          />

          <!-- Puntos interactivos invisibles para hover -->
          <g v-for="(pt, idx) in points" :key="pt.date">
            <circle
              v-if="hoveredIndex === idx"
              :cx="xPos(idx)"
              :cy="yPos(Number(pt.portfolio_value))"
              r="4.5"
              fill="#0d9488"
              stroke="#ffffff"
              stroke-width="2"
            />
            <rect
              :x="xPos(idx) - (innerWidth / Math.max(points.length, 1)) / 2"
              :y="padTop"
              :width="Math.max(innerWidth / Math.max(points.length, 1), 6)"
              :height="innerHeight"
              fill="transparent"
              class="cursor-crosshair"
              @mouseenter="hoveredIndex = idx"
            />
          </g>

          <!-- Fechas inicio y fin -->
          <text
            :x="padLeft"
            :y="height - 6"
            class="fill-slate-400 text-[10px] font-mono"
          >
            {{ points[0]?.date }}
          </text>
          <text
            :x="width - padRight"
            :y="height - 6"
            text-anchor="end"
            class="fill-slate-400 text-[10px] font-mono"
          >
            {{ points[points.length - 1]?.date }}
          </text>
        </svg>
      </div>
    </div>
  </div>
</template>
