<template>
  <DataProductFileTypeSelect
    :model-value="props.modelValue"
    @update:model-value="emitNewModelValue"
    :file-type-list="props.fileTypeList"
    @create-new-file-type="setModalVisibility(true)"
    class="w-full"
  />
  <va-form ref="create_new_file_type_form">
    <va-modal
      v-model="is_modal_visible"
      ok-text="Create"
      no-dismiss
      :before-cancel="before_modal_cancel"
      :before-ok="before_modal_ok"
      @ok="on_modal_ok"
    >
      <div class="flex flex-col gap-6">
        <va-input
          name="new_file_type_name"
          v-model="new_file_type_name"
          label="File Type Name"
          placeholder="Name"
          @input="show_new_file_type_form_wide_errors = false"
          :rules="[
            (value) => (value && value.length > 0) || 'Name is required',
            (value) => (value && value.length > 3) || 'Name is too short',
          ]"
        ></va-input>
        <va-input
          name="new_file_type_extension"
          v-model="new_file_type_extension"
          label="File Type Extension"
          placeholder="Extension"
          @input="show_new_file_type_form_wide_errors = false"
          :rules="[
            (value) => (value && value.length > 0) || 'Extension is required',
            (value) => (value && value.length > 3) || 'Extension is too short',
          ]"
        ></va-input>

        <div v-if="show_new_file_type_form_wide_errors">
          <va-alert
            v-for="(error, i) in new_file_type_form_wide_errors"
            :key="i"
            class="w-full"
            color="danger"
            >{{ error }}
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
});

const emit = defineEmits(["update:modelValue"]);

const is_modal_visible = ref(false);
const show_new_file_type_form_wide_errors = ref(false);
const new_file_type_name = ref("");
const new_file_type_extension = ref("");

const {
  isValid: isValid_newFileTypeForm,
  validate: validate_newFileTypeForm,
  reset: reset_newFileTypeForm,
} = useForm("create_new_file_type_form");

const emitNewModelValue = (val) => {
  // debugger;
  emit("update:modelValue", val);
};

const new_file_type_form_wide_errors = computed(() => {
  let form_errors = [];
  const is_duplicate_file_type =
    props.fileTypeList.find(
      (e) =>
        e.name === new_file_type_name.value &&
        e.extension === new_file_type_extension.value,
    ) !== undefined;
  if (is_duplicate_file_type) {
    form_errors.push(
      `File Type with name '${new_file_type_name.value}', extension '${new_file_type_extension.value}' already exists`,
    );
  }
  return form_errors;
});

const before_modal_ok = (hide) => {
  // force validation to run, which would otherwise only run when a field is interacted with
  validate_newFileTypeForm();
  // if there are form-wide errors, show them
  show_new_file_type_form_wide_errors.value = true;
  // hide modal only if there are no field-level or form-wide errors
  if (
    isValid_newFileTypeForm.value &&
    new_file_type_form_wide_errors.value.length === 0
  ) {
    hide();
  }
};

const before_modal_cancel = (hide) => {
  reset_modal_form_state();
  hide();
};

const reset_modal_form_state = () => {
  // hide form-wide errors
  show_new_file_type_form_wide_errors.value = false;
  // reset form inputs' values and validation results
  reset_newFileTypeForm();
};

const setModalVisibility = (visibility) => {
  is_modal_visible.value = visibility;
};

const on_modal_ok = () => {
  emitNewModelValue({
    name: new_file_type_name.value,
    extension: new_file_type_extension.value,
  });
  // reset modal form
  reset_modal_form_state();
};
</script>

<style scoped></style>
