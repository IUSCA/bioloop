<template>
  <va-card data-testid="report-header">
    <va-card-title>
      <span class="text-lg">Duplication Summary</span>
    </va-card-title>

    <va-card-content>
      <div class="flex flex-col gap-4">
        <!-- Dataset identity row -->
        <div class="va-table-responsive">
          <table class="va-table w-full">
            <tbody>
              <tr>
                <td class="font-semibold w-48">Incoming dataset</td>
                <td>
                  <router-link
                    data-testid="incoming-dataset-link"
                    :to="`/datasets/${props.dataset?.id}`"
                    class="va-link"
                  >
                    {{ props.dataset?.name }}
                  </router-link>
                </td>
              </tr>
              <tr>
                <td class="font-semibold">Original dataset</td>
                <td>
                  <router-link
                    v-if="props.originalDataset"
                    data-testid="original-dataset-link"
                    :to="`/datasets/${props.originalDataset.id}`"
                    class="va-link"
                  >
                    {{ props.originalDataset.name }}
                  </router-link>
                  <span v-else class="text-gray-400">—</span>
                </td>
              </tr>
              <tr>
                <td class="font-semibold">Comparison status</td>
                <td>
                  <div class="flex items-center gap-3">
                    <va-badge
                      data-testid="comparison-status-badge"
                      :color="statusColor"
                      :text="props.duplication?.comparison_status || '—'"
                    />
                    <!-- Progress circle shown while comparison is running -->
                    <template v-if="isRunning">
                      <va-progress-circle
                        v-if="fractionPercent !== null"
                        :model-value="fractionPercent"
                        size="2rem"
                        :thickness="0.25"
                        data-testid="comparison-progress-circle"
                      >
                        <span class="text-xs font-mono">{{ fractionPercent }}%</span>
                      </va-progress-circle>
                      <va-icon v-else name="sync" class="text-blue-500 animate-spin" />
                    </template>
                    <!-- Error icon on failure -->
                    <va-icon
                      v-if="isFailed"
                      name="error_outline"
                      class="text-red-500 text-xl"
                      data-testid="comparison-failed-icon"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Jaccard similarity card -->
        <div
          v-if="meta"
          data-testid="jaccard-card"
          class="flex items-start gap-6 rounded-lg border border-[var(--va-background-border)] p-4"
        >
          <!-- Big score -->
          <div class="flex flex-col items-center min-w-[5rem]">
            <span
              data-testid="jaccard-score"
              class="text-3xl font-bold"
              :class="scoreColor"
            >{{ scorePercent }}%</span>
            <span class="text-xs mt-1 text-[var(--va-text-secondary)]">similarity</span>
          </div>

          <!-- Formula breakdown — all text uses Vuestic CSS variables so the
               colours adapt correctly between light and dark themes. -->
          <div class="flex flex-col gap-1 text-sm">
            <div class="font-semibold">How this was calculated (Jaccard similarity)</div>
            <div class="font-mono text-[var(--va-text-secondary)]">
              score = identical_files / (incoming_files + original_files − identical_files)
            </div>
            <div
              data-testid="jaccard-formula"
              class="font-mono text-base font-semibold text-[var(--va-primary)]"
            >
              {{ scorePercent }}% = {{ meta.total_common_files }} / ({{ meta.total_incoming_files }} + {{ meta.total_original_files }} − {{ meta.total_common_files }}) = {{ meta.total_common_files }}/{{ denominatorValue }}
            </div>
            <div class="text-xs mt-1 text-[var(--va-text-secondary)]">
              Identical files counted by content (MD5 checksum match), regardless of file name.
            </div>
          </div>
        </div>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
const props = defineProps({
  dataset: { type: Object, default: null },
  duplication: { type: Object, default: null },
  originalDataset: { type: Object, default: null },
});

const meta = computed(() => props.duplication?.metadata || null);

const denominatorValue = computed(() => {
  if (!meta.value) return 0;
  return (
    meta.value.total_incoming_files +
    meta.value.total_original_files -
    meta.value.total_common_files
  );
});

const scorePercent = computed(() => {
  if (!meta.value) return "—";
  const score = meta.value.jaccard_score ?? 0;
  return Math.round(score * 100);
});

const scoreColor = computed(() => {
  const s = meta.value?.jaccard_score ?? 0;
  if (s >= 0.95) return "text-red-600";
  if (s >= 0.85) return "text-orange-500";
  return "text-yellow-500";
});

const statusColor = computed(() => {
  const s = props.duplication?.comparison_status;
  if (s === "COMPLETED") return "success";
  if (s === "FAILED") return "danger";
  if (s === "RUNNING") return "info";
  return "secondary";
});

const isRunning = computed(
  () => props.duplication?.comparison_status === "RUNNING"
    || props.duplication?.comparison_status === "PENDING",
);

const isFailed = computed(
  () => props.duplication?.comparison_status === "FAILED",
);

const fractionPercent = computed(() => {
  const f = props.duplication?.comparison_fraction_done;
  if (f == null) return null;
  return Math.round(f * 100);
});
</script>
