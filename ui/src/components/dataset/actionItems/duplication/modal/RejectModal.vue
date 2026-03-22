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
        The incoming duplicate dataset
        <b>{{ props.dataset?.name }}</b>
        will be soft-deleted and permanently excluded from the system.
      </li>
      <li>
        This operation is
        <span class="va-text-bold va-text-danger">irreversible</span>.
      </li>
    </ul>

    <va-divider class="my-4" />

    <div class="flex flex-col" data-testid="reject-duplicate-modal">
      <p>To confirm, type "<b>{{ props.dataset?.name }}</b>" in the box below</p>
      <va-input
        data-testid="reject-name-input"
        v-model="modalInput"
        class="my-2 w-full"
        :disabled="props.areControlsDisabled"
      />
      <va-button
        data-testid="reject-confirm-btn"
        color="danger"
        :disabled="
          modalInput !== props.dataset?.name || props.areControlsDisabled
        "
        @click="
          () => {
            emit('confirm');
            emit('update:showModal', false);
          }
        "
      >
        Reject duplicate dataset
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
