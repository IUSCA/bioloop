<template>
  <div
    class="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white dark:bg-slate-900 border border-solid border-gray-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm"
  >
    <!-- Left: Search + Browse -->

    <section class="min-w-0">
      <VaInnerLoading :loading="loading" class="space-y-3 min-w-0">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Search datasets
          </h3>
          <span
            class="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400"
            >Total {{ totalCount }}</span
          >
        </div>

        <div class="relative">
          <Searchbar
            v-model="query"
            :disabled="disabled"
            placeholder="Search active datasets by name..."
            class="text-sm"
          />
        </div>

        <div class="h-[420px]">
          <!-- results -->
          <div v-if="error" class="py-16">
            <ErrorState :message="error" @retry="fetchDatasets" />
          </div>
          <div
            v-else
            class="overflow-auto border border-solid border-gray-100 dark:border-slate-800 rounded-xl p-2 bg-gray-50 dark:bg-slate-800"
          >
            <template v-if="localDatasets.length">
              <ul class="space-y-2">
                <li
                  v-for="dataset in localDatasets"
                  :key="dataset.id"
                  class="rounded-xl"
                >
                  <button
                    type="button"
                    class="w-full text-left p-3 rounded-xl flex items-start justify-between gap-3 border border-solid border-transparent hover:border-sky-200 dark:hover:border-sky-700 bg-white dark:bg-slate-900 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    :class="{
                      'opacity-60 pointer-events-none': isSelected(dataset),
                    }"
                    @click="addDataset(dataset)"
                    :aria-disabled="isSelected(dataset) || disabled"
                  >
                    <div class="flex-grow min-w-0">
                      <div
                        class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate"
                      >
                        {{ dataset.name }}
                      </div>
                      <div
                        class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                      >
                        {{ dataset.type }}
                        <span class="mx-1">•</span>
                        <span>{{ formatBytes(dataset.size) }}</span>
                      </div>
                    </div>
                    <div class="flex self-center">
                      <span
                        v-if="isSelected(dataset)"
                        class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                      >
                        <i-mdi-check class="text-sm" />
                        Added
                      </span>
                      <span
                        v-else
                        class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                      >
                        Add
                      </span>
                    </div>
                  </button>
                </li>
              </ul>
            </template>

            <div v-else-if="!loading && hasActiveFilters" class="py-16">
              <!-- No datasets match your search. -->
              <EmptyState title="No datasets found" @reset="resetFilters" />
            </div>

            <div
              v-else-if="!loading"
              class="py-16 text-center va-text-secondary"
            >
              <!-- No datasets available. -->
              No active datasets available to select.
            </div>
          </div>
        </div>
      </VaInnerLoading>
    </section>

    <!-- Right: Selected list -->
    <section
      class="min-w-0 border border-solid border-gray-100 dark:border-slate-700 rounded-2xl p-4 bg-gray-50 dark:bg-slate-950 flex flex-col"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Selected datasets
        </h3>
        <div class="flex items-center gap-2">
          <span
            class="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            {{ selected.length }}
          </span>
          <button
            type="button"
            class="text-xs font-medium text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-100"
            @click="clearAll"
            :disabled="!selected.length || disabled"
          >
            Clear all
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-auto max-h-[430px] space-y-2">
        <template v-if="selected.length">
          <div
            v-for="dataset in selected"
            :key="dataset.id"
            class="bg-white dark:bg-slate-900 border border-solid border-gray-200 dark:border-slate-800 rounded-xl p-3 flex items-start justify-between gap-3"
          >
            <div class="min-w-0">
              <div
                class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate"
              >
                {{ dataset.name }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ dataset.type }} • {{ formatBytes(dataset.size) }}
              </div>
            </div>
            <div class="self-center">
              <VaButton
                type="button"
                class="text-xs font-medium"
                @click.stop="removeDataset(dataset)"
                :aria-label="`Remove ${dataset.name}`"
                size="small"
                preset="plain"
                color="danger"
              >
                Remove
              </VaButton>
            </div>
          </div>
        </template>

        <div
          v-else
          class="text-sm text-gray-500 dark:text-slate-400 pt-8 text-center flex items-center justify-center gap-2"
        >
          Start adding datasets from the left panel to build your selection.
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { formatBytes } from "@/services/utils";
import DatasetService from "@/services/v2/datasets";
import { computed, onMounted, ref, toRefs, watch } from "vue";
import { VaInnerLoading } from "vuestic-ui/web-components";

const props = defineProps({
  disabled: { type: Boolean, default: false },
  ownerGroupId: {
    type: String,
    default: null,
  },
});

const { disabled } = toRefs(props);

const query = ref("");
const selected = defineModel("selected");
const localDatasets = ref([]);
const loading = ref(false);
const error = ref(null);

const totalCount = ref(0);

watch(() => [query.value, props.ownerGroupId], fetchDatasets, {
  immediate: true,
  deep: true,
});

const selectedIds = computed(
  () => new Set((selected.value ?? selected)?.map((item) => item.id)),
);

const hasActiveFilters = computed(() => {
  return query.value.trim() !== "";
});

async function fetchDatasets() {
  const params = {
    is_deleted: false,
  };

  if (query.value.trim()) {
    params.name = query.value.trim();
  }
  if (props.ownerGroupId) {
    params.owner_group_id = props.ownerGroupId;
  }

  try {
    loading.value = true;
    error.value = null;
    const response = await DatasetService.search(params);
    localDatasets.value = response?.data?.data || [];
    totalCount.value =
      response?.data?.metadata?.total ?? localDatasets.value.length;
  } catch (error) {
    error.value =
      error?.response?.data?.message || "An error occurred while searching.";
    console.error("Dataset search failed:", error);
    localDatasets.value = [];
    totalCount.value = 0;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchDatasets();
});

function isSelected(dataset) {
  return selectedIds.value.has(dataset.id);
}

function addDataset(dataset) {
  if (disabled.value) return;
  if (isSelected(dataset)) return;
  selected.value = [...selected.value, dataset];
}

function removeDataset(dataset) {
  if (disabled.value) return;
  selected.value = selected.value.filter((item) => item.id !== dataset.id);
}

function clearAll() {
  if (disabled.value) return;
  selected.value = [];
}

function resetFilters() {
  query.value = "";
}
</script>
