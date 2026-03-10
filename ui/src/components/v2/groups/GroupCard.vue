<template>
  <VaCard
    class="group cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-600"
    @click="router.push(`/v2/groups/${props.group.id}`)"
  >
    <VaCardContent class="h-full">
      <div class="flex flex-col gap-2.5 h-full">
        <!-- Header: name + role badge -->
        <div class="flex-shrink-0 flex items-start gap-4">
          <!-- Icon -->
          <i-mdi-account-group
            class="shrink-0 w-9 h-9 rounded-lg p-1.5"
            :class="typeColor"
          />

          <!-- Name + type -->
          <div class="flex-1 min-w-0">
            <h3
              class="text-sm font-semibold leading-tight truncate text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
              :title="group.name"
            >
              {{ group.name }}
            </h3>
            <p
              v-if="props.group.metadata?.type"
              class="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 capitalize"
            >
              {{ props.group.metadata?.type }}
            </p>
          </div>

          <!-- Role badge -->
          <span
            :class="roleColor"
            class="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide"
          >
            <Icon :icon="roleIcon" class="text-sm" />
            {{ props.group.user_role }}
          </span>
        </div>

        <!-- Description -->
        <div class="flex-1 min-h-0">
          <p
            class="text-xs leading-relaxed line-clamp-2 text-slate-500 dark:text-slate-400"
          >
            {{ group.description }}
          </p>
        </div>

        <!-- Footer -->
        <div
          class="flex-shrink-0 flex items-center gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800"
        >
          <!-- Member count -->
          <span
            class="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500"
          >
            <i-mdi-account-multiple class="text-xs" />
            {{ maybePluralize(group.size, "member") }}
          </span>

          <!-- Contributions status -->
          <span
            v-if="group.is_archived"
            class="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-600"
          >
            <i-mdi-lock-outline class="text-xs" />
            Archived
          </span>

          <!-- Arrow hint -->
          <i-mdi-arrow-right
            class="ml-auto text-sm text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-all duration-200 group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
import { maybePluralize } from "@/services/utils";

const router = useRouter();

const props = defineProps({
  /** A group object from the API. */
  group: { type: Object, required: true },
});

const roleColor = computed(() => {
  switch (props.group.user_role) {
    case "ADMIN":
      return "text-amber-500 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-400/10";
    case "MEMBER":
      return "text-sky-500 bg-sky-500/10 dark:text-sky-400 dark:bg-sky-400/10";
    default:
      return "text-slate-500 bg-slate-500/10 dark:text-slate-400 dark:bg-slate-400/10";
  }
});

const roleIcon = computed(() => {
  switch (props.group.user_role) {
    case "ADMIN":
      return "mdi-shield-crown-outline";
    case "MEMBER":
      return "mdi-account-check-outline";
    case "OVERSIGHT":
      return "mdi-eye-outline";
    default:
      return "mdi-account-outline";
  }
});

const typeColor = computed(() => {
  switch (props.group.metadata?.type) {
    case "lab":
      return "text-teal-600 bg-teal-100 dark:text-teal-300 dark:bg-teal-900/40";
    case "project":
      return "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-900/40";
    case "center":
      return "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/40";
    case "core":
      return "text-rose-600 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40";
    default:
      return "text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/40";
  }
});
</script>

<style scoped>
.group {
  --va-card-padding: 1rem;
}
</style>
