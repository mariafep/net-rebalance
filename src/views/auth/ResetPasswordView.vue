<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'
import { authService } from '../../services/auth.service'

const router = useRouter()
const { user, updatePassword, clearRecoveryMode } = useAuth()

const newPassword = ref('')
const confirmPassword = ref('')

const checkingSession = ref(true)
const hasValidSession = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(async () => {
  try {
    const session = await authService.getSession()
    hasValidSession.value = Boolean(session || user.value)
  } catch (error) {
    console.error('Error verificando sesión de recuperación:', error)
    hasValidSession.value = false
  } finally {
    checkingSession.value = false
  }
})

async function handleResetPassword() {
  errorMessage.value = ''
  successMessage.value = ''

  if (!newPassword.value || newPassword.value.length < 6) {
    errorMessage.value = 'La nueva contraseña debe tener al menos 6 caracteres.'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'Las contraseñas no coinciden.'
    return
  }

  saving.value = true

  try {
    await updatePassword(newPassword.value)
    successMessage.value =
      'Contraseña actualizada correctamente. Redirigiendo al dashboard...'

    setTimeout(() => {
      router.push('/dashboard')
    }, 1500)
  } catch (error) {
    console.error('Error al actualizar contraseña:', error)
    errorMessage.value =
      'No pudimos actualizar tu contraseña. El enlace puede haber expirado; solicita uno nuevo.'
  } finally {
    saving.value = false
  }
}

function goToLogin() {
  clearRecoveryMode()
  router.push('/login')
}
</script>

<template>
  <main
    class="flex min-h-screen items-center justify-center bg-slate-50 px-6"
  >
    <section class="w-full max-w-md">
      <!-- Logo / nombre -->
      <div class="mb-8 text-center">
        <div class="flex items-center justify-center gap-3">
          <div class="flex h-10 w-10 items-end justify-center gap-1 rounded-lg bg-teal-50 p-2">
            <span class="h-3 w-1.5 rounded-sm bg-teal-400"></span>
            <span class="h-5 w-1.5 rounded-sm bg-teal-500"></span>
            <span class="h-7 w-1.5 rounded-sm bg-teal-600"></span>
          </div>

          <h1 class="text-3xl font-bold tracking-tight text-slate-900">
            Net<span class="text-teal-600">Rebalance</span>
          </h1>
        </div>

        <p class="mt-3 text-sm text-slate-500">
          Restablecimiento de contraseña
        </p>
      </div>

      <!-- Tarjeta -->
      <div class="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div v-if="checkingSession" class="py-6 text-center text-sm text-slate-500">
          Verificando enlace de recuperación...
        </div>

        <div v-else-if="!hasValidSession" class="space-y-4 text-center">
          <h2 class="text-lg font-semibold text-slate-900">
            Enlace inválido o expirado
          </h2>
          <p class="text-sm text-slate-500">
            No encontramos una sesión de recuperación activa. Solicita un nuevo enlace desde el inicio de sesión.
          </p>
          <button
            type="button"
            class="mt-2 w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700"
            @click="goToLogin"
          >
            Ir a iniciar sesión
          </button>
        </div>

        <template v-else>
          <div class="mb-6">
            <h2 class="text-xl font-semibold text-slate-900">
              Nueva contraseña
            </h2>

            <p class="mt-1 text-sm text-slate-500">
              Ingresa y confirma tu nueva contraseña para acceder a tu cuenta.
            </p>
          </div>

          <form class="space-y-5" @submit.prevent="handleResetPassword">
            <div>
              <label
                for="newPassword"
                class="mb-2 block text-sm font-medium text-slate-700"
              >
                Nueva contraseña
              </label>

              <input
                id="newPassword"
                v-model="newPassword"
                type="password"
                autocomplete="new-password"
                placeholder="Mínimo 6 caracteres"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div>
              <label
                for="confirmPassword"
                class="mb-2 block text-sm font-medium text-slate-700"
              >
                Confirmar contraseña
              </label>

              <input
                id="confirmPassword"
                v-model="confirmPassword"
                type="password"
                autocomplete="new-password"
                placeholder="Repite tu nueva contraseña"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </div>

            <div
              v-if="errorMessage"
              class="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {{ errorMessage }}
            </div>

            <div
              v-if="successMessage"
              class="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700"
            >
              {{ successMessage }}
            </div>

            <button
              type="submit"
              :disabled="saving || Boolean(successMessage)"
              class="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {{ saving ? 'Actualizando...' : 'Actualizar contraseña' }}
            </button>
          </form>
        </template>
      </div>
    </section>
  </main>
</template>
