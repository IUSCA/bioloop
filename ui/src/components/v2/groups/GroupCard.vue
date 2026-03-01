<template>
  <VaCard
    class="cursor-pointer hover:shadow-md transition-shadow"
    @click="router.push(`/v2/groups/${props.group.id}`)"
  >
    <VaCardContent>
      <div class="flex items-start justify-between gap-2">
        <!-- Icon + name + description -->
        <div class="flex items-center gap-2 min-w-0">
          <i-mdi-account-group class="text-xl shrink-0" style="color: var(--va-primary)" />
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {{ props.group.name }}
            </p>
            <p
              v-if="props.group.description"
              class="text-xs truncate mt-0.5"
              style="color: var(--va-secondary)"
            >
              {{ props.group.description }}
            </p>
          </div>
        </div>

        <!-- Right-side badges -->
        <div class="flex flex-col items-end gap-1 shrink-0">
          <!-- Archived badge -->
          <VaChip v-if="props.group.is_archived" color="secondary" size="small">
            Archived
          </VaChip>
          <!-- Authority badge -->
          <VaChip v-if="props.authorityLabel" :color="authorityColor" size="small">
            {{ props.authorityLabel }}
          </VaChip>
        </div>
      </div>

      <!-- Footer: member count -->
      <div v-if="props.group.member_count != null" class="mt-3 flex items-center gap-1 text-xs" style="color: var(--va-secondary)">
        <i-mdi-account-multiple-outline class="text-sm" />
        {{ props.group.member_count }} {{ props.group.member_count === 1 ? 'member' : 'members' }}
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const router = useRouter()

const props = defineProps({
  /** A group object from the API. */
  group: { type: Object, required: true },
  /**
   * Authority label to display alongside the group name.
   * One of: 'Member' | 'Admin' | 'Oversight' | 'Platform Admin' | null
   */
  authorityLabel: { type: String, default: null },
})

const authorityColorMap = {
  'Admin': 'primary',
  'Platform Admin': 'danger',
  'Oversight': 'warning',
  'Member': 'secondary',
}

const authorityColor = computed(
  () => authorityColorMap[props.authorityLabel] ?? 'secondary',
)
</script>
