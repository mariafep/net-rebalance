<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { profileService } from '../services/profile.service'
import RiskProfileQuiz from '../components/RiskProfileQuiz.vue'
import type { Profile } from '../types/profile'

const { user } = useAuth()

const profile = ref<Profile | null>(null)
const fullName = ref('')
const createdAt = ref('')

const loading = ref(true)
const saving = ref(false)
const showQuizModal = ref(false)

const errorMessage = ref('')
const successMessage = ref('')

const riskProfileInfo = computed(() => {
  const rp = profile.value?.risk_profile
  if (rp === 'conservative') {
    return {
      label: 'Conservador',
      allocation: '85% Core / 15% Satellite',
      description: 'Prioriza estabilidad y preservación de capital mediante ETFs amplios de bajo riesgo.',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    }
  }
  if (rp === 'moderate') {
    return {
      label: 'Moderado',
      allocation: '75% Core / 25% Satellite',
      description: 'Equilibrio entre crecimiento indexado a largo plazo y exposición táctica controlada.',
      badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    }
  }
  if (rp === 'aggressive') {
    return {
      label: 'Agresivo',
      allocation: '60% Core / 40% Satellite',
      description: 'Busca maximizar crecimiento a largo plazo tolerando mayor volatilidad en posiciones satélite.',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    }
  }
  return null
})

async function loadProfile() {
  if (!user.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const data = await profileService.getProfile(user.value.id)
    profile.value = data
    fullName.value = data.full_name
    createdAt.value = data.created_at
  } catch (error) {
    console.error('Error al cargar el perfil:', error)
    errorMessage.value = 'No pudimos cargar la información de tu perfil.'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!user.value) return

  errorMessage.value = ''
  successMessage.value = ''

  if (!fullName.value.trim()) {
    errorMessage.value = 'El nombre no puede estar vacío.'
    return
  }

  saving.value = true

  try {
    const updated = await profileService.updateProfile(
      user.value.id,
      fullName.value.trim(),
    )

    profile.value = updated
    fullName.value = updated.full_name
    successMessage.value = 'Perfil actualizado correctamente.'
  } catch (error) {
    console.error('Error al actualizar el perfil:', error)
    errorMessage.value = 'No pudimos actualizar tu perfil.'
  } finally {
    saving.value = false
  }
}

function handleQuizSaved(updatedProfile: Profile) {
  profile.value = updatedProfile
  successMessage.value = 'Perfil del inversionista actualizado correctamente.'
}

function formatDate(date: string | null | undefined) {
  if (!date) {
    return 'No disponible'
  }

  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <section>
    <!-- Encabezado -->
    <div>
      <h1 class="text-2xl font-semibold text-slate-900">
        Mi perfil
      </h1>

      <p class="mt-1 text-sm text-slate-500">
        Consulta y actualiza la información de tu cuenta y tu perfil de riesgo como inversionista.
      </p>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="mt-8 rounded-xl border border-slate-200 bg-white p-6"
    >
      <p class="text-sm text-slate-500">
        Cargando perfil...
      </p>
    </div>

    <template v-else>
      <!-- Mensajes -->
      <div
        v-if="errorMessage"
        class="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
      >
        {{ errorMessage }}
      </div>

      <div
        v-if="successMessage"
        class="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      >
        {{ successMessage }}
      </div>

      <!-- Contenido -->
      <div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Información personal -->
        <div class="rounded-xl border border-slate-200 bg-white p-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="font-semibold text-slate-900">
              Información personal
            </h2>

            <p class="mt-1 text-sm text-slate-500">
              Actualiza la información básica de tu perfil.
            </p>
          </div>

          <form class="mt-5 space-y-5" @submit.prevent="handleSave">
            <div>
              <label
                for="fullName"
                class="mb-2 block text-sm font-medium text-slate-700"
              >
                Nombre completo
              </label>

              <input
                id="fullName"
                v-model="fullName"
                type="text"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div>
              <label
                for="profileEmail"
                class="mb-2 block text-sm font-medium text-slate-700"
              >
                Correo electrónico
              </label>

              <input
                id="profileEmail"
                :value="user?.email ?? ''"
                type="email"
                disabled
                class="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
              />

              <p class="mt-1.5 text-xs text-slate-400">
                El correo de la cuenta no se puede modificar desde aquí.
              </p>
            </div>

            <div class="flex justify-end border-t border-slate-100 pt-5">
              <button
                type="submit"
                :disabled="saving"
                class="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {{ saving ? 'Guardando...' : 'Guardar cambios' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Perfil del Inversionista -->
        <div class="rounded-xl border border-slate-200 bg-white p-6">
          <div class="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 class="font-semibold text-slate-900">
                Perfil del Inversionista
              </h2>

              <p class="mt-1 text-sm text-slate-500">
                Define tus plantillas Core & Satellite sugeridas y contexto para análisis IA.
              </p>
            </div>

            <button
              type="button"
              class="shrink-0 rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-teal-700"
              @click="showQuizModal = true"
            >
              {{ riskProfileInfo ? 'Actualizar cuestionario' : 'Realizar cuestionario' }}
            </button>
          </div>

          <div v-if="riskProfileInfo && profile" class="mt-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Perfil asignado
                </p>
                <p class="mt-1 text-lg font-bold text-slate-900">
                  {{ riskProfileInfo.label }}
                </p>
              </div>

              <span
                class="rounded-full border px-3 py-1 text-xs font-semibold"
                :class="riskProfileInfo.badgeClass"
              >
                {{ riskProfileInfo.allocation }}
              </span>
            </div>

            <p class="text-sm text-slate-600">
              {{ riskProfileInfo.description }}
            </p>

            <div class="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-3">
              <div>
                <span class="block text-slate-400">Horizonte</span>
                <span class="mt-0.5 block font-semibold text-slate-800">
                  {{ profile.investment_horizon ?? 'No definido' }}
                </span>
              </div>
              <div>
                <span class="block text-slate-400">Puntaje</span>
                <span class="mt-0.5 block font-semibold text-slate-800">
                  {{ profile.risk_score ?? 0 }} / 20 pts
                </span>
              </div>
              <div>
                <span class="block text-slate-400">Completado</span>
                <span class="mt-0.5 block font-semibold text-slate-800">
                  {{ formatDate(profile.profile_completed_at) }}
                </span>
              </div>
            </div>
          </div>

          <div v-else class="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
            <p class="text-sm font-medium text-slate-700">
              Aún no has completado tu perfilador de riesgo
            </p>
            <p class="mt-1 text-xs text-slate-500">
              Responde 5 preguntas rápidas para recibir recomendaciones de distribución Core & Satellite personalizadas.
            </p>
            <button
              type="button"
              class="mt-4 rounded-lg border border-teal-600 px-4 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
              @click="showQuizModal = true"
            >
              Comenzar cuestionario (5 preguntas)
            </button>
          </div>
        </div>
      </div>

      <!-- Información de cuenta -->
      <div class="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <div class="border-b border-slate-100 pb-4">
          <h2 class="font-semibold text-slate-900">
            Información de la cuenta
          </h2>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <span class="text-xs text-slate-400">Correo</span>
            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ user?.email ?? 'No disponible' }}
            </p>
          </div>

          <div>
            <span class="text-xs text-slate-400">Fecha de registro</span>
            <p class="mt-1 text-sm font-medium text-slate-800">
              {{ formatDate(createdAt) }}
            </p>
          </div>

          <div>
            <span class="text-xs text-slate-400">Autenticación</span>
            <p class="mt-1">
              <span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                Sesión activa
              </span>
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Modal Cuestionario de Riesgo -->
    <RiskProfileQuiz
      v-if="user"
      :user-id="user.id"
      :show="showQuizModal"
      @close="showQuizModal = false"
      @saved="handleQuizSaved"
    />
  </section>
</template>
