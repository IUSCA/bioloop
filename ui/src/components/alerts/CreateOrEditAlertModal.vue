<template>
  <va-modal
    v-model="visible"
    :title="alertData.id ? 'Edit Alert' : 'New Alert'"
    @ok="saveAlert"
    @cancel="hideModal"
    :loading="loading"
  >
    <va-form @submit.prevent="saveAlert" class="flex flex-col gap-6">
      <div class="flex flex-row gap-4">
        <va-input
          v-model="alertData.label"
          label="Label"
          class="flex-grow"
          :rules="[(v) => !!v || 'Label is required']"
        />
        <va-select
          v-model="alertData.type"
          label="Type"
          class="w-1/3"
          :options="['INFO', 'WARNING', 'ERROR']"
        />
      </div>

      <va-textarea
        v-model="alertData.message"
        label="Message"
        class="w-full"
        rows="4"
      />
    </va-form>
  </va-modal>
</template>

<script setup>
import alertService from "@/services/alert";
import toast from "@/services/toast";
import { getPagesList } from "@/services/routeUitls";
import { routes } from "vue-router/auto-routes";

const props = defineProps({
  alert: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const loading = ref(false);

const availablePages = ref([]);

const alertData = ref({
  label: "",
  message: "",
  type: "INFO",
});

const showModal = (alert = null) => {
  visible.value = true;
  if (alert) {
    alertData.value = { ...alert };
  } else {
    alertData.value = {
      label: "",
      message: "",
      type: "INFO",
    };
  }
};

const hideModal = () => {
  visible.value = false;
};

const saveAlert = async () => {
  loading.value = true;
  try {
    if (alertData.value.id) {
      await alertService.update(alertData.value.id, alertData.value);
      toast.success("Alert updated successfully");
    } else {
      await alertService.create(alertData.value);
      toast.success("Alert created successfully");
    }
    emit("update");
    hideModal();
  } catch (error) {
    toast.error("Failed to save alert");
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  availablePages.value = getPagesList(routes);
  console.log(availablePages.value);
});

defineExpose({ showModal });
</script>
