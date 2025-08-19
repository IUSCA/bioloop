<template>
  <div>
    <VaPopover :disabled="!disabled" :message="reason">
      <va-button
        :disabled="disabled"
        class="w-full"
        color="primary"
        border-color="primary"
        preset="secondary"
        @click="visible = !visible"
      >
        <i-mdi-orbit-variant class="pr-2 text-2xl" /> New Conversion
      </va-button>
    </VaPopover>

    <va-modal
      :model-value="visible"
      title="New Conversion"
      @ok="convert_dataset"
      @cancel="close"
      ok-text="Convert"
      fixed-layout
    >
      <div class="min-h-[calc(100vh-15rem)]">
        <ConversionForm
          v-model:definition="definition"
          v-model:argValues="argValues"
        />
      </div>
    </va-modal>
  </div>
</template>

<script setup>
import conversionService from "@/services/conversions";
import toast from "@/services/toast";
const props = defineProps({
  dataset: Object,
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);
const definition = ref();
const argValues = ref([]);

function convert_dataset() {
  loading.value = true;
  conversionService
    .create({
      definition_id: definition.value.id,
      dataset_id: props.dataset.id,
      argument_values: argValues.value,
    })
    .then(() => {
      emit("update");
    })
    .catch((err) => {
      console.error(err);
      toast.error("Failed to convert dataset");
      if (err.response.data) {
        toast.error(err.response.data.message);
      }
    })
    .finally(() => {
      loading.value = false;
      visible.value = false;
    });
}

function close() {
  visible.value = false;
  definition.value = null;
  argValues.value = [];
}

const disabled = computed(() => {
  return !props.dataset.is_staged;
});

const reason = computed(() => {
  if (!props.dataset.is_staged) {
    return "Please stage the dataset first";
  }
  return "";
});
</script>

