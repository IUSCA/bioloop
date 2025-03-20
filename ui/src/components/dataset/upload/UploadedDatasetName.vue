<template>
  <va-input
    v-model="localDatasetName"
    :placeholder="'Dataset name'"
    class="w-full"
    :messages="'Name for the uploaded dataset'"
    :disabled="isInputDisabled"
  >
    <template #append v-if="props.selectingDirectory">
      <div class="flex gap-2">
        <va-button
          :icon="isEditing ? 'check' : 'edit'"
          size="small"
          @click="handleEditToggle"
        />
        <CopyButton :text="localDatasetName" preset="secondary" />
      </div>
    </template>
  </va-input>

  <div class="va-text-danger text-xs" v-if="props.datasetNameError">
    {{ props.datasetNameErrorMessages }}
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  datasetName: {
    type: String,
    default: "",
  },
  datasetNameInput: {
    type: String,
    default: "",
  },
  inputDisabled: {
    type: Boolean,
    default: false,
  },
  selectingFiles: {
    type: Boolean,
    default: false,
  },
  selectingDirectory: {
    type: Boolean,
    default: false,
  },
  datasetNameError: {
    type: Boolean,
    default: false,
  },
  datasetNameErrorMessages: {
    type: String,
    default: "",
  },
});

const emit = defineEmits(["update:datasetNameInput", "update:datasetName"]);

const isEditing = ref(false);
const localDatasetName = ref(props.selectingDirectory ? props.datasetName : props.datasetNameInput);

const isInputDisabled = computed(() => {
  return props.selectingDirectory ? !isEditing.value : props.inputDisabled;
});

watch(() => props.datasetName, (newValue) => {
  if (props.selectingDirectory && !isEditing.value) {
    localDatasetName.value = newValue;
  }
});

watch(() => props.datasetNameInput, (newValue) => {
  if (!props.selectingDirectory) {
    localDatasetName.value = newValue;
  }
});

watch(localDatasetName, (newValue) => {
  // if (props.selectingDirectory) {
  //   emit("update:datasetName", newValue);
  // } else {
    emit("update:datasetNameInput", newValue);
  // }
});

const handleEditToggle = () => {
  if (props.selectingDirectory) {
    isEditing.value = !isEditing.value;
    if (!isEditing.value) {
      // After editing, propagate updated dataset name
      emit("update:datasetNameInput", localDatasetName.value);
    }
  }
};
</script>
