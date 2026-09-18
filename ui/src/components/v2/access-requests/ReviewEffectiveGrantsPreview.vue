<template>
  <div>
    <!-- EffectiveGrantsPreview draws this heading itself once it has rows. The other three
         states repeat it, so the panel does not gain and lose a title as decisions change. -->
    <div v-if="!hasRows" class="mb-2">
      <p class="text-sm font-medium uppercase tracking-wide">Access preview</p>
      <p class="mt-1 text-xs va-text-secondary">
        What will actually be given based on your decisions
      </p>
    </div>

    <!-- Nothing approved yet -->
    <div
      v-if="!props.approvedItemsPayload?.length"
      class="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-600"
    >
      <i-mdi-information-outline
        class="mx-auto mb-2 text-3xl text-gray-400 dark:text-gray-600"
      />
      <p class="text-sm va-text-secondary">
        Approve an item to see the access it gives.
      </p>
    </div>

    <!-- Loading state -->
    <div
      v-else-if="loading"
      class="space-y-2 rounded-lg border border-solid border-gray-200 p-3 dark:border-gray-700"
    >
      <div class="h-6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      <div class="h-6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
      <div class="h-6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      class="rounded-lg border border-solid border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
    >
      <p class="text-xs text-red-700 dark:text-red-300">{{ error }}</p>
      <button
        type="button"
        class="focus-ring mt-2 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        @click="retry"
      >
        Try again
      </button>
    </div>

    <!-- Grants preview -->
    <EffectiveGrantsPreview
      v-else
      :rows="responseRows"
      :loading="loading"
      :error="error"
      description="What will actually be given based on your decisions"
    />
  </div>
</template>

<script setup>
import EffectiveGrantsPreview from "@/components/v2/grants/issue/EffectiveGrantsPreview.vue";
import grantsService from "@/services/v2/grants";
import { debounce } from "lodash-es";
import { computed, onMounted, ref, watch } from "vue";

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
  /** DATASET or COLLECTION. Derived by the modal from the request's resource row. */
  resourceType: {
    type: String,
    default: null,
  },
});

const loading = ref(false);
const error = ref(null);
const responseRows = ref([]);

// True only in the state where EffectiveGrantsPreview draws its own heading.
const hasRows = computed(
  () => !!props.approvedItemsPayload?.length && !loading.value && !error.value,
);

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
    resource_type: props.resourceType,
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
      "Failed to preview access. Please try again.";
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
