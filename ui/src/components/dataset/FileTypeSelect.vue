<template>
  <!--    :class="props.class"-->
  <va-select
    class="w-full"
    v-model="_modelValue"
    label="File Type"
    placeholder="Select File Type"
    :options="props.fileTypeList"
    :text-by="(option) => option.name"
    :track-by="(option) => option"
    :clearable="props.clearable"
  >
    <template #content="{ value }">
      <va-chip class="mr-2" key="name" size="small">
        {{ value.name }}
      </va-chip>
      <va-chip class="mr-2" key="extension" size="small">
        {{ value.extension }}
      </va-chip>
    </template>

    <!--    <div >-->
    <template #append v-if="props.allowCreateNew">
      <va-popover message="Create New File Type">
        <va-button
          class="ml-3"
          icon="add"
          color="success"
          @click="setModalVisibility(true)"
        >
          Create New File Type
        </va-button>
      </va-popover>
    </template>
    <!--    </div>-->
  </va-select>

  <va-form ref="createNewFileTypeForm">
    <va-modal
      v-model="isModalVisible"
      ok-text="Create"
      no-dismiss
      :before-cancel="beforeModalCancel"
      :before-ok="beforeModalOk"
      @ok="onModalOk"
    >
      <div class="flex flex-col gap-6">
        <va-input
          name="new_file_type_name"
          v-model="newFileTypeName"
          label="File Type Name"
          placeholder="Name"
          @input="showFormWideErrors = false"
          :rules="[
            (value) => (value && value.length > 0) || 'Name is required',
            (value) => (value && value.length > 2) || 'Name is too short',
          ]"
        ></va-input>
        <va-input
          name="new_file_type_extension"
          v-model="newFileTypeExtension"
          label="File Type Extension"
          placeholder="Extension"
          @input="showFormWideErrors = false"
          :rules="[
            (value) => (value && value.length > 0) || 'Extension is required',
            (value) => (value && value.length > 2) || 'Extension is too short',
          ]"
        ></va-input>

        <div v-if="showFormWideErrors" class="duplicate_file_type_alert">
          <va-alert
            v-for="(error, i) in formWideErrors"
            :key="i"
            class="w-full"
            color="danger"
            dense
            border="left"
          >
            {{ error }}
          </va-alert>
        </div>
      </div>
    </va-modal>
  </va-form>
</template>

<script setup>
import { useForm } from "vuestic-ui";

const props = defineProps({
  modelValue: {
    type: Object,
  },
  fileTypeList: {
    type: Array,
    default: () => [],
  },
  allowCreateNew: {
    type: Boolean,
    default: false,
  },
  clearable: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["update:modelValue", "fileTypeCreated"]);

const _modelValue = computed({
  get() {
    return props.modelValue;
  },
  set(newValue) {
    emit("update:modelValue", newValue);
  },
});

const { isValid, validate, reset } = useForm("createNewFileTypeForm");

const isModalVisible = ref(false);
const showFormWideErrors = ref(false);
const newFileTypeName = ref("");
const newFileTypeExtension = ref("");

// errors pertaining to the entire form, and not specific fields
const formWideErrors = computed(() => {
  let formErrors = [];
  const isDuplicateFileType =
    props.fileTypeList.find(
      (e) =>
        e.name === newFileTypeName.value &&
        e.extension === newFileTypeExtension.value,
    ) !== undefined;
  if (isDuplicateFileType) {
    formErrors.push(
      `File Type with name '${newFileTypeName.value}', extension '${newFileTypeExtension.value}' already exists`,
    );
  }
  return formErrors;
});

const beforeModalCancel = (hide) => {
  resetModalFormState();
  hide();
};

const beforeModalOk = (hide) => {
  // force validation to run, which would otherwise only run when a field is
  // interacted with
  validate();
  // if there are form-wide errors, show them
  showFormWideErrors.value = true;
  // hide modal only if there are no field-level or form-wide errors
  if (isValid.value && formWideErrors.value.length === 0) {
    hide();
  }
};

const onModalOk = () => {
  const newFileType = {
    name: newFileTypeName.value,
    extension: newFileTypeExtension.value,
  };
  emit("update:modelValue", newFileType);
  emit("fileTypeCreated", newFileType);
  // reset form
  resetModalFormState();
};

const resetModalFormState = () => {
  // hide form-wide errors
  showFormWideErrors.value = false;
  // reset form inputs' values and validation results
  reset();
};

const setModalVisibility = (visibility) => {
  isModalVisible.value = visibility;
};

watch(props.allowCreateNew, (allowCreateNew) => {
  console.log("allowCreateNew changed to:", allowCreateNew);
});
</script>

<style lang="scss">
.duplicate_file_type_alert {
  max-width: 250px;
}
</style>
