<template>
  <va-modal
    v-model="visible"
    title="Create New Group"
    ok-text="Create"
    @ok="handleCreate"
    @cancel="hideModal"
  >
    <!-- Create Group Form -->
    <va-form ref="groupForm" class="flex flex-col gap-6">
      <!-- Name -->
      <va-input
        v-model="formData.name"
        label="Name"
        class="w-full"
        :rules="[(v) => !!v || 'Name is required']"
      />

      <!-- Description -->
      <va-textarea
        v-model="formData.description"
        label="Description"
        class="w-full"
        rows="3"
      />

      <!-- Parent Group -->
      <GroupAutoComplete
        v-model:selected="selectedParentGroup"
        v-model:search-term="parentSearchTerm"
        label="Parent Group (Optional)"
        @clear="handleClearParent"
      />
    </va-form>
  </va-modal>
</template>

<script setup>
import { useForm } from "vuestic-ui";

const emit = defineEmits(["create"]);

const { validate } = useForm("groupForm");

const getDefaultFormData = () => ({
  name: "",
  description: "",
});

const formData = ref(getDefaultFormData());
const visible = ref(false);
const selectedParentGroup = ref(null);
const parentSearchTerm = ref("");

const showModal = () => {
  visible.value = true;
  formData.value = getDefaultFormData();
  selectedParentGroup.value = null;
  parentSearchTerm.value = "";
};

const hideModal = () => {
  visible.value = false;
  formData.value = getDefaultFormData();
  selectedParentGroup.value = null;
  parentSearchTerm.value = "";
};

const handleClearParent = () => {
  selectedParentGroup.value = null;
  parentSearchTerm.value = "";
};

const handleCreate = async () => {
  const isFormValid = await validate();
  if (!isFormValid) return;

  // Emit the form data to parent component
  emit("create", {
    name: formData.value.name,
    description: formData.value.description || undefined,
    parent_id: selectedParentGroup.value?.id || undefined,
  });

  hideModal();
};

defineExpose({ showModal, hideModal });
</script>
