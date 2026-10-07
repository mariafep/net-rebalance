<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'

import { portfolioService } from '../../services/portfolio.service'
import { brokerService } from '../../services/broker.service'
import { assetService } from '../../services/asset.service'
import { useAuth } from '../../composables/useAuth'
import { findPresetByName } from '../../constants/brokerPresets'

import type {
  Portfolio,
  PortfolioFormData,
} from '../../types/portfolio'
import type { Broker } from '../../types/broker'
import type { PortfolioAsset } from '../../types/asset'

const router = useRouter()
const { user } = useAuth()

const portfolios = ref<Portfolio[]>([])
const brokers = ref<Broker[]>([])

const portfolioAssets = ref<
    Record<string, PortfolioAsset[]>
>({})

const loading = ref(true)
const errorMessage = ref('')

/*
|--------------------------------------------------------------------------
| BÚSQUEDA Y FILTROS
|--------------------------------------------------------------------------
*/

const searchTerm = ref('')
const statusFilter = ref('all')

const filteredPortfolios = computed(() => {
  const search =
      searchTerm.value.trim().toLowerCase()

  return portfolios.value.filter(
      (portfolio) => {
        const matchesSearch =
            !search ||
            portfolio.name
                .toLowerCase()
                .includes(search)

        const matchesStatus =
            statusFilter.value === 'all' ||
            portfolio.status ===
            statusFilter.value

        return (
            matchesSearch &&
            matchesStatus
        )
      },
  )
})

/*
|--------------------------------------------------------------------------
| PAGINACIÓN
|--------------------------------------------------------------------------
*/

const itemsPerPage = 5
const currentPage = ref(1)

const totalPages = computed(() =>
    Math.max(
        1,
        Math.ceil(
            filteredPortfolios.value.length /
            itemsPerPage,
        ),
    ),
)

const paginatedPortfolios = computed(() => {
  const start =
      (currentPage.value - 1) *
      itemsPerPage

  return filteredPortfolios.value.slice(
      start,
      start + itemsPerPage,
  )
})

const firstVisibleItem = computed(() => {
  if (
      filteredPortfolios.value.length === 0
  ) {
    return 0
  }

  return (
      (currentPage.value - 1) *
      itemsPerPage +
      1
  )
})

const lastVisibleItem = computed(() => {
  return Math.min(
      currentPage.value * itemsPerPage,
      filteredPortfolios.value.length,
  )
})

watch(
    [searchTerm, statusFilter],
    () => {
      currentPage.value = 1
    },
)

function previousPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function nextPage() {
  if (
      currentPage.value <
      totalPages.value
  ) {
    currentPage.value++
  }
}

/*
|--------------------------------------------------------------------------
| DATOS DE LA TABLA
|--------------------------------------------------------------------------
*/

function getBrokerName(
    brokerId: string,
) {
  return (
      brokers.value.find(
          (broker) =>
              broker.id === brokerId,
      )?.name ?? 'No disponible'
  )
}

function getBrokerBadge(brokerId: string) {
  const broker = brokers.value.find((b) => b.id === brokerId)
  if (!broker) return null

  const preset = findPresetByName(broker.name)
  const isNational = preset?.category === 'national' || broker.currency === 'PEN'

  return {
    label: isNational ? '🇵🇪 BVL' : '🌎 Int.',
    badgeClass: isNational
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-blue-200 bg-blue-50 text-blue-700',
  }
}

function getPortfolioAssets(
    portfolioId: string,
) {
  return (
      portfolioAssets.value[
          portfolioId
          ] ?? []
  )
}

function getAssetCount(
    portfolioId: string,
) {
  return getPortfolioAssets(
      portfolioId,
  ).length
}

function getTotalWeight(
    portfolioId: string,
) {
  return getPortfolioAssets(
      portfolioId,
  ).reduce(
      (total, item) =>
          total +
          Number(item.target_weight),
      0,
  )
}

function formatDate(
    date: string,
) {
  return new Intl.DateTimeFormat(
      'es-PE',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      },
  ).format(new Date(date))
}

/*
|--------------------------------------------------------------------------
| MENÚ DE ACCIONES
|--------------------------------------------------------------------------
*/

const openMenuId = ref<string | null>(
    null,
)

function toggleMenu(
    portfolioId: string,
) {
  openMenuId.value =
      openMenuId.value === portfolioId
          ? null
          : portfolioId
}

function goToDetail(
    portfolio: Portfolio,
) {
  openMenuId.value = null

  router.push(
      `/portfolios/${portfolio.id}/config`,
  )
}

function goToAnalysis(
    portfolio: Portfolio,
) {
  openMenuId.value = null

  router.push(
      `/portfolios/${portfolio.id}/analysis`,
  )
}

/*
|--------------------------------------------------------------------------
| MODAL NUEVO PORTAFOLIO
|--------------------------------------------------------------------------
*/

const showCreateModal = ref(false)
const creating = ref(false)
const formError = ref('')

const form = ref<PortfolioFormData>({
  name: '',
  broker_id: '',
  currency: '',
})

function openCreateModal() {
  formError.value = ''

  form.value = {
    name: '',
    broker_id:
        brokers.value[0]?.id ?? '',
    currency:
        brokers.value[0]?.currency ??
        '',
  }

  showCreateModal.value = true
}

function closeCreateModal() {
  if (creating.value) return

  showCreateModal.value = false
  formError.value = ''
}

function handleBrokerChange() {
  const selectedBroker =
      brokers.value.find(
          (broker) =>
              broker.id ===
              form.value.broker_id,
      )

  form.value.currency =
      selectedBroker?.currency ?? ''
}

async function handleCreatePortfolio() {
  formError.value = ''

  if (!user.value) {
    formError.value =
        'No se encontró la sesión del usuario.'
    return
  }

  if (!form.value.name.trim()) {
    formError.value =
        'Ingresa un nombre para el portafolio.'
    return
  }

  if (!form.value.broker_id) {
    formError.value =
        'Selecciona un broker.'
    return
  }

  creating.value = true

  try {
    const newPortfolio =
        await portfolioService.createPortfolio(
            user.value.id,
            {
              name: form.value.name.trim(),
              broker_id:
              form.value.broker_id,
              currency:
              form.value.currency,
            },
        )

    showCreateModal.value = false

    await router.push(
        `/portfolios/${newPortfolio.id}/config`,
    )
  } catch (error) {
    console.error(
        'Error al crear portafolio:',
        error,
    )

    formError.value =
        'No pudimos crear el portafolio.'
  } finally {
    creating.value = false
  }
}

/*
|--------------------------------------------------------------------------
| CARGA
|--------------------------------------------------------------------------
*/

async function loadPortfolios() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [
      portfolioData,
      brokerData,
    ] = await Promise.all([
      portfolioService.getPortfolios(),
      brokerService.getBrokers(),
    ])

    portfolios.value =
        portfolioData

    brokers.value =
        brokerData

    /*
     * Recuperamos las posiciones
     * correspondientes a cada portafolio.
     */
    const assetResults =
        await Promise.all(
            portfolioData.map(
                async (portfolio) => ({
                  portfolioId:
                  portfolio.id,

                  assets:
                      await assetService.getPortfolioAssets(
                          portfolio.id,
                      ),
                }),
            ),
        )

    const assetsByPortfolio:
        Record<
            string,
            PortfolioAsset[]
        > = {}

    assetResults.forEach(
        (result) => {
          assetsByPortfolio[
              result.portfolioId
              ] = result.assets
        },
    )

    portfolioAssets.value =
        assetsByPortfolio
  } catch (error) {
    console.error(
        'Error al cargar portafolios:',
        error,
    )

    errorMessage.value =
        'No pudimos cargar tus portafolios.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadPortfolios()
})
</script>

<template>
  <section>
    <!-- Header -->
    <div
        class="flex items-start justify-between"
    >
      <div>
        <h1
            class="text-2xl font-semibold text-slate-900"
        >
          Mis Portafolios
        </h1>

        <p
            class="mt-1 text-sm text-slate-500"
        >
          Administra y monitorea tus portafolios de inversión.
        </p>
      </div>

      <button
          type="button"
          :disabled="
          brokers.length === 0
        "
          class="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          @click="openCreateModal"
      >
        + Nuevo portafolio
      </button>
    </div>

    <!-- Loading -->
    <div
        v-if="loading"
        class="mt-8 rounded-xl border border-slate-200 bg-white p-6"
    >
      <p
          class="text-sm text-slate-500"
      >
        Cargando portafolios...
      </p>
    </div>

    <!-- Error -->
    <div
        v-else-if="errorMessage"
        class="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ errorMessage }}
    </div>

    <template v-else>
      <!-- Sin brokers -->
      <div
          v-if="brokers.length === 0"
          class="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5"
      >
        <h2
            class="font-semibold text-amber-800"
        >
          Primero necesitas un broker
        </h2>

        <p
            class="mt-1 text-sm text-amber-700"
        >
          Registra un broker antes de crear tu primer portafolio.
        </p>

        <RouterLink
            to="/brokers"
            class="mt-4 inline-block text-sm font-semibold text-amber-800 underline"
        >
          Ir a Mis Brokers
        </RouterLink>
      </div>

      <!-- Contenido -->
      <template v-else>
        <!-- Buscador y filtro -->
        <div
            class="mt-8 flex items-center gap-4"
        >
          <div
              class="relative flex-1"
          >
            <svg
                class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
              <circle
                  cx="11"
                  cy="11"
                  r="8"
              />

              <path
                  d="m21 21-4.35-4.35"
              />
            </svg>

            <input
                v-model="searchTerm"
                type="text"
                placeholder="Buscar portafolio..."
                class="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <select
              v-model="statusFilter"
              class="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            <option value="all">
              Todos los estados
            </option>

            <option value="active">
              Activo
            </option>

            <option value="draft">
              Borrador
            </option>
          </select>
        </div>

        <!-- Sin portafolios -->
        <div
            v-if="
            portfolios.length === 0
          "
            class="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-12 text-center"
        >
          <h2
              class="font-semibold text-slate-900"
          >
            Aún no tienes portafolios
          </h2>

          <p
              class="mt-2 text-sm text-slate-500"
          >
            Crea tu primer portafolio para comenzar a monitorear tus inversiones.
          </p>

          <button
              type="button"
              class="mt-5 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
              @click="openCreateModal"
          >
            Crear portafolio
          </button>
        </div>

        <!-- Tabla -->
        <div
            v-else
            class="mt-6 overflow-visible rounded-xl border border-slate-200 bg-white"
        >
          <div
              class="overflow-x-auto"
          >
            <table
                class="w-full min-w-[1050px] text-left text-sm"
            >
              <thead
                  class="bg-slate-50"
              >
              <tr
                  class="border-b border-slate-200"
              >
                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Nombre del portafolio
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Broker
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Moneda
                </th>

                <th
                    class="px-5 py-3 text-center font-medium text-slate-600"
                >
                  Activos
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Pesos configurados
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Estado
                </th>

                <th
                    class="px-5 py-3 font-medium text-slate-600"
                >
                  Última actualización
                </th>

                <th
                    class="px-5 py-3 text-right font-medium text-slate-600"
                >
                  Acciones
                </th>
              </tr>
              </thead>

              <tbody
                  class="divide-y divide-slate-100"
              >
              <tr
                  v-for="portfolio in paginatedPortfolios"
                  :key="portfolio.id"
                  class="transition hover:bg-slate-50"
              >
                <!-- Nombre -->
                <td
                    class="px-5 py-4"
                >
                  <p
                      class="font-medium text-slate-900"
                  >
                    {{ portfolio.name }}
                  </p>
                </td>

                <!-- Broker -->
                <td
                    class="px-5 py-4 text-slate-600"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-slate-800">
                      {{ getBrokerName(portfolio.broker_id) }}
                    </span>
                    <span
                      v-if="getBrokerBadge(portfolio.broker_id)"
                      class="inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                      :class="getBrokerBadge(portfolio.broker_id)!.badgeClass"
                    >
                      {{ getBrokerBadge(portfolio.broker_id)!.label }}
                    </span>
                  </div>
                </td>

                <!-- Moneda -->
                <td
                    class="px-5 py-4 text-slate-600"
                >
                  {{ portfolio.currency }}
                </td>

                <!-- Activos -->
                <td
                    class="px-5 py-4 text-center font-medium text-slate-700"
                >
                  {{
                    getAssetCount(
                        portfolio.id,
                    )
                  }}
                </td>

                <!-- Peso -->
                <td
                    class="px-5 py-4"
                >
                  <div
                      class="flex items-center gap-2"
                  >
                      <span
                          class="font-medium"
                          :class="
                          Math.abs(
                            getTotalWeight(
                              portfolio.id,
                            ) - 100,
                          ) < 0.001
                            ? 'text-emerald-600'
                            : 'text-slate-700'
                        "
                      >
                        {{
                          getTotalWeight(
                              portfolio.id,
                          ).toFixed(2)
                        }}%
                      </span>

                    <span
                        v-if="
                          Math.abs(
                            getTotalWeight(
                              portfolio.id,
                            ) - 100,
                          ) < 0.001
                        "
                        class="text-xs text-emerald-600"
                    >
                        ✓
                      </span>
                  </div>
                </td>

                <!-- Estado -->
                <td
                    class="px-5 py-4"
                >
                    <span
                        class="rounded-full px-2.5 py-1 text-xs font-medium"
                        :class="
                        portfolio.status ===
                        'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      "
                    >
                      {{
                        portfolio.status ===
                        'active'
                            ? 'Activo'
                            : 'Borrador'
                      }}
                    </span>
                </td>

                <!-- Fecha -->
                <td
                    class="px-5 py-4 text-slate-500"
                >
                  {{
                    formatDate(
                        portfolio.updated_at,
                    )
                  }}
                </td>

                <!-- Acciones -->
                <td
                    class="relative px-5 py-4 text-right"
                >
                  <button
                      type="button"
                      class="rounded-lg px-3 py-1.5 text-xl leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                      aria-label="Abrir acciones"
                      @click="
                        toggleMenu(
                          portfolio.id,
                        )
                      "
                  >
                    ⋯
                  </button>

                  <div
                      v-if="
                        openMenuId ===
                        portfolio.id
                      "
                      class="absolute right-5 top-12 z-20 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg"
                  >
                    <button
                        type="button"
                        class="block w-full px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        @click="
                          goToDetail(
                            portfolio,
                          )
                        "
                    >
                      {{
                        portfolio.status ===
                        'active'
                            ? 'Ver detalle'
                            : 'Continuar configuración'
                      }}
                    </button>

                    <button
                        v-if="
                          portfolio.status ===
                          'active'
                        "
                        type="button"
                        class="block w-full px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                        @click="
                          goToAnalysis(
                            portfolio,
                          )
                        "
                    >
                      Ver análisis
                    </button>
                  </div>
                </td>
              </tr>
              </tbody>
            </table>
          </div>

          <!-- Sin resultados -->
          <div
              v-if="
              filteredPortfolios.length ===
              0
            "
              class="border-t border-slate-100 px-6 py-10 text-center"
          >
            <p
                class="text-sm font-medium text-slate-700"
            >
              No encontramos portafolios
            </p>

            <p
                class="mt-1 text-sm text-slate-400"
            >
              Prueba con otro nombre o cambia el filtro de estado.
            </p>
          </div>

          <!-- Footer / paginación -->
          <div
              v-if="
              filteredPortfolios.length >
              0
            "
              class="flex items-center justify-between border-t border-slate-200 px-5 py-4"
          >
            <p
                class="text-sm text-slate-500"
            >
              Mostrando
              {{ firstVisibleItem }}–{{ lastVisibleItem }}
              de
              {{ filteredPortfolios.length }}
              portafolios
            </p>

            <div
                class="flex items-center gap-2"
            >
              <button
                  type="button"
                  :disabled="
                  currentPage === 1
                "
                  class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  @click="previousPage"
              >
                ‹
              </button>

              <span
                  class="flex h-8 min-w-8 items-center justify-center rounded-lg bg-teal-50 px-2 text-sm font-semibold text-teal-700"
              >
                {{ currentPage }}
              </span>

              <button
                  type="button"
                  :disabled="
                  currentPage ===
                  totalPages
                "
                  class="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-sm text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  @click="nextPage"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- Modal -->
    <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
        @click.self="closeCreateModal"
    >
      <div
          class="w-full max-w-lg rounded-xl bg-white shadow-xl"
      >
        <div
            class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
        >
          <div>
            <h2
                class="text-lg font-semibold text-slate-900"
            >
              Nuevo portafolio
            </h2>

            <p
                class="mt-1 text-sm text-slate-500"
            >
              Crea un portafolio para comenzar su configuración.
            </p>
          </div>

          <button
              type="button"
              class="text-xl text-slate-400 hover:text-slate-600"
              @click="closeCreateModal"
          >
            ×
          </button>
        </div>

        <form
            class="space-y-5 p-6"
            @submit.prevent="handleCreatePortfolio"
        >
          <!-- Nombre -->
          <div>
            <label
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Nombre del portafolio
            </label>

            <input
                v-model="form.name"
                type="text"
                placeholder="Ej. Crecimiento Largo Plazo"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <!-- Broker -->
          <div>
            <label
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Broker vinculado
            </label>

            <select
                v-model="form.broker_id"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                @change="handleBrokerChange"
            >
              <option
                  v-for="broker in brokers"
                  :key="broker.id"
                  :value="broker.id"
              >
                {{ broker.name }} ({{ broker.currency }})
              </option>
            </select>

            <p class="mt-1.5 text-xs text-slate-400">
              💡 Podrás configurar activos compatibles con este broker (acciones BVL o ETFs de EE.UU.).
            </p>
          </div>

          <!-- Moneda -->
          <div>
            <label
                class="mb-2 block text-sm font-medium text-slate-700"
            >
              Moneda
            </label>

            <input
                v-model="form.currency"
                type="text"
                readonly
                class="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
            />

            <p
                class="mt-1.5 text-xs text-slate-400"
            >
              La moneda se obtiene del broker seleccionado.
            </p>
          </div>

          <!-- Error -->
          <div
              v-if="formError"
              class="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            {{ formError }}
          </div>

          <!-- Botones -->
          <div
              class="flex justify-end gap-3 border-t border-slate-200 pt-5"
          >
            <button
                type="button"
                :disabled="creating"
                class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                @click="closeCreateModal"
            >
              Cancelar
            </button>

            <button
                type="submit"
                :disabled="creating"
                class="rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {{
                creating
                    ? 'Creando...'
                    : 'Crear portafolio'
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>