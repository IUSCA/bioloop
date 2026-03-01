<template>
  <VaCard
    class="cursor-pointer hover:shadow-md transition-shadow"
    @click="router.push(`/v2/collections/${props.collection.id}`)"
  >
    <VaCardContent>
      <div class="flex items-start justify-between gap-2">
        <!-- Icon + name + description -->
        <div class="flex items-center gap-2 min-w-0">
          <i-mdi-folder-multiple class="text-xl shrink-0" style="color: var(--va-primary)" />
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {{ props.collection.name }}
            </p>
            <p
              v-if="props.collection.description"
              class="text-xs truncate mt-0.5"
              style="color: var(--va-secondary)"
            >
              {{ props.collection.description }}
            </p>
          </div>
        </div>
        <VaChip v-if="props.collection.is_archived" color="secondary" size="small" class="shrink-0">
          Archived
        </VaChip>
      </div>

      <!-- Owner group -->
      <div
        v-if="props.collection.owner_group?.name"
        class="mt-3 flex items-center gap-1 text-xs"
        style="color: var(--va-secondary)"
      >
        <i-mdi-account-group-outline class="text-sm" />
        {{ props.collection.owner_group.name }}
      </div>
    </VaCardContent>
  </VaCard>
</template>

<script setup>
const router = useRouter()

const props = defineProps({
  collection: { type: Object, required: true },
})
</script>
