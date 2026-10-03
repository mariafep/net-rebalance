<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { profileService } from '../services/profile.service'

const { user } = useAuth()

const fullName = ref('')
const createdAt = ref('')

const loading = ref(true)
const saving = ref(false)

const errorMessage = ref('')
const successMessage = ref('')

async function loadProfile() {
  if (!user.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    const profile = await profileService.getProfile(user.value.id)

    fullName.value = profile.full_name
    createdAt.value = profile.created_at
  } catch (error) {
    console.error('Error al cargar el perfil:', error)

    errorMessage.value =
        'No pudimos cargar la información de tu perfil.'
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
    const profile = await profileService.updateProfile(
        user.value.id,
        fullName.value.trim(),
    )

    fullName.value = profile.full_name
    successMessage.value = 'Perfil actualizado correctamente.'
  } catch (error) {
    console.error('Error al actualizar el perfil:', error)

    errorMessage.value = 'No pudimos actualizar tu perfil.'
  } finally {
    saving.value = false
  }
}

function formatDate(date: string) {
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
        Consulta y actualiza la información de tu cuenta.
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
      <div class="mt-8 grid grid-cols-2 gap-6">
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

          <form
              class="mt-5 space-y-5"
              @submit.prevent="handleSave"
          >
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

        <!-- Información de cuenta -->
        <div class="rounded-xl border border-slate-200 bg-white p-6">
          <div class="border-b border-slate-100 pb-4">
            <h2 class="font-semibold text-slate-900">
              Información de la cuenta
            </h2>

            <p class="mt-1 text-sm text-slate-500">
              Datos generales asociados a tu cuenta.
            </p>
          </div>

          <div class="mt-5 divide-y divide-slate-100">
            <div
                class="flex items-center justify-between gap-6 py-4 first:pt-0"
            >
              <span class="text-sm text-slate-500">
                Correo
              </span>

              <span class="text-right text-sm font-medium text-slate-800">
                {{ user?.email ?? 'No disponible' }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-6 py-4">
              <span class="text-sm text-slate-500">
                Fecha de registro
              </span>

              <span class="text-right text-sm font-medium text-slate-800">
                {{ formatDate(createdAt) }}
              </span>
            </div>

            <div class="flex items-center justify-between gap-6 py-4">
              <span class="text-sm text-slate-500">
                Autenticación
              </span>

              <span
                  class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
              >
                Sesión activa
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>