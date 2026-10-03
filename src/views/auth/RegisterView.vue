<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { register } = useAuth()

const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')

const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function handleRegister() {
  errorMessage.value = ''
  successMessage.value = ''

  if (
      !fullName.value ||
      !email.value ||
      !password.value ||
      !confirmPassword.value
  ) {
    errorMessage.value = 'Completa todos los campos.'
    return
  }

  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Las contraseñas no coinciden.'
    return
  }

  if (password.value.length < 6) {
    errorMessage.value = 'La contraseña debe tener al menos 6 caracteres.'
    return
  }

  loading.value = true

  try {
    const data = await register(
        fullName.value.trim(),
        email.value.trim(),
        password.value,
    )

    if (data.session) {
      await router.push('/dashboard')
      return
    }

    successMessage.value =
        'Cuenta creada correctamente. Revisa tu correo para confirmar tu cuenta.'
  } catch (error) {
    console.error('Error al registrar usuario:', error)

    errorMessage.value =
        'No pudimos crear tu cuenta. Revisa los datos e inténtalo nuevamente.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-slate-50 px-6 flex items-center justify-center">
    <section class="w-full max-w-md py-10">

      <div class="mb-8 text-center">
        <div class="flex items-center justify-center gap-3">
          <!-- Isotipo -->
          <div class="flex h-10 w-10 items-end justify-center gap-1 rounded-lg bg-teal-50 p-2">
            <span class="h-3 w-1.5 rounded-sm bg-teal-400"></span>
            <span class="h-5 w-1.5 rounded-sm bg-teal-500"></span>
            <span class="h-7 w-1.5 rounded-sm bg-teal-600"></span>
          </div>

          <!-- Nombre -->
          <h1 class="text-3xl font-bold tracking-tight text-slate-900">
            Net<span class="text-teal-600">Rebalance</span>
          </h1>
        </div>

        <p class="mt-3 text-sm text-slate-500">
          Crea tu cuenta para comenzar a gestionar tu portafolio
        </p>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-slate-900">
            Crear cuenta
          </h2>

          <p class="mt-1 text-sm text-slate-500">
            Completa tus datos para registrarte.
          </p>
        </div>

        <form class="space-y-5" @submit.prevent="handleRegister">

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
                autocomplete="name"
                placeholder="Ingresa tu nombre completo"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div>
            <label
                for="email"
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Correo electrónico
            </label>

            <input
                id="email"
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="correo@ejemplo.com"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div>
            <label
                for="password"
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Contraseña
            </label>

            <input
                id="password"
                v-model="password"
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
                placeholder="Repite tu contraseña"
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
              :disabled="loading"
              class="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ loading ? 'Creando cuenta...' : 'Crear cuenta' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes una cuenta?

          <RouterLink
              to="/login"
              class="font-medium text-teal-600 hover:text-teal-700"
          >
            Inicia sesión
          </RouterLink>
        </p>
      </div>
    </section>
  </main>
</template>