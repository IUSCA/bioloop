<template>
  <va-modal v-model="visible" :title="'Enable Alert'" hide-default-actions>
    <div class="mb-4">
      <p>
        Enabling alert:
        <strong class="alert-label">{{ currentAlert?.label }}</strong>
      </p>
    </div>

    <va-form ref="form" @submit.prevent="confirm" class="flex flex-col gap-4">
      <AlertDateTimeInputs
        v-model:startTime="startTime"
        v-model:endTime="endTime"
      />
    </va-form>

    <template #footer>
      <div class="flex justify-end gap-4 mt-4">
        <va-button @click="cancel" text-color="secondary" preset="secondary">
          Cancel
        </va-button>
        <va-button color="primary" @click="confirm">Confirm</va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import { useForm } from "vuestic-ui";

const visible = ref(false);
const currentAlert = ref(null);

const startTime = ref(null);
const endTime = ref(null);

const { validate } = useForm("form");

const emit = defineEmits(["confirm"]);

const showModal = (alert) => {
  console.log("showModal", alert);

  currentAlert.value = alert;

  // startTime.value = new Date(Date.now() + 10 * 60000);
  // endTime.value = new Date(Date.now() + 70 * 60000);

  visible.value = true;
};

const confirm = async () => {
  if (await validate()) {
    emit("confirm", currentAlert.value, startTime.value, endTime.value);
    visible.value = false;
  }
};

const cancel = () => {
  visible.value = false;
};

defineExpose({ showModal });

// const logUpdateStartTime = (newStartTime) => {
//   console.log("logUpdateStartTime", newStartTime);
// };
//
// const logUpdateEndTime = (newEndTime) => {
//   console.log("logUpdateEndTime", newEndTime);
// };
</script>
