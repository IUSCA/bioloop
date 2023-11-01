<template>
  <va-inner-loading :loading="loading" class="h-full">
    <va-form
      class="h-full"
      ref="uploadDataProductForm"
      :hide-errors="hideErrorMessages_uploadDataProductForm"
    >
      <va-stepper
        v-model="step"
        :steps="steps"
        controlsHidden
        class="h-full create-data-product-stepper"
      >
        <!-- Step icons and labels -->
        <template
          v-for="(step, i) in steps"
          :key="step.label"
          #[`step-button-${i}`]="{ setStep, isActive, isCompleted }"
        >
          <div
            class="step-button p-1 sm:p-3 cursor-pointer"
            :class="{
              'step-button--active': isActive,
              'step-button--completed': isCompleted,
            }"
            @click="isValid_new_data_product_form() && setStep(i)"
          >
            <div class="flex flex-col items-center">
              <Icon :icon="step.icon" />
              <span class="hidden sm:block"> {{ step.label }} </span>
            </div>
          </div>
        </template>

        <!-- File Type -->
        <template #step-content-0>
          <!--            v-model="file_type_selected__v_model"-->
          <AutoComplete
            name="file_type"
            :data="file_type_list"
            filter-by="name"
            placeholder="Search File Types"
            @create-new-element="show_create_file_type_modal"
            :selected-option="file_type_selected"
            :show-selected-option="true"
            :format-selected-option="get_file_type_option_value"
            :get-option-value="(option) => option.name"
            :show-add-new-button="true"
            add-new-button-text="Create new File Type"
            @select="update_file_type_selected"
            @clear="
              () => {
                reset_file_type_selected();
                // isValid_new_data_product_form();
              }
            "
            :rules="file_type_rules"
          ></AutoComplete>
          <!--                        @update:model-value="update_file_type_selected__v_model"-->

          <!--                      @input="reset_file_type_selected"-->
          <!--            @change="reset_file_type_selected"-->
          <!--            @select="-->
          <!--              (newVal) => {-->
          <!--                // persistValueToStore('file_type', newVal);-->
          <!--                reset_file_type_selected();-->
          <!--              }-->
          <!--            "-->

          <!--          <va-input-->
          <!--            name="some_input"-->
          <!--            :rules="[-->
          <!--              (value) => (value && value.length > 0) || 'Input is required',-->
          <!--            ]"-->
          <!--          ></va-input>-->
        </template>

        <!-- Data Product path info -->
        <template #step-content-1>
          <div class="flex-none">
            <va-file-upload
              class="w-full"
              label="File"
              v-model="data_product_path"
              dropzone
            />
          </div>
        </template>

        <!-- dataset select -->
        <template #step-content-2>
          <!--        <ProjectDatasetsForm class="" />-->
          <!--        <DatasetSelect dtype="DATA_PRODUCT" @select="handleSelect" />-->
          <AutoComplete
            v-model="raw_data_selected_name"
            :data="raw_data_list"
            filter-by="name"
            placeholder="Search Raw Data by name"
            @select="select_dataset"
            :show-selected-value="true"
            :format-selected-value="(val) => val.name"
          ></AutoComplete>

          <!--        <div class="flex flex-row justify-between px-1">-->
          <!--          <span class="text-lg font-bold tracking-wide">-->
          <!--            Raw Data to assign-->
          <!--          </span>-->
          <!--        </div>-->

          <!--        <va-list :class="['grid', 'gap-3', 'grid-cols-1']">-->
          <!--          <va-list-item class="col-span-1">-->
          <!--            <va-list-item-section avatar>-->
          <!--              <Icon-->
          <!--                :icon="config.dataset.types['RAW_DATA']?.icon"-->
          <!--                class="text-2xl"-->
          <!--              />-->
          <!--            </va-list-item-section>-->
          <!--          </va-list-item>-->
          <!--        </va-list>-->
        </template>

        <!-- custom controls -->
        <template #controls="{ nextStep, prevStep }">
          <div class="flex items-center justify-around w-full">
            <va-button class="flex-none" preset="primary" @click="prevStep()">
              Previous
            </va-button>
            <va-button
              class="flex-none"
              @click="
                isValid_new_data_product_form() &&
                  (is_last_step ? handleCreate() : nextStep())
              "
              :color="is_last_step ? 'success' : 'primary'"
            >
              {{ is_last_step ? "Create Data Product" : "Next" }}
            </va-button>
          </div>
        </template>
      </va-stepper>

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
                (value) =>
                  (value && value.length > 0) || 'Extension is required',
                (value) =>
                  (value && value.length > 3) || 'Extension is too short',
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
    </va-form>
  </va-inner-loading>
</template>

<script setup>
import { useForm } from "vuestic-ui";
import { useDataProductUploadFormStore } from "@/stores/dataProductUploadForm";
import datasetService from "@/services/dataset";

const file_type_rules = [
  (value) => {
    // debugger;
    return (value && value.length > 0) || "File Type is required";
  },
];

const {
  isValid: isValid_newFileTypeForm,
  validate: validate_newFileTypeForm,
  reset: reset_newFileTypeForm,
} = useForm("create_new_file_type_form");
const {
  validate: validate_uploadDataProductForm,
  errorMessages: errorMessages_uploadDataProductForm,
  // errorMessagesNamed: errorMessagesNamed_uploadDataProductForm,
} = useForm("uploadDataProductForm");

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

const get_file_type_option_value = (option) => option.name;

// const some_input = ref("");
// const test_prop = ref("");
// const model_value_prop = ref("");
const hideErrorMessages_uploadDataProductForm = ref(true);
const show_new_file_type_form_wide_errors = ref(false);
const new_file_type_name = ref("");
const new_file_type_extension = ref("");
const file_type_selected = ref();
// const file_type_selected__v_model = computed(() => {
//   return get_file_type_option_value(file_type_selected);
// });
const file_type_list = ref([]);
const raw_data_list = ref([]);
const raw_data_selected = ref();
const raw_data_selected_name = computed(() => raw_data_selected?.value?.name);
const data_product_path = ref();
const is_modal_visible = ref(false);
const step = ref(0);
const loading = ref(false);
const steps = [
  { label: "File Type", icon: "material-symbols:category" },
  { label: "Select File", icon: "material-symbols:folder" },
  { label: "Source Raw Data", icon: "mdi:dna" },
  { label: "Create", icon: "material-symbols:add-task" },
];

onMounted(() => {
  datasetService.getAll({ type: "DATA_PRODUCT" }).then((res) => {
    raw_data_list.value = res.data.datasets;
  });
  datasetService.getDataProductFileTypes().then((res) => {
    file_type_list.value = res.data;
  });
});

const reset_modal_form_state = () => {
  // hide form-wide errors
  show_new_file_type_form_wide_errors.value = false;
  // reset form inputs' values and validation results
  reset_newFileTypeForm();
};

const before_modal_cancel = (hide) => {
  reset_modal_form_state();
  hide();
};

const on_modal_ok = () => {
  debugger;
  // set value passed as v-model to AutoComplete
  file_type_selected.value = {
    name: new_file_type_name.value,
    extension: new_file_type_extension.value,
  };
  // add new file type to File Type AutoComplete's options
  file_type_list.value.push(file_type_selected.value);
  // reset modal form
  reset_modal_form_state();

  // model_value_prop.value = "model_value";
  // test_prop.value = "test_prop";
};

// const persistValueToStore = (field, val) => {
//   // debugger;
//   dataProductUploadFormStore.set(field, val);
// };

const reset_file_type_selected = () => {
  file_type_selected.value = undefined;
};

const update_file_type_selected = (val) => {
  debugger;
  file_type_selected.value = val;
};

// const update_file_type_selected__v_model = (val) => {
//   debugger;
//   file_type_selected__v_model.value = val;
// };

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

const show_create_file_type_modal = () => {
  is_modal_visible.value = true;
};

const select_dataset = (dataset) => {
  // debugger;
  raw_data_selected.value = dataset;
};

const is_last_step = computed(() => {
  return step.value === steps.length - 1;
});

function isValid_new_data_product_form() {
  // debugger;
  validate_uploadDataProductForm();
  hideErrorMessages_uploadDataProductForm.value = false;
  return errorMessages_uploadDataProductForm.value.length === 0;
  // const errorMessages = errorMessages_uploadDataProductForm.value || [];
  // const checks = [
  // {
  // errorMessagesNamed_uploadDataProductForm.value.fileType
  //   },
  // ];
  //
  //
  // return errorMessages.slice(0, step.value + 1).every((x) => x);

  // errorMessagesNamed_uploadDataProductForm;

  // if (validate) {
  // dataProductUploadFormStore.validate();
  // }

  // const errors = dataProductUploadFormStore.errors;

  // If validation has not run, assume form is valid, so that controls are not disabled on page
  // load
  // return dataProductUploadFormStore.hasValidationRun
  //   ? errors.slice(0, step.value + 1).every((x) => x)
  //   : true;

  // return dataProductUploadFormStore.isValid;
}

function handleCreate() {
  // projectFormStore.form.validate();
  // if (projectFormStore.form.isValid) {
  //   loading.value = true;
  //
  //   const user_ids = projectFormStore.user_ids;
  //   const project_data = projectFormStore.project_info;
  //   const dataset_ids = projectFormStore.dataset_ids;
  //
  //   projectService
  //     .createProject({
  //       project_data,
  //       user_ids,
  //       dataset_ids,
  //     })
  //     .finally(() => {
  //       loading.value = false;
  //       emit("update");
  //     });
  // }
}
</script>

<style lang="scss">
.create-data-product-stepper {
  .step-button {
    color: var(--va-secondary);
  }
  .step-button--active {
    color: var(--va-primary);
  }

  .step-button--completed {
    color: var(--va-primary);
  }

  .step-button:hover {
    background-color: var(--va-background-element);
  }
  .va-stepper__step-content-wrapper {
    // flex: 1 to expand the element to available height
    // min-height: 0 to shrink the elemenet to below its calculated min-height of children
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .va-stepper__step-content {
    // step-content-wrapper contains step-content and controls
    // only shrink and grow step-content
    flex: 1;
    min-height: auto;
    overflow-y: scroll;
  }

  .va-table td {
    padding: 0.25rem;
  }

  div.va-table-responsive {
    overflow: auto;

    // first column min width
    td:first-child {
      min-width: 135px;
    }
  }
}
</style>
