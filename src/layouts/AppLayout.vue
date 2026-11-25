<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { profileService } from '../services/profile.service'

const route = useRoute()
const router = useRouter()

const { user, logout } = useAuth()

const fullName = ref('')
const loggingOut = ref(false)
const mobileMenuOpen = ref(false)

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
  },
)

function isActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}

const initials = computed(() => {
  const name = fullName.value.trim()

  if (!name) {
    return 'U'
  }

  const parts = name.split(/\s+/)

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }

  return (
      parts[0].charAt(0) +
      parts[1].charAt(0)
  ).toUpperCase()
})

async function loadUserProfile() {
  if (!user.value) return

  try {
    const profile = await profileService.getProfile(user.value.id)
    fullName.value = profile.full_name
  } catch (error) {
    console.error('Error al cargar perfil en layout:', error)

    fullName.value =
        user.value.email?.split('@')[0] ?? 'Usuario'
  }
}

async function handleLogout() {
  loggingOut.value = true

  try {
    await logout()
    await router.push('/login')
  } catch (error) {
    console.error('Error al cerrar sesión:', error)
  } finally {
    loggingOut.value = false
  }
}

onMounted(() => {
  loadUserProfile()
})
</script>

<template>
  <div class="min-h-screen overflow-x-hidden bg-slate-50">
    <!-- Backdrop móvil -->
    <div
        v-if="mobileMenuOpen"
        class="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
        @click="mobileMenuOpen = false"
    />

    <!-- SIDEBAR -->
    <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:z-20 lg:translate-x-0"
        :class="mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <!-- Logo -->
      <div class="flex h-16 items-center justify-between border-b border-slate-200 px-6">
        <RouterLink
            to="/dashboard"
            class="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900"
        >
          <div class="flex items-end gap-0.5">
            <span class="h-3 w-1.5 rounded-sm bg-teal-400"></span>
            <span class="h-5 w-1.5 rounded-sm bg-teal-500"></span>
            <span class="h-7 w-1.5 rounded-sm bg-teal-600"></span>
          </div>

          <span>
            Net<span class="text-teal-600">Rebalance</span>
          </span>
        </RouterLink>

        <button
            type="button"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
            aria-label="Cerrar menú"
            @click="mobileMenuOpen = false"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Navegación -->
      <nav class="flex-1 space-y-1 px-3 py-5">
        <!-- Inicio -->
        <RouterLink
            to="/dashboard"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
            :class="
            isActive('/dashboard')
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5.5 10.5V20h13v-9.5" />
            <path d="M9.5 20v-6h5v6" />
          </svg>

          Inicio
        </RouterLink>

        <!-- Portafolios -->
        <RouterLink
            to="/portfolios"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
            :class="
            isActive('/portfolios')
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
            <path d="M3 12h18" />
          </svg>

          Portafolios
        </RouterLink>

        <!-- Brokers -->
        <RouterLink
            to="/brokers"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
            :class="
            isActive('/brokers')
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <path d="M3 10h18" />
            <path d="M5 10v8" />
            <path d="M9.5 10v8" />
            <path d="M14.5 10v8" />
            <path d="M19 10v8" />
            <path d="M3 18h18" />
            <path d="M12 3 3 8h18L12 3Z" />
          </svg>

          Brokers
        </RouterLink>

        <!-- Alertas -->
        <RouterLink
            to="/alerts"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
            :class="
            isActive('/alerts')
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>

          Alertas
        </RouterLink>

        <!-- Perfil -->
        <RouterLink
            to="/profile"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition"
            :class="
            isActive('/profile')
              ? 'bg-teal-50 text-teal-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          "
        >
          <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          </svg>

          Perfil
        </RouterLink>
      </nav>

      <!-- Logout -->
      <div class="border-t border-slate-200 p-3">
        <button
            type="button"
            :disabled="loggingOut"
            class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            @click="handleLogout"
        >
          <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
          </svg>

          {{ loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión' }}
        </button>
      </div>
    </aside>

    <!-- CONTENIDO -->
    <div class="min-w-0 lg:pl-64">
      <!-- Header -->
      <header
          class="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8"
      >
        <!-- Lado izquierdo -->
        <div class="flex min-w-0 items-center gap-3">
          <button
              type="button"
              class="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 lg:hidden"
              aria-label="Abrir menú"
              @click="mobileMenuOpen = true"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <p class="truncate text-sm font-medium text-slate-600">
            Gestión de portafolio
          </p>
        </div>

        <!-- Usuario -->
        <RouterLink
            to="/profile"
            class="flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-slate-50 sm:gap-3"
        >
          <!-- Avatar -->
          <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700"
          >
            {{ initials }}
          </div>

          <!-- Nombre -->
          <div class="hidden text-left sm:block">
            <p class="text-sm font-medium text-slate-800">
              {{ fullName || 'Usuario' }}
            </p>

            <p class="max-w-48 truncate text-xs text-slate-400">
              {{ user?.email ?? '' }}
            </p>
          </div>

          <!-- Flechita -->
          <svg
              class="h-4 w-4 text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </RouterLink>
      </header>

      <!-- Página -->
      <main class="min-w-0 p-4 sm:p-6 lg:p-8">
        <div class="mx-auto max-w-7xl min-w-0">
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>