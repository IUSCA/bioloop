<template>
  <VaCollapse
    header="Why do I have access?"
    icon="mdi-help-circle-outline"
  >
    <template #header>
      <div class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        <i-mdi-help-circle-outline class="text-lg" style="color: var(--va-info)" />
        Why do I have access?
      </div>
    </template>

    <div class="pt-2 pb-1 flex flex-col gap-4">
      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center py-6">
        <VaProgressCircle indeterminate size="32" />
      </div>

      <!-- No access -->
      <div
        v-else-if="!loading && explanation.length === 0"
        class="flex flex-col items-center py-4 text-center gap-1"
      >
        <i-mdi-lock-outline class="text-3xl text-gray-300 dark:text-gray-600" />
        <p class="text-sm" style="color: var(--va-secondary)">
          You do not currently have an active grant on this resource.
        </p>
      </div>

      <!-- Explanation paths -->
      <div v-else class="flex flex-col gap-3">
        <div
          v-for="(path, idx) in explanation"
          :key="idx"
          class="rounded-lg border border-solid border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2"
        >
          <!-- Access type badge -->
          <div class="flex items-center gap-2">
            <VaChip color="info" size="small">{{ path.access_type?.name ?? path.access_type_id }}</VaChip>
            <span v-if="path.valid_until" class="text-xs" style="color: var(--va-secondary)">
              valid until {{ new Date(path.valid_until).toLocaleDateString() }}
            </span>
            <span v-else class="text-xs" style="color: var(--va-secondary)">no expiry</span>
          </div>

          <!-- Path chain -->
          <div class="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
            <div v-if="path.grant_via_collection" class="flex items-center gap-1">
              <i-mdi-folder-multiple-outline class="text-sm shrink-0" />
              Via collection:
              <RouterLink
                :to="`/v2/collections/${path.grant_via_collection.id}`"
                class="hover:underline"
                style="color: var(--va-primary)"
              >
                {{ path.grant_via_collection.name }}
              </RouterLink>
            </div>
            <div v-if="path.granted_to_group" class="flex items-center gap-1">
              <i-mdi-account-group-outline class="text-sm shrink-0" />
              Granted to group:
              <RouterLink
                :to="`/v2/groups/${path.granted_to_group.id}`"
                class="hover:underline"
                style="color: var(--va-primary)"
              >
                {{ path.granted_to_group.name }}
              </RouterLink>
            </div>
            <div v-if="path.membership_via" class="flex items-center gap-1">
              <i-mdi-account-check-outline class="text-sm shrink-0" />
              Your membership via: {{ path.membership_via }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </VaCollapse>
</template>

<script setup>
import GrantService from '@/services/v2/grants'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  /** 'DATASET' or 'COLLECTION' */
  resourceType: { type: String, required: true },
  /** Resource ID */
  resourceId: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const explanation = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data: { data: items } } = await GrantService.list({
      resource_type: props.resourceType,
      resource_id: props.resourceId,
      subject_type: 'USER',
      subject_id: auth.user?.id,
      active_only: true,
    })
    explanation.value = items
  } catch {
    explanation.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
