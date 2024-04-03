<template>
  <va-modal
    blur
    v-model="showModal"
    @before-close="clearModalInput"
    hide-default-actions
  >
    <modal-header :dataset="associatedDataset"></modal-header>

    <va-divider class="my-4" />

    <ul class="va-unordered va-text-secondary mt-3">
      <li>
        This will delete the current contents of
        <span class="path bg-slate-200 dark:bg-slate-800">
          {{ associatedDataset.origin_path }} </span
        >.
      </li>
      <li>
        This operation is
        <span class="va-text-bold va-text-danger">irreversible</span>.
      </li>
    </ul>

    <va-divider class="my-4" />

    <div class="flex flex-col">
      <p>To confirm, type "{{ associatedDataset.name }}" in the box below</p>
      <va-input
        v-model="modalInput"
        class="my-2 w-full"
        :disabled="props.areControlsDisabled"
      />
      <va-button
        color="danger"
        :disabled="
          modalInput !== associatedDataset.name || props.areControlsDisabled
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
import ModalHeader from "@/components/dataset/actionItems/duplication/modal/ModalHeader.vue";

const props = defineProps({
  showModal: {
    type: Boolean,
    required: true,
  },
  actionItem: {
    type: Object,
    required: true,
  },
  areControlsDisabled: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(["confirm", "update:showModal"]);

const modalInput = ref("");

const associatedDataset = computed(() => props.actionItem.dataset);

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

<style scoped></style>
