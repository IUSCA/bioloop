<template>
  <va-modal
    v-model="visible"
    :title="`Edit ${config.dataset.types[props.data?.type]?.label} / ${
      props.data?.name
    }`"
    no-outside-dismiss
    fixed-layout
    size="small"
    ok-text="Edit"
    @ok="handleOk"
    @cancel="hide"
  >
    <va-inner-loading :loading="loading">
      <div>
        <va-textarea
          label="Description"
          v-model="description"
          class="w-full"
          :min-rows="3"
          :max-rows="10"
          resize
        >
        </va-textarea>
      </div>
    </va-inner-loading>
  </va-modal>
</template>

<script setup>
import config from "@/config";
import DatasetService from "@/services/dataset";
import toast from "@/services/toast";

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
