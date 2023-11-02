<template>
  <va-select
    :class="props.class"
    v-model="file_type_selected"
    label="File Type"
    placeholder="Select File Type"
    :options="file_type_list"
    :text-by="(option) => option.name"
    :track-by="(option) => option"
    :rules="[
      (value) => {
        return (value && value.name.length > 0) || 'File Type is required';
      },
    ]"
  >
    <template #append>
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
  </va-select>

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
            >{{ error }}</va-alert
          >
        </div>
      </div>
    </va-modal>
  </va-form>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { useForm } from "vuestic-ui";

const props = defineProps({
  class: {
    type: String,
  },
});

const {
  isValid: isValid_newFileTypeForm,
  validate: validate_newFileTypeForm,
  reset: reset_newFileTypeForm,
} = useForm("create_new_file_type_form");

const emit = defineEmits(["update:selected"]);

const file_type_list = ref([]);
const file_type_selected = ref();
const is_modal_visible = ref(false);
const show_new_file_type_form_wide_errors = ref(false);
const new_file_type_name = ref("");
const new_file_type_extension = ref("");

const new_file_type_form_wide_errors = computed(() => {
  let form_errors = [];
  const is_duplicate_file_type =
    file_type_list.value.find(
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

const setModalVisibility = (visibility) => {
  is_modal_visible.value = visibility;
};

const reset_modal_form_state = () => {
  // hide form-wide errors
  show_new_file_type_form_wide_errors.value = false;
  // reset form inputs' values and validation results
  reset_newFileTypeForm();
};

const before_modal_ok = (hide) => {
  // force validation to run, which would otherwise only run when a field is focused
  validate_newFileTypeForm();
  // if there are form-level errors, show them
  show_new_file_type_form_wide_errors.value = true;
  // hide modal only if there are no field-level or form-level errors
  if (
    isValid_newFileTypeForm.value &&
    new_file_type_form_wide_errors.value.length === 0
  ) {
    hide();
  }
};

const on_modal_ok = () => {
  // debugger;
  // set value passed as v-model to AutoCompleteSelect
  file_type_selected.value = {
    name: new_file_type_name.value,
    extension: new_file_type_extension.value,
  };
  // add new file type to File Type AutoCompleteSelect's options
  file_type_list.value.push(file_type_selected.value);
  // reset modal form
  reset_modal_form_state();
};

const before_modal_cancel = (hide) => {
  reset_modal_form_state();
  hide();
};

onMounted(() => {
  datasetService.getDataProductFileTypes().then((res) => {
    // debugger;
    file_type_list.value = res.data;
  });
});

watch(file_type_selected, () => {
  emit("update:selected", file_type_selected.value);
});
</script>
