<template>
  <div class="sticky top-4">
    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">{{ heading }}</h3>

      <!-- No one chosen yet -->
      <div
        v-if="!props.subject?.id"
        class="flex flex-col items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
      >
        <Icon
          icon="mdi-information-outline"
          class="text-2xl text-gray-400 dark:text-gray-500"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
          Choose who needs access to see what they already have.
        </p>
      </div>

      <!-- Loading state -->
      <div v-else-if="props.loading" class="space-y-2">
        <div
          class="h-12 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        />
        <div
          class="h-12 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        />
      </div>

      <!-- Error state -->
      <ErrorState
        v-else-if="props.error"
        :error="props.error"
        @retry="emit('retry')"
        :show-button-text="true"
      />

      <!-- Empty state -->
      <EmptyState
        v-else-if="props.rows.length === 0"
        icon="mdi-lock-outline"
        title="No access yet"
        :message="emptyMessage"
        :show-clear-filters="false"
      />

      <!-- What they already have -->
      <div v-else class="space-y-2">
        <div
          v-for="row in props.rows"
          :key="row.id"
          class="flex items-start gap-2 p-3 rounded-lg bg-white dark:bg-gray-800/50 border border-solid border-gray-200 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
        >
          <div
            class="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-sm"
          >
            <i-mdi-check-circle class="text-base" />
          </div>
          <div class="flex-1 min-w-0">
            <AccessTypeName
              :access-type="{
                name: row.access_type_name,
                description: row.access_type_description,
              }"
              label-class="text-sm font-medium text-gray-900 dark:text-gray-100"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatExpiry(row.valid_until) }}
            </p>
            <!--
              Access reaching them through a group, a collection, or everyone signed in is
              the case worth naming: asking for it again is wasted effort on both sides.
            -->
            <p
              v-if="isIndirect(row)"
              class="mt-0.5 text-xs text-amber-700 dark:text-amber-400"
            >
              {{ coverageReason(row, props.subject) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * The access a subject already has on a resource, beside the request form.
 *
 * The form loads the coverage, because the access type selector reads the same rows.
 * @see docs/design/groups/implementation/access-requests-plan.md — C2
 */
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { coverageReason } from "./useSubjectCoverage";

dayjs.extend(relativeTime);

const props = defineProps({
  subject: {
    type: Object,
    default: null,
  },
  resource: {
    type: Object,
    required: true,
  },
  /** Coverage rows from `useSubjectCoverage`. */
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: [Object, Error],
    default: null,
  },
});

const emit = defineEmits(["retry"]);

const isGroup = computed(() => props.subject?.type === "GROUP");

const heading = computed(() =>
  isGroup.value ? "Access this group already has" : "Access you already have",
);

const emptyMessage = computed(() => {
  const noun = props.resource?.type === "COLLECTION" ? "collection" : "dataset";
  return isGroup.value
    ? `This group has not been given access to this ${noun}.`
    : `You have not been given access to this ${noun}.`;
});

function isIndirect(row) {
  return row.via !== "DIRECT" || Boolean(row.via_collection_name);
}

function formatExpiry(until) {
  if (!until) {
    return "Never expires";
  }
  const date = dayjs(until);
  if (date.isBefore(dayjs())) {
    return "Expired";
  }
  return `Expires ${date.fromNow()}`;
}
</script>
