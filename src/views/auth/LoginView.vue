<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../../composables/useAuth'

const router = useRouter()
const { login } = useAuth()

const email = ref('')
const password = ref('')

const loading = ref(false)
const errorMessage = ref('')

async function handleLogin() {
  errorMessage.value = ''

  if (!email.value || !password.value) {
    errorMessage.value = 'Ingresa tu correo y contraseña.'
    return
  }

  loading.value = true

  try {
    await login(email.value, password.value)

    await router.push('/dashboard')
  } catch (error) {
    console.error('Error al iniciar sesión:', error)

    errorMessage.value =
        'No pudimos iniciar sesión. Verifica tu correo y contraseña.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main
      class="min-h-screen bg-slate-50 px-6 flex items-center justify-center"
  >
    <section class="w-full max-w-md">
      <!-- Logo / nombre -->
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
          Monitorea y administra tu portafolio de inversión
        </p>
      </div>

      <!-- Formulario -->
      <div
          class="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div class="mb-6">
          <h2 class="text-xl font-semibold text-slate-900">
            Iniciar sesión
          </h2>

          <p class="mt-1 text-sm text-slate-500">
            Ingresa tus datos para acceder a tu cuenta.
          </p>
        </div>

        <form
            class="space-y-5"
            @submit.prevent="handleLogin"
        >
          <!-- Email -->
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

          <!-- Contraseña -->
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
                autocomplete="current-password"
                placeholder="Ingresa tu contraseña"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <!-- Error -->
          <div
              v-if="errorMessage"
              class="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            {{ errorMessage }}
          </div>

          <!-- Botón -->
          <button
              type="submit"
              :disabled="loading"
              class="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {{ loading ? 'Ingresando...' : 'Iniciar sesión' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-500">
          ¿No tienes una cuenta?
          <RouterLink
              to="/register"
              class="font-medium text-teal-600 hover:text-teal-700"
          >
            Regístrate
          </RouterLink>
        </p>
      </div>
    </section>
  </main>
</template>