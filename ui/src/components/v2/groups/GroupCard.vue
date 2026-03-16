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
          <GroupIcon :group="props.group" class="shrink-0" />

          <!-- Name + type -->
          <div class="flex-1 min-w-0">
            <h3
              class="font-semibold leading-tight truncate text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"
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
          <GroupMemberRoleBadge
            :role-name="props.group.user_role"
            v-if="props.group.user_role"
          />
        </div>

        <!-- Description -->
        <div class="flex-1 min-h-0">
          <p
            class="text-sm leading-relaxed line-clamp-2 text-slate-500 dark:text-slate-400"
          >
            {{ group.description }}
          </p>
        </div>

        <!-- Footer -->
        <div
          class="flex-shrink-0 flex items-center gap-3 pt-1.5 border-solid border-t border-slate-100 dark:border-slate-800"
        >
          <!-- Member count -->
          <span
            class="inline-flex items-center gap-1 text-sm text-slate-400 dark:text-slate-500"
          >
            <i-mdi-account-multiple class="text-sm" />
            {{
              maybePluralize(group.size, "member", {
                formatter: number_formatter.format,
              })
            }}
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

const number_formatter = Intl.NumberFormat("en", { notation: "compact" });
</script>

<style scoped>
.group {
  --va-card-padding: 1rem;
}
</style>
