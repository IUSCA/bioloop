<template>
  <button
    type="button"
    class="w-full text-left rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/50 p-4 hover:shadow-md transition"
    @click="onClick"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p
          class="text-sm font-semibold text-slate-900 dark:text-white truncate"
        >
          {{ displaySubject }}
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
          {{ grant.access_type?.name || grant.access_type_id }}
          · {{ grant.resource?.name || grant.resource?.id }}
        </p>
      </div>
      <div class="text-right text-xs text-slate-500 dark:text-slate-400">
        Expires {{ expiresIn }}
      </div>
    </div>
  </button>
</template>

<script setup>
import dayjs from "dayjs";

const props = defineProps({
  grant: { type: Object, required: true },
});

const emit = defineEmits(["view"]);

const displaySubject = computed(() => {
  if (!props.grant) return "";
  if (props.grant.subject?.name) return props.grant.subject.name;
  if (props.grant.subject?.id) return props.grant.subject.id;
  return "Grant";
});

const expiresIn = computed(() => {
  if (!props.grant.valid_until) return "Never";
  const until = dayjs(props.grant.valid_until);
  if (!until.isValid()) return "Unknown";
  const diff = until.diff(dayjs(), "day");
  if (diff <= 0) return "Today";
  return `${diff}d`;
});

function onClick() {
  emit("view", props.grant);
}
</script>
