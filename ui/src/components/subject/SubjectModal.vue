<template>
  <VaModal
    v-model="visible"
    :title="props.editing ? 'Edit Subject ' : 'Create a New Subject'"
    :ok-text="props.editing ? 'Edit' : 'Create'"
    hide-default-actions
  >
    <VaInnerLoading :loading="loading">
      <div>
        <p v-if="!isValid" class="mb-5">
          <VaAlert color="warning" icon="warning">
            At least one of CFN ID, Clinical Core ID, or Subject ID is required.
          </VaAlert>
        </p>

        <!-- when there are some non editable fields -->
        <!-- display an alert and suggest alternative steps -->
        <p
          v-if="
            Object.values(props.subject.editable_fields).some(
              (x) => x === false,
            )
          "
          class="mb-5"
        >
          <VaAlert color="warning">
            <div class="space-y-2">
              <p class="font-semibold">
                Some fields are not editable because there are some converted
                datasets associated with this subject.
              </p>

              <p>
                These datasets are created from Source2Raw conversion which
                makes use of these fields. If you want to edit these fields, you
                can:
              </p>

              <ol class="list-decimal pl-3">
                <li>
                  Delete the raw datasets associated with this subject from this
                  portal.
                </li>
                <li>
                  Delete the corresponding folder staged in the project path.
                </li>
                <li>Edit the subject</li>
                <li>
                  Re-run the Source2Raw conversion from the Source datasets
                </li>
              </ol>

              <p>
                If you are not sure about the steps, please contact the
                administrator.
              </p>
            </div>
          </VaAlert>
        </p>

        <VaForm ref="formRef" class="flex flex-col gap-3">
          <VaInput
            v-model="data.cfn_id"
            label="CFN ID"
            :disabled="props.editing && !props.subject.editable_fields.cfn_id"
          />
          <VaInput
            v-model="data.clinical_core_id"
            label="Clinical Core ID"
            :disabled="
              props.editing && !props.subject.editable_fields.clinical_core_id
            "
          />
          <VaInput
            v-model="data.subject_id"
            label="Subject ID"
            :disabled="
              props.editing && !props.subject.editable_fields.subject_id
            "
          />
          <VaInput v-model="data.given_name" label="Given Name" />
        </VaForm>
      </div>
      <!-- action buttons: reset, cancel, create -->
      <div class="flex gap-3 w-full mt-5">
        <VaButton @click="hide" class="" preset="primary"> Cancel </VaButton>
        <VaButton
          class="ml-auto"
          @click="editSubject"
          :disabled="!isValid"
          color="success"
          icon="edit"
          v-if="props.editing"
        >
          Edit
        </VaButton>
        <VaButton
          class="ml-auto"
          @click="createSubject"
          :disabled="!isValid"
          color="success"
          icon="add_circle"
          v-else
        >
          Create
        </VaButton>
      </div>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import subjectService from "@/services/subject";
import toast from "@/services/toast";

const props = defineProps({
  subject: {
    type: Object,
    default: null,
  },
  editing: {
    type: Boolean,
    default: false,
  },
});
const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const loading = ref(false);
const visible = ref(false);
const defaultState = () => ({
  cfn_id: "",
  clinical_core_id: "",
  subject_id: "",
  given_name: "",
});
const data = ref(defaultState());
watch(
  () => props.subject,
  () => {
    if (props.subject) {
      data.value = {
        cfn_id: props.subject.cfn_id || "",
        clinical_core_id: props.subject.clinical_core_id || "",
        subject_id: props.subject.subject_id || "",
        given_name: props.subject.given_name || "",
      };
    }
  },
  { immediate: true },
);

function reset() {
  data.value = defaultState();
}

function hide() {
  loading.value = false;
  visible.value = false;
  reset();
}

function show() {
  visible.value = true;
}

const isValid = computed(() => {
  // at least one of cfn_id or clinical_core_id or subject_id should be present
  return (
    data.value.cfn_id || data.value.clinical_core_id || data.value.subject_id
  );
});

function createSubject() {
  if (isValid) {
    loading.value = true;

    subjectService
      .create(data.value)
      .then(() => {
        emit("update");
        toast.success("Subject created successfully");
        hide();
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to create subject");
      })
      .finally(() => {
        loading.value = false;
      });
  }
}

function editSubject() {
  if (isValid) {
    loading.value = true;

    subjectService
      .modify({
        id: props.subject.id,
        data: data.value,
      })
      .then(() => {
        emit("update");
        toast.success("Subject updated successfully");
        hide();
      })
      .catch((error) => {
        console.error(error);
        toast.error("Failed to update subject");
      })
      .finally(() => {
        loading.value = false;
      });
  }
}
</script>
