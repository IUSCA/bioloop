<template>
  <VaModal
    :model-value="props.modelValue"
    title="Add Member"
    size="medium"
    ok-text="Add"
    cancel-text="Cancel"
    :ok-disabled="!selectedUser"
    :loading="props.loading"
    @update:model-value="emit('update:modelValue', $event)"
    @ok="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="flex flex-col gap-4">
      <!-- Search input -->
      <VaInput
        v-model="searchQuery"
        placeholder="Search by name or username…"
        clearable
        @update:model-value="onSearchInput"
      >
        <template #prepend>
          <i-mdi-magnify class="text-lg" style="color: var(--va-secondary)" />
        </template>
      </VaInput>

      <!-- Results list -->
      <div class="max-h-64 overflow-y-auto flex flex-col gap-1">
        <!-- Loading -->
        <div v-if="searching" class="flex items-center justify-center py-6">
          <VaProgressCircle indeterminate size="32" />
        </div>

        <!-- Empty search -->
        <div
          v-else-if="searchQuery.trim().length > 0 && results.length === 0"
          class="flex flex-col items-center py-6 gap-1 text-center"
        >
          <i-mdi-account-search class="text-3xl text-gray-300 dark:text-gray-600" />
          <p class="text-sm" style="color: var(--va-secondary)">No users found.</p>
        </div>

        <!-- Result rows -->
        <button
          v-for="user in results"
          :key="user.id"
          type="button"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors w-full"
          :class="
            selectedUser?.id === user.id
              ? 'bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-300 dark:border-blue-700'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
          "
          @click="selectedUser = user"
        >
          <i-mdi-account-circle class="text-2xl shrink-0" style="color: var(--va-secondary)" />
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {{ user.name ?? user.username }}
            </p>
            <p class="text-xs truncate" style="color: var(--va-secondary)">{{ user.username }}</p>
          </div>
        </button>
      </div>

      <!-- Selected user confirmation -->
      <div
        v-if="selectedUser"
        class="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-200 dark:border-blue-800"
      >
        <i-mdi-check-circle class="text-base text-blue-600 dark:text-blue-400 shrink-0" />
        <p class="text-sm text-blue-800 dark:text-blue-300">
          Will add <strong>{{ selectedUser.name ?? selectedUser.username }}</strong>
        </p>
      </div>
    </div>
  </VaModal>
</template>

<script setup>
import UserServiceRaw from '@/services/user'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'add'])

const searchQuery = ref('')
const results = ref([])
const searching = ref(false)
const selectedUser = ref(null)

// Debounce search by 400 ms
const debouncedSearch = useDebounceFn(async (query) => {
  if (!query.trim()) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const { users } = await UserServiceRaw.getAll({ search: query.trim(), take: 20 })
    results.value = users ?? []
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}, 400)

function onSearchInput(val) {
  selectedUser.value = null
  debouncedSearch(val)
}

function handleConfirm() {
  if (selectedUser.value) {
    emit('add', selectedUser.value)
  }
}

function handleCancel() {
  reset()
  emit('update:modelValue', false)
}

function reset() {
  searchQuery.value = ''
  results.value = []
  selectedUser.value = null
}

// Reset when modal opens
watch(
  () => props.modelValue,
  (open) => {
    if (open) reset()
  },
)
</script>
