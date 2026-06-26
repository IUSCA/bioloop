<template>
  <div
    class="rounded-lg border border-solid transition-all duration-200"
    :class="[
      'border-gray-200 dark:border-gray-700',
      props.decision === 'APPROVED'
        ? 'border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-900/10'
        : props.decision === 'REJECTED'
          ? 'border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-900/10'
          : 'hover:border-gray-300 dark:hover:border-gray-600',
    ]"
  >
    <div class="p-4 space-y-3">
      <!-- Header: name + decision buttons -->
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <!-- Title and description -->
          <div class="space-y-1 mb-2">
            <h3 class="font-semibold text-gray-900 dark:text-gray-100">
              {{ itemName }}
            </h3>
            <p
              v-if="itemDescription"
              class="text-sm text-gray-600 dark:text-gray-400"
            >
              {{ itemDescription }}
            </p>
          </div>

          <!-- If preset: show covered access types as pills -->
          <div
            v-if="isPreset && props.item?.preset?.access_types?.length"
            class="mt-2 flex flex-wrap gap-1"
          >
            <va-chip
              v-for="accessType in props.item.preset.access_types"
              :key="accessType.id"
              size="small"
              color="secondary"
              class="text-xs"
            >
              {{ accessType.name }}
            </va-chip>
          </div>

          <!-- Requester's asked expiry note -->
          <div
            v-if="requestedUntilNote"
            class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic"
          >
            {{ requestedUntilNote }}
          </div>
        </div>

        <!-- Decision toggle buttons -->
        <div class="flex gap-2 flex-shrink-0">
          <button
            @click="emit('update:decision', 'APPROVED')"
            :class="[
              'px-3 py-1.5 rounded text-sm font-medium transition-all duration-200 flex items-center gap-1.5',
              props.decision === 'APPROVED'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-green-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-green-900/40',
            ]"
            aria-label="Approve this item"
          >
            <i-mdi-check class="text-base" />
            <span>Approve</span>
          </button>
          <button
            @click="emit('update:decision', 'REJECTED')"
            :class="[
              'px-3 py-1.5 rounded text-sm font-medium transition-all duration-200 flex items-center gap-1.5',
              props.decision === 'REJECTED'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-red-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-red-900/40',
            ]"
            aria-label="Reject this item"
          >
            <i-mdi-close class="text-base" />
            <span>Reject</span>
          </button>
        </div>
      </div>

      <!-- Expiry override (shown only if approved) -->
      <Transition name="fade-slide">
        <div
          v-if="props.decision === 'APPROVED'"
          class="pt-2 border-t border-gray-200 dark:border-gray-700"
        >
          <p
            class="text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2"
          >
            Approved expiry
          </p>
          <ExpirySelector v-model="expiryModel" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import ExpirySelector from "@/components/v2/grants/issue/ExpirySelector.vue";
import * as datetime from "@/services/datetime";
import { computed } from "vue";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  decision: {
    type: String,
    default: null,
    validator: (v) => v === null || v === "APPROVED" || v === "REJECTED",
  },
  approvedExpiry: {
    type: Object,
    default: () => ({ type: "never", value: null }),
  },
});

const emit = defineEmits(["update:decision", "update:approvedExpiry"]);

const isPreset = computed(() => !!props.item?.preset_id);

const itemName = computed(() => {
  if (isPreset.value) {
    return props.item?.preset?.name || `Preset ${props.item?.preset_id}`;
  }
  return (
    props.item?.access_type?.name || `Access Type ${props.item?.access_type_id}`
  );
});

const itemDescription = computed(() => {
  if (isPreset.value) {
    return props.item?.preset?.description || "";
  }
  return props.item?.access_type?.description || "";
});

const requestedUntilNote = computed(() => {
  if (!props.item?.requested_until) {
    return "Requester asked for: never expires";
  }
  const date = new Date(props.item.requested_until);
  return `Requester asked for: expires ${datetime.displayDate(date)}`;
});

const expiryModel = computed({
  get() {
    return props.approvedExpiry;
  },
  set(value) {
    emit("update:approvedExpiry", value);
  },
});
</script>
