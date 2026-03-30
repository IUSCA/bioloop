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

        <!-- Similarity and summary metrics -->
        <div
          v-if="meta"
          data-testid="content-similarity-card"
          class="flex items-start gap-6 rounded-lg border border-[var(--va-background-border)] p-4"
        >
          <!-- Big score -->
          <div class="flex flex-col items-center min-w-[5rem]">
            <span
              data-testid="content-similarity-score"
              class="text-3xl font-bold"
              :class="scoreColor"
            >{{ scorePercent }}%</span>
            <span class="text-xs mt-1 text-[var(--va-text-secondary)]">dataset similarity</span>
          </div>

          <!-- Formula breakdown — all text uses Vuestic CSS variables so the
               colours adapt correctly between light and dark themes. -->
          <div class="flex flex-col gap-1 text-sm">
            <div class="font-semibold">How this was calculated (file-count Jaccard index)</div>
            <div class="font-mono text-[var(--va-text-secondary)]">
              dataset similarity score = exact_content_matches / (incoming_files + original_files - exact_content_matches)
            </div>
            <div
              data-testid="content-similarity-formula"
              class="font-mono text-base font-semibold text-[var(--va-primary)]"
            >
              {{ scorePercent }}% = {{ meta.total_common_files }} / ({{ meta.total_incoming_files }} + {{ meta.total_original_files }} − {{ meta.total_common_files }}) = {{ meta.total_common_files }}/{{ denominatorValue }}
            </div>
            <div class="text-xs mt-1 text-[var(--va-text-secondary)]">
              Identical files counted by content (MD5 checksum match), regardless of file name.
            </div>
          </div>
        </div>

        <div
          v-if="meta"
          class="va-table-responsive rounded-lg border border-[var(--va-background-border)]"
        >
          <table class="va-table w-full">
            <tbody>
              <tr>
                <td class="font-semibold w-64">Path-preserving similarity</td>
                <td data-testid="summary-metric-path-preserving-similarity">{{ pathPreservingPercent }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Exact content matches</td>
                <td data-testid="summary-metric-exact-content-match-count">{{ displayMetric(meta.exact_content_match_count) }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Same-path modified files</td>
                <td data-testid="summary-metric-same-path-modified-count">{{ displayMetric(meta.same_path_different_content_count) }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Moved/renamed same-content files</td>
                <td data-testid="summary-metric-renamed-moved-count">{{ displayMetric(meta.same_content_different_path_count) }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Incoming / original file counts</td>
                <td data-testid="summary-metric-incoming-original-counts">
                  {{ displayMetric(meta.total_incoming_files) }} / {{ displayMetric(meta.total_original_files) }}
                </td>
              </tr>
              <tr>
                <td class="font-semibold">File-count delta (incoming - original)</td>
                <td data-testid="summary-metric-file-count-delta">{{ displayMetric(meta.file_count_delta) }}</td>
              </tr>
              <tr>
                <td class="font-semibold">Only-in-incoming / only-in-original</td>
                <td data-testid="summary-metric-only-in-counts">
                  {{ displayMetric(meta.only_in_incoming_count) }} / {{ displayMetric(meta.only_in_original_count) }}
                </td>
              </tr>
            </tbody>
          </table>
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

const contentSimilarityScore = computed(() => {
  if (!meta.value) return 0;
  return meta.value.content_similarity_score ?? meta.value.jaccard_score ?? 0;
});

const scorePercent = computed(() => {
  if (!meta.value) return "—";
  return Math.round(contentSimilarityScore.value * 100);
});

const scoreColor = computed(() => {
  const s = contentSimilarityScore.value;
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

const pathPreservingPercent = computed(() => {
  const score = meta.value?.path_preserving_similarity;
  if (score == null) return "—";
  return `${Math.round(score * 100)}%`;
});

function displayMetric(value) {
  if (value == null) return "—";
  return String(value);
}
</script>
