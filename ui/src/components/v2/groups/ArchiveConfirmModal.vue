<template>
  <VaModal
    :model-value="props.modelValue"
    :title="props.unarchive ? 'Unarchive Group' : 'Archive Group'"
    size="small"
    ok-text="Confirm"
    cancel-text="Cancel"
    :ok-color="props.unarchive ? 'success' : 'danger'"
    :loading="props.loading"
    @update:model-value="emit('update:modelValue', $event)"
    @ok="emit('confirm')"
    @cancel="emit('update:modelValue', false)"
  >
    <div class="flex items-start gap-3">
      <i-mdi-alert-circle-outline
        class="text-2xl shrink-0 mt-0.5"
        :class="props.unarchive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
      />
      <div>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <template v-if="props.unarchive">
            Are you sure you want to <strong>unarchive</strong>
            <span class="font-semibold"> {{ props.groupName }}</span>?
            The group will become active again.
          </template>
          <template v-else>
            Are you sure you want to <strong>archive</strong>
            <span class="font-semibold"> {{ props.groupName }}</span>?
            The group will be soft-deleted and hidden from normal views.
            This action can be reversed by a platform admin.
          </template>
        </p>
      </div>
    </div>
  </VaModal>
</template>

<script setup>
const props = defineProps({
  /** Whether the modal is visible. */
  modelValue: { type: Boolean, required: true },
  /** Name of the group being archived/unarchived. */
  groupName: { type: String, default: '' },
  /** If true, shows unarchive wording. */
  unarchive: { type: Boolean, default: false },
  /** Show loading state on confirm button. */
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'confirm'])
</script>
