<template>
  <va-modal
    v-model="visible"
    :title="`Edit ${props.data?.type}: ${props.data?.name}`"
    no-outside-dismiss
    fixed-layout
    ok-text="Edit"
    @ok="handleOk"
    @cancel="hide"
  >
    <va-inner-loading :loading="loading">
      <div class="w-96">
        <va-input
          type="textarea"
          label="Description"
          v-model="description"
          class="w-full"
          :min-rows="3"
          :max-rows="10"
        >
        </va-input>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import DatasetService from "@/services/dataset";
import { useToastStore } from "@/stores/toast";
const toast = useToastStore();

const props = defineProps(["data"]);
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const visible = ref(false);
const loading = ref(false);
const description = ref(props.data.description);

function hide() {
  loading.value = false;
  visible.value = false;
}

function show() {
  visible.value = true;
}

function handleOk() {
  loading.value = true;

  DatasetService.update({
    id: props.data.id,
    updated_data: {
      description: description.value,
    },
  })
    .then(() => {
      emit("update");
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to update the dataset");
    })
    .finally(() => {
      hide();
    });
}
</script>
