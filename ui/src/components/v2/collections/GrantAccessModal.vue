<template>
  <VaModal
    :model-value="props.modelValue"
    title="Grant Access"
    size="medium"
    ok-text="Grant"
    cancel-text="Cancel"
    :ok-disabled="!canSubmit"
    :loading="props.loading"
    @update:model-value="emit('update:modelValue', $event)"
    @ok="handleConfirm"
    @cancel="handleCancel"
  >
    <div class="flex flex-col gap-4">
      <!-- Subject type toggle -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide mb-2" style="color: var(--va-secondary)">
          Grant to
        </p>
        <div class="flex gap-2">
          <VaChip
            :color="form.subjectType === 'USER' ? 'primary' : 'secondary'"
            class="cursor-pointer"
            @click="form.subjectType = 'USER'; form.subject = null"
          >
            <i-mdi-account-outline class="mr-1" /> User
          </VaChip>
          <VaChip
            :color="form.subjectType === 'GROUP' ? 'primary' : 'secondary'"
            class="cursor-pointer"
            @click="form.subjectType = 'GROUP'; form.subject = null"
          >
            <i-mdi-account-group-outline class="mr-1" /> Group
          </VaChip>
        </div>
      </div>

      <!-- Subject search -->
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color: var(--va-secondary)">
          {{ form.subjectType === 'USER' ? 'Select User' : 'Select Group' }}
        </p>
        <VaInput
          v-model="subjectSearch"
          :placeholder="form.subjectType === 'USER' ? 'Search users…' : 'Search groups…'"
          clearable
          @update:model-value="debouncedSubjectSearch"
        >
          <template #prepend>
            <i-mdi-magnify class="text-lg" style="color: var(--va-secondary)" />
          </template>
        </VaInput>

        <!-- Results -->
        <div class="max-h-40 mt-2 overflow-y-auto flex flex-col gap-1">
          <div v-if="subjectSearching" class="flex items-center justify-center py-4">
            <VaProgressCircle indeterminate size="28" />
          </div>
          <button
            v-for="item in subjectResults"
            :key="item.id"
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded text-left text-sm w-full transition-colors"
            :class="
              form.subject?.id === item.id
                ? 'bg-blue-50 dark:bg-blue-900/30 border border-solid border-blue-300 dark:border-blue-700'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            "
            @click="form.subject = item"
          >
            <i-mdi-account-circle v-if="form.subjectType === 'USER'" class="text-xl shrink-0" style="color: var(--va-secondary)" />
            <i-mdi-account-group v-else class="text-xl shrink-0" style="color: var(--va-secondary)" />
            <span class="truncate text-gray-800 dark:text-gray-200">
              {{ item.name ?? item.username ?? item.label ?? item.id }}
            </span>
          </button>
        </div>
      </div>

      <!-- Access type -->
      <VaSelect
        v-model="form.accessTypeId"
        label="Access Type"
        :options="accessTypeOptions"
        value-by="value"
        text-by="label"
        placeholder="Select access type…"
        :loading="accessTypesLoading"
      />

      <!-- Optional expiry date -->
      <VaDateInput
        v-model="form.validUntil"
        label="Valid Until (optional)"
        clearable
        :min="tomorrow"
      />
    </div>
  </VaModal>
</template>

<script setup>
import UserServiceRaw from '@/services/user'
import GrantService from '@/services/v2/grants'
import GroupService from '@/services/v2/groups'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'grant'])

const form = reactive({
  subjectType: 'USER',
  subject: null,
  accessTypeId: null,
  validUntil: null,
})

// ── Access types ──────────────────────────────────────────────────────────
const accessTypes = ref([])
const accessTypesLoading = ref(false)
const accessTypeOptions = computed(() =>
  accessTypes.value.map((t) => ({ label: t.name ?? t.id, value: t.id })),
)

// ── Subject search ────────────────────────────────────────────────────────
const subjectSearch = ref('')
const subjectResults = ref([])
const subjectSearching = ref(false)

const debouncedSubjectSearch = useDebounceFn(async (query) => {
  if (!query?.trim()) { subjectResults.value = []; return }
  subjectSearching.value = true
  try {
    if (form.subjectType === 'USER') {
      const { users } = await UserServiceRaw.getAll({ search: query.trim(), take: 20 })
      subjectResults.value = users ?? []
    } else {
      const { data: { data: results } } = await GroupService.search({ search_term: query.trim(), limit: 20 })
      subjectResults.value = results
    }
  } catch {
    subjectResults.value = []
  } finally {
    subjectSearching.value = false
  }
}, 400)

const tomorrow = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
})

const canSubmit = computed(
  () => form.subject && form.accessTypeId,
)

function handleConfirm() {
  if (!canSubmit.value) return
  emit('grant', {
    subject_type: form.subjectType,
    subject_id: form.subject.id,
    access_type_id: form.accessTypeId,
    valid_until: form.validUntil ? form.validUntil.toISOString() : undefined,
  })
}

function handleCancel() {
  emit('update:modelValue', false)
}

function reset() {
  form.subjectType = 'USER'
  form.subject = null
  form.accessTypeId = null
  form.validUntil = null
  subjectSearch.value = ''
  subjectResults.value = []
}

async function loadAccessTypes() {
  accessTypesLoading.value = true
  try {
    const { data } = await GrantService.listAccessTypes()
    accessTypes.value = Array.isArray(data) ? data : (data.access_types ?? [])
  } catch {
    accessTypes.value = []
  } finally {
    accessTypesLoading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reset()
      loadAccessTypes()
    }
  },
)
</script>
