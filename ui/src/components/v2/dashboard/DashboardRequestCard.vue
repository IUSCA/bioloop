<template>
  <button
    type="button"
    class="w-full text-left rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/50 p-4 hover:shadow-md transition"
    @click="onClick"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span
            class="text-sm font-semibold text-slate-900 dark:text-white truncate"
          >
            {{
              request.resource?.name ||
              request.resource?.slug ||
              "Untitled resource"
            }}
          </span>
          <span
            class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {{ request.status }}
          </span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
          Requested by {{ request.requester?.name || request.requester?.email }}
        </p>
      </div>
      <div class="text-right text-xs text-slate-500 dark:text-slate-400">
        {{ datetime.displayDateTime(request.created_at) }}
      </div>
    </div>

    <div
      v-if="request.purpose"
      class="mt-3 text-sm text-slate-600 dark:text-slate-300"
    >
      <span class="font-semibold">Purpose:</span> {{ request.purpose }}
    </div>
  </button>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  request: { type: Object, required: true },
});

const emit = defineEmits(["view"]);

function onClick() {
  emit("view", props.request);
}
</script>
