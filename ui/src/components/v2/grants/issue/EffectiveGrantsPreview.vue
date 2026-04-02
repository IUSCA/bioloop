<template>
  <div>
    <div class="mb-2 flex items-center justify-between">
      <p class="text-sm font-medium uppercase tracking-wide">
        Effective grants preview
      </p>
      <i-mdi-loading
        v-if="props.loading"
        class="animate-spin text-base va-text-secondary"
        aria-label="Loading preview"
      />
    </div>

    <div
      class="overflow-hidden rounded-lg border border-solid border-gray-200 dark:border-gray-700"
    >
      <!-- Error state -->
      <div
        v-if="props.error"
        class="px-3 py-3 text-sm text-red-600 dark:text-red-400"
      >
        {{ props.error }}
      </div>

      <!-- Loading skeleton -->
      <div v-else-if="props.loading">
        <!-- Legend skeleton -->
        <div
          class="flex items-center border-b border-solid border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
        >
          <div
            class="h-10 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
          />
        </div>
        <div
          v-for="n in 3"
          :key="n"
          class="flex items-center gap-3 border-b border-solid border-gray-100 px-3 py-2.5 last:border-b-0 dark:border-gray-800"
        >
          <div
            class="h-3 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800"
          />
          <div
            class="ml-auto h-5 w-16 animate-pulse rounded-full bg-gray-100 dark:bg-gray-800"
          />
        </div>
      </div>

      <template v-else>
        <!-- Legend -->
        <div
          v-if="legend.length"
          class="flex flex-wrap gap-3 border-b border-solid border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900"
        >
          <span
            v-for="item in legend"
            :key="item.text"
            class="text-xs"
            :class="item.color"
          >
            {{ item.text }}
          </span>
        </div>

        <!-- Grouped rows -->
        <template v-for="section in grouped" :key="section.type">
          <div
            class="border-b border-solid border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500"
          >
            {{ section.label }}
          </div>
          <div>
            <div
              v-for="row in section.rows"
              :key="row.access_type_id"
              class="border-b border-solid border-gray-100 last:border-b-0 dark:border-gray-800"
            >
              <GrantPreviewRow :row="row" />
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  /** Array from computeEffectiveGrants API, augmented with access_type */
  rows: {
    type: Array,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: null,
  },
});

const ORDER = ["new", "supersede", "existing"];

const SECTION_LABELS = {
  new: "New grants",
  supersede: "Extending expiry",
  existing: "Skipped — existing grant is broader",
};

const grouped = computed(() => {
  const map = {};
  ORDER.forEach((t) => (map[t] = []));
  props.rows.forEach((row) => {
    if (map[row.type]) map[row.type].push(row);
  });
  return ORDER.filter((t) => map[t].length > 0).map((t) => ({
    type: t,
    label: SECTION_LABELS[t],
    rows: map[t],
  }));
});

const legend = computed(() => {
  const counts = {};
  props.rows.forEach((r) => {
    counts[r.type] = (counts[r.type] || 0) + 1;
  });
  const parts = [];
  if (counts.new)
    parts.push({
      text: `${counts.new} new grant${counts.new > 1 ? "s" : ""}`,
      color: "text-green-700 dark:text-green-400",
    });
  if (counts.supersede)
    parts.push({
      text: `${counts.supersede} extending`,
      color: "text-amber-700 dark:text-amber-400",
    });
  if (counts.existing)
    parts.push({
      text: `${counts.existing} unchanged`,
      color: "text-gray-500 dark:text-gray-400",
    });
  return parts;
});
</script>
