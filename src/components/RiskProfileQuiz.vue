<script setup lang="ts">
import { computed, ref } from 'vue'
import { profileService } from '../services/profile.service'
import type { Profile, RiskProfile } from '../types/profile'

const props = defineProps<{
  userId: string
  show: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', profile: Profile): void
}>()

interface QuizOption {
  label: string
  score: number
  horizonValue?: string
}

interface QuizQuestion {
  id: string
  title: string
  subtitle: string
  options: QuizOption[]
}

const questions: QuizQuestion[] = [
  {
    id: 'horizon',
    title: '1. ¿Cuál es tu horizonte temporal para esta inversión?',
    subtitle: 'Tiempo aproximado antes de necesitar retirar una parte importante del capital.',
    options: [
      { label: 'Corto plazo (1 a 3 años)', score: 1, horizonValue: '1-3 años' },
      { label: 'Mediano plazo (3 a 7 años)', score: 2, horizonValue: '3-7 años' },
      { label: 'Largo plazo (7 a 15 años)', score: 3, horizonValue: '7-15 años' },
      { label: 'Muy largo plazo (+15 años)', score: 4, horizonValue: '+15 años' },
    ],
  },
  {
    id: 'drawdown',
    title: '2. Si tu portafolio cae un 20% en un año de mercado bajista, ¿qué harías?',
    subtitle: 'Evalúa tu reacción emocional y financiera ante la volatilidad.',
    options: [
      { label: 'Vendería todo para evitar mayores pérdidas', score: 1 },
      { label: 'Vendería una parte y esperaría estabilidad', score: 2 },
      { label: 'Mantendría mis posiciones sin hacer cambios', score: 3 },
      { label: 'Aprovecharía para comprar más a menor precio', score: 4 },
    ],
  },
  {
    id: 'experience',
    title: '3. ¿Cuál es tu nivel de experiencia invirtiendo en bolsa (ETFs / acciones)?',
    subtitle: 'Conocimiento previo sobre renta variable y rebalanceo.',
    options: [
      { label: 'Principiante: recién estoy empezando', score: 1 },
      { label: 'Básico: conozco ETFs o depósitos a plazo', score: 2 },
      { label: 'Intermedio: opero acciones y ETFs periódicamente', score: 3 },
      { label: 'Avanzado: gestiono carteras diversificadas activamente', score: 4 },
    ],
  },
  {
    id: 'objective',
    title: '4. ¿Cuál es el objetivo principal de tu portafolio?',
    subtitle: 'Balance deseado entre seguridad y crecimiento.',
    options: [
      { label: 'Preservar el capital y superar ligeramente la inflación', score: 1 },
      { label: 'Crecimiento moderado con volatilidad controlada', score: 2 },
      { label: 'Crecimiento sólido de patrimonio a mediano/largo plazo', score: 3 },
      { label: 'Maximizar la rentabilidad asumiendo alta volatilidad', score: 4 },
    ],
  },
  {
    id: 'liquidity',
    title: '5. ¿Cuentas con un fondo de emergencia separado de estas inversiones?',
    subtitle: 'Respaldo financiero ante imprevistos sin tocar tu portafolio.',
    options: [
      { label: 'No tengo fondo de emergencia aún', score: 1 },
      { label: 'Cubre entre 1 y 2 meses de gastos', score: 2 },
      { label: 'Cubre entre 3 y 6 meses de gastos', score: 3 },
      { label: 'Sí, cubre más de 6 meses de gastos con ingresos estables', score: 4 },
    ],
  },
]

const answers = ref<Record<string, number>>({})
const saving = ref(false)
const errorMessage = ref('')

const answeredCount = computed(() => Object.keys(answers.value).length)
const isComplete = computed(() => answeredCount.value === questions.length)

const totalScore = computed(() =>
  Object.values(answers.value).reduce((sum, val) => sum + val, 0),
)

const computedProfile = computed<RiskProfile>(() => {
  if (totalScore.value <= 9) return 'conservative'
  if (totalScore.value <= 15) return 'moderate'
  return 'aggressive'
})

const selectedHorizon = computed(() => {
  const score = answers.value.horizon
  const found = questions[0].options.find((opt) => opt.score === score)
  return found?.horizonValue ?? '3-7 años'
})

const profileMeta = computed(() => {
  if (computedProfile.value === 'conservative') {
    return {
      label: 'Conservador',
      allocation: '85% Core / 15% Satellite',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    }
  }
  if (computedProfile.value === 'moderate') {
    return {
      label: 'Moderado',
      allocation: '75% Core / 25% Satellite',
      badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    }
  }
  return {
    label: 'Agresivo',
    allocation: '60% Core / 40% Satellite',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  }
})

async function handleSubmit() {
  if (!isComplete.value || saving.value) return
  errorMessage.value = ''
  saving.value = true

  try {
    const updated = await profileService.updateRiskProfile(props.userId, {
      risk_profile: computedProfile.value,
      investment_horizon: selectedHorizon.value,
      risk_score: totalScore.value,
      profile_completed_at: new Date().toISOString(),
    })

    emit('saved', updated)
    emit('close')
  } catch (error) {
    console.error('Error guardando perfil de riesgo:', error)
    errorMessage.value = 'No pudimos guardar tu perfil de riesgo. Intenta nuevamente.'
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
    <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
      <!-- Header -->
      <div class="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900">
            Perfilador del Inversionista
          </h2>
          <p class="mt-0.5 text-xs text-slate-500">
            Responde 5 preguntas para calcular tu perfil de riesgo y plantilla Core & Satellite sugerida.
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

      <!-- Preguntas -->
      <form class="space-y-6 p-6" @submit.prevent="handleSubmit">
        <div
          v-for="q in questions"
          :key="q.id"
          class="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
        >
          <p class="text-sm font-semibold text-slate-900">
            {{ q.title }}
          </p>
          <p class="mt-0.5 text-xs text-slate-500">
            {{ q.subtitle }}
          </p>

          <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              v-for="opt in q.options"
              :key="opt.score"
              class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs transition"
              :class="
                answers[q.id] === opt.score
                  ? 'border-teal-600 bg-teal-50/70 font-medium text-teal-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              "
            >
              <input
                v-model="answers[q.id]"
                type="radio"
                :name="q.id"
                :value="opt.score"
                class="text-teal-600 focus:ring-teal-500"
              />
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <!-- Vista previa resultado -->
        <div
          v-if="isComplete"
          class="rounded-xl border border-teal-200 bg-teal-50/60 p-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-teal-700">
                Resultado preliminar ({{ totalScore }} / 20 pts)
              </p>
              <p class="mt-1 text-base font-bold text-slate-900">
                Perfil {{ profileMeta.label }}
              </p>
            </div>

            <span
              class="rounded-full border px-3 py-1 text-xs font-semibold"
              :class="profileMeta.badgeClass"
            >
              {{ profileMeta.allocation }}
            </span>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {{ errorMessage }}
        </div>

        <!-- Acciones -->
        <div class="flex items-center justify-between border-t border-slate-200 pt-4">
          <span class="text-xs text-slate-500">
            {{ answeredCount }} de {{ questions.length }} preguntas respondidas
          </span>

          <div class="flex gap-3">
            <button
              type="button"
              :disabled="saving"
              class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              @click="emit('close')"
            >
              Cancelar
            </button>

            <button
              type="submit"
              :disabled="!isComplete || saving"
              class="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {{ saving ? 'Guardando...' : 'Guardar perfil de riesgo' }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
