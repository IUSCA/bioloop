<template>
  <va-card data-testid="report-body">
    <va-card-title>
      <span class="text-lg">File-Level Comparison Report</span>
    </va-card-title>

    <va-card-content>
      <div v-if="!props.ingestionChecks?.length" class="text-gray-400 py-4">
        No comparison data available.
      </div>

      <div v-else class="flex flex-col gap-3">
        <!-- One card per check type.
             EXACT_CONTENT_MATCHES is summary-only (used by Jaccard). -->
        <va-collapse
          v-for="check in orderedChecks"
          :key="check.type"
          :header="checkHeader(check)"
          :disabled="!isCollapsible(check)"
          :data-testid="`check-section-${check.type}`"
        >
          <template #header="{ value, attrs, keyboardFocusClassList }">
            <div
              v-bind="attrs"
              class="flex items-center justify-between w-full px-4 py-3 rounded"
              :class="[
                isCollapsible(check)
                  ? 'cursor-pointer hover:bg-[var(--va-background-secondary)]'
                  : 'cursor-default',
                keyboardFocusClassList,
              ]"
            >
              <div class="flex items-center gap-3">
                <!-- Alert-style indicator: checkmark when no differences are found
                     in this category, warning triangle when differences are present.
                     These convey "category has / has no entries" not "test passed / failed". -->
                <i-mdi-check-circle-outline
                  v-if="check.passed"
                  class="text-xl text-[var(--va-success)]"
                  :data-testid="`check-icon-passed-${check.type}`"
                />
                <i-mdi-alert-outline
                  v-else
                  class="text-xl text-[var(--va-warning)]"
                  :data-testid="`check-icon-failed-${check.type}`"
                />

                <!-- Label and count badge -->
                <span class="font-medium">{{ checkTitle(check.type) }}</span>
                <va-badge
                  v-if="check.file_checks?.length"
                  :text="String(check.file_checks.length)"
                  :color="badgeColor(check.type)"
                  :data-testid="`check-badge-${check.type}`"
                />
              </div>
              <div class="flex items-center gap-2 text-sm text-[var(--va-text-secondary)]">
                <span>{{ check.label }}</span>
                <!-- Chevron only on expandable difference sections -->
                <i-mdi-chevron-down
                  v-if="isCollapsible(check)"
                  :class="{ 'rotate-180': value }"
                  class="transition-transform"
                />
              </div>
            </div>
          </template>

          <!-- File list for this check.
               virtual-scroller is intentionally omitted: the collapse height
               animates from 0 on open, which causes the virtual scroller to
               calculate zero visible rows and render nothing.  For the file
               counts typical in duplicate detection (<1 000 files) standard
               rendering inside a scrollable max-height container is sufficient. -->
          <div class="px-4 pb-4">
            <div
              class="rounded border border-[var(--va-background-border)] overflow-auto max-h-80"
              data-testid="check-file-list-scroll"
            >
              <va-data-table
                :items="fileRows(check)"
                :columns="columnsForType(check.type)"
                class="text-xs"
              >
                <template #cell(path)="{ value }">
                  <span class="font-mono break-all">{{ value }}</span>
                </template>
                <template #cell(md5_incoming)="{ value }">
                  <span class="font-mono text-xs">{{ value || "—" }}</span>
                </template>
                <template #cell(md5_original)="{ value }">
                  <span class="font-mono text-xs">{{ value || "—" }}</span>
                </template>
                <template #cell(source)="{ value }">
                  <va-badge
                    :text="value"
                    :color="value === 'incoming' ? 'primary' : 'secondary'"
                  />
                </template>
              </va-data-table>
            </div>
          </div>
        </va-collapse>
      </div>
    </va-card-content>
  </va-card>
</template>

<script setup>
const props = defineProps({
  ingestionChecks: { type: Array, default: () => [] },
  duplication: { type: Object, default: null },
  originalDataset: { type: Object, default: null },
  duplicateDataset: { type: Object, default: null },
});

// Display order for check types
const TYPE_ORDER = [
  "EXACT_CONTENT_MATCHES",
  "SAME_PATH_SAME_CONTENT",
  "SAME_PATH_DIFFERENT_CONTENT",
  "SAME_CONTENT_DIFFERENT_PATH",
  "ONLY_IN_INCOMING",
  "ONLY_IN_ORIGINAL",
];

const orderedChecks = computed(() => {
  return [...(props.ingestionChecks || [])].sort((a, b) => {
    return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
  });
});

// EXACT_CONTENT_MATCHES is informational (the hash-only baseline used in the
// Jaccard formula) and is rendered as a non-expandable summary row.
const SUMMARY_ONLY_TYPES = new Set(["EXACT_CONTENT_MATCHES"]);

function isCollapsible(check) {
  return !SUMMARY_ONLY_TYPES.has(check.type) && !!check.file_checks?.length;
}

const CHECK_TITLES = {
  EXACT_CONTENT_MATCHES: "Exact content matches",
  SAME_PATH_SAME_CONTENT: "Same path + same content",
  SAME_PATH_DIFFERENT_CONTENT: "Same path + different content",
  SAME_CONTENT_DIFFERENT_PATH: "Same content + different path/name",
  ONLY_IN_INCOMING: "Only in incoming dataset",
  ONLY_IN_ORIGINAL: "Only in original dataset",
};

function checkTitle(type) {
  return CHECK_TITLES[type] || type;
}

function checkHeader(check) {
  return checkTitle(check.type);
}

function badgeColor(type) {
  if (type === "EXACT_CONTENT_MATCHES" || type === "SAME_PATH_SAME_CONTENT") return "success";
  if (type === "SAME_PATH_DIFFERENT_CONTENT" || type === "SAME_CONTENT_DIFFERENT_PATH") return "warning";
  return "info";
}

// Build flat file rows for the data table from file_checks
function fileRows(check) {
  if (!check.file_checks?.length) return [];

  if (check.type === "SAME_PATH_DIFFERENT_CONTENT") {
    // Group by path: each path has one incoming and one original entry
    const byPath = {};
    for (const fc of check.file_checks) {
      const path = fc.file?.path ?? "—";
      if (!byPath[path]) byPath[path] = { path };
      if (fc.source_dataset_id === props.duplicateDataset?.id) {
        byPath[path].md5_incoming = fc.file?.md5 ?? "—";
      } else {
        byPath[path].md5_original = fc.file?.md5 ?? "—";
      }
    }
    return Object.values(byPath);
  }

  return check.file_checks.map((fc) => ({
    path: fc.file?.path ?? "—",
    source:
      fc.source_dataset_id === props.duplicateDataset?.id
        ? "incoming"
        : "original",
    md5: fc.file?.md5 ?? "—",
  }));
}

function columnsForType(type) {
  if (type === "SAME_PATH_DIFFERENT_CONTENT") {
    return [
      { key: "path", label: "File path", sortable: true },
      { key: "md5_incoming", label: "MD5 (incoming)" },
      { key: "md5_original", label: "MD5 (original)" },
    ];
  }
  if (type === "EXACT_CONTENT_MATCHES" || type === "SAME_PATH_SAME_CONTENT") {
    return [
      { key: "path", label: "File path", sortable: true },
      { key: "md5", label: "MD5 checksum" },
    ];
  }
  if (type === "SAME_CONTENT_DIFFERENT_PATH") {
    return [
      { key: "path", label: "File path", sortable: true },
      { key: "source", label: "Source" },
      { key: "md5", label: "MD5 checksum" },
    ];
  }
  return [
    { key: "path", label: "File path", sortable: true },
    { key: "source", label: "Source" },
  ];
}
</script>
