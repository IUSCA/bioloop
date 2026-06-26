<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="mb-3">
      <h3
        class="text-sm font-medium uppercase tracking-wide text-gray-700 dark:text-gray-300"
      >
        Effective Grants Preview
      </h3>
      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
        What will actually be granted based on your decisions
      </p>
    </div>

    <!-- Preview content -->
    <div class="flex-1 overflow-auto">
      <!-- No approved items yet -->
      <div
        v-if="!props.approvedItemsPayload?.length"
        class="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center"
      >
        <i-mdi-information-outline
          class="text-3xl text-gray-300 dark:text-gray-600 mx-auto mb-2"
        />
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Approve at least one item to preview the grants that will be issued.
        </p>
      </div>

      <!-- Loading state -->
      <div v-else-if="loading" class="space-y-1">
        <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      <!-- Error state -->
      <div
        v-else-if="error"
        class="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3"
      >
        <div class="text-xs text-red-700 dark:text-red-300">
          {{ error }}
        </div>
        <button
          @click="retry"
          class="mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
        >
          Retry
        </button>
      </div>

      <!-- Grants preview -->
      <EffectiveGrantsPreview
        v-else
        :rows="responseRows"
        :loading="loading"
        :error="error"
      />
    </div>
  </div>
</template>

<script setup>
import EffectiveGrantsPreview from "@/components/v2/grants/issue/EffectiveGrantsPreview.vue";
import grantsService from "@/services/v2/grants";
import { debounce } from "lodash-es";
import { onMounted, ref, watch } from "vue";

const props = defineProps({
  request: {
    type: Object,
    required: true,
  },
  approvedItemsPayload: {
    type: Array,
    default: () => [],
  },
  accessTypeMap: {
    type: Object,
    default: () => ({}),
  },
});

const loading = ref(false);
const error = ref(null);
const responseRows = ref([]);

// Convert ISO date string to appropriate format for API
const formatExpiryForApi = (expiry) => {
  if (!expiry || expiry.type === "never") {
    return null;
  }
  if (expiry.type === "date") {
    if (expiry.value instanceof Date) {
      return expiry.value.toISOString();
    }
    return new Date(expiry.value).toISOString();
  }
  return null;
};

// Build payload for compute-effective-grants API
const buildPayload = () => {
  const items = props.approvedItemsPayload.map((item) => {
    const expiry = item.approved_expiry;
    return {
      preset_id: item.preset_id || undefined,
      access_type_id: item.access_type_id || undefined,
      approved_expiry:
        expiry.type === "never"
          ? { type: "never", value: null }
          : {
              type: "date",
              value: formatExpiryForApi(expiry),
            },
    };
  });

  return {
    subject_id: props.request?.subject_id,
    resource_id: props.request?.resource_id,
    resource_type: props.request?.resource_type,
    items,
    justification: "",
  };
};

// Fetch effective grants
const fetchEffectiveGrants = async () => {
  if (!props.approvedItemsPayload?.length) {
    responseRows.value = [];
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const payload = buildPayload();
    const response = await grantsService.computeEffectiveGrants(payload);

    // Augment each row with access_type metadata if available
    responseRows.value =
      response.data?.map((row) => ({
        ...row,
        access_type: props.accessTypeMap[row.access_type_id] || null,
      })) || [];
  } catch (err) {
    console.error("Failed to compute effective grants:", err);
    error.value =
      err.response?.data?.message ||
      "Failed to preview grants. Please try again.";
    responseRows.value = [];
  } finally {
    loading.value = false;
  }
};

// Debounced fetch
const debouncedFetch = debounce(fetchEffectiveGrants, 350);

// Retry function
const retry = () => {
  fetchEffectiveGrants();
};

// Watch for changes and trigger fetch
watch(
  () => props.approvedItemsPayload,
  () => {
    debouncedFetch();
  },
  { deep: true },
);

// Initial fetch
onMounted(() => {
  if (props.approvedItemsPayload?.length) {
    fetchEffectiveGrants();
  }
});
</script>
