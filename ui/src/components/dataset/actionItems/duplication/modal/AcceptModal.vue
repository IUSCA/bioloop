<template>
  <va-modal
    blur
    v-model="showModal"
    @before-close="clearModalInput"
    hide-default-actions
  >
    <duplication-modal-header :dataset="props.dataset" />

    <va-divider class="my-4" />

    <ul class="va-unordered va-text-secondary mt-3">
      <li>
        The original dataset
        <b>{{ originalDatasetName }}</b>
        will be soft-deleted (marked as overwritten) and this incoming dataset
        will take its place under the original name.
      </li>
      <li>
        This operation is
        <span class="va-text-bold va-text-danger">irreversible</span>.
      </li>
    </ul>

    <va-divider class="my-4" />

    <div class="flex flex-col" data-testid="accept-duplicate-modal">
      <p>To confirm, type "<b>{{ originalDatasetName }}</b>" in the box below</p>
      <va-input
        data-testid="accept-name-input"
        v-model="modalInput"
        class="my-2 w-full"
        :disabled="props.areControlsDisabled"
      />
      <va-button
        data-testid="accept-confirm-btn"
        color="danger"
        :disabled="
          modalInput !== originalDatasetName || props.areControlsDisabled
        "
        @click="
          () => {
            emit('confirm');
            emit('update:showModal', false);
          }
        "
      >
        Accept and overwrite original
      </va-button>
    </div>
  </va-modal>
</template>

<script setup>
import DuplicationModalHeader from "@/components/dataset/actionItems/duplication/modal/ModalHeader.vue";

const props = defineProps({
  showModal: { type: Boolean, required: true },
  dataset: { type: Object, default: null },
  duplication: { type: Object, default: null },
  areControlsDisabled: { type: Boolean, required: true },
});

const emit = defineEmits(["confirm", "update:showModal"]);

const modalInput = ref("");

const originalDatasetName = computed(
  () => props.duplication?.original_dataset?.name ?? "",
);

const showModal = computed({
  get() {
    return props.showModal;
  },
  set(newValue) {
    emit("update:showModal", newValue);
  },
});

const clearModalInput = () => {
  modalInput.value = "";
};
</script>
