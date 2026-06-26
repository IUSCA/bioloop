<template>
  <VaModal
    v-model="visible"
    title="Create Collection"
    hide-default-actions
    size="large"
    no-outside-dismiss
    @cancel="hide"
  >
    <template #header>
      <div class="flex items-start gap-3 mb-5">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
        >
          <Icon icon="mdi-folder-plus" />
        </div>
        <div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Create Collection
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Collections group datasets for scalable access management. One grant
            on a collection extends to all its datasets and to all members of
            the granted group.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3 mt-6">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>

        <VaButton
          :loading="loading"
          :disabled="!confirmationValid"
          color="primary"
          @click="confirm"
        >
          Create Collection
          <i-mdi-arrow-right class="ml-2" />
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <VaForm ref="formRef" class="space-y-3">
        <ModernCard icon="mdi-identification-card" title="Identity">
          <div class="space-y-4">
            <div>
              <VaInput
                class="w-full collection-name-input"
                v-model="formData.name"
                placeholder="e.g., Genomic Data Products"
                outline
                label="Collection Name"
                required-mark
                :rules="nameRules"
                @blur="validate"
              />
            </div>

            <div>
              <VaTextarea
                class="w-full"
                v-model="formData.description"
                placeholder="Optional description of this collection"
                outline
                label="Description"
                :rows="3"
                :rules="descriptionRules"
                @blur="validate"
              />
            </div>
          </div>
        </ModernCard>

        <ModernCard :icon="getIcon('group')" title="Owning Group">
          <div class="space-y-3">
            <p class="text-xs text-gray-500 dark:text-gray-400">
              You can only create collections owned by groups you administer.
            </p>

            <div v-if="!formData.selectedOwnerGroup">
              <AdminGroupSearchSelect
                :disabled="loading"
                @select="(group) => (formData.selectedOwnerGroup = group)"
              />
            </div>
            <div v-else>
              <!-- if a group is passed as a prop, the group chip is not removable -->
              <GroupChip
                :group="formData.selectedOwnerGroup"
                :removable="!props.group"
                @remove="formData.selectedOwnerGroup = null"
              />

              <!-- Authority Boundary Information Message -->
              <ModernAlert
                icon="mdi-information"
                color="emerald"
                title="Authority Boundary"
              >
                Only admins of
                <span class="font-semibold italic">
                  {{ formData.selectedOwnerGroup?.name }}
                </span>
                can add or remove datasets, create grants, or modify this
                collection. No group can grant access to data it does not own.
                All datasets added must also be owned by
                <span class="font-semibold italic">
                  {{ formData.selectedOwnerGroup?.name }} </span
                >.
              </ModernAlert>
            </div>
          </div>
        </ModernCard>

        <ModernCard :icon="getIcon('dataset')" title="Dataset Selection">
          <div class="space-y-3" v-if="formData.selectedOwnerGroup">
            <ModernAlert icon="mdi-warning-outline" color="amber">
              Only datasets owned by
              <span class="font-semibold italic">
                {{ formData.selectedOwnerGroup?.name }}
              </span>
              can be added. Adding a dataset changes effective access for all
              current grant holders on this collection.
            </ModernAlert>

            <DatasetSearchSelect
              :disabled="loading"
              v-model:selected="formData.selectedDatasets"
              :owner-group-id="formData.selectedOwnerGroup?.id"
            />
          </div>
          <div v-else>
            <p
              class="text-sm text-center my-5 text-gray-500 dark:text-gray-400"
            >
              Select an owning group to attach datasets to this collection.
            </p>
          </div>
        </ModernCard>
      </VaForm>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import DatasetSearchSelect from "@/components/v2/datasets/DatasetSearchSelect.vue";
import toast from "@/services/toast";
import CollectionService from "@/services/v2/collections";
import { getIcon } from "@/services/v2/icons";
import { computed, ref, watch } from "vue";
import { useForm } from "vuestic-ui";

const { validate, resetValidation, isValid } = useForm("formRef");

const props = defineProps({
  group: {
    type: Object,
    required: false,
  },
});

const emit = defineEmits(["update"]);

defineExpose({ show, hide });

const visible = ref(false);
const loading = ref(false);

const formData = ref({
  name: "",
  description: "",
  selectedOwnerGroup: null,
  selectedDatasets: [],
});

const nameRules = [
  (value) => !!value || "Collection name is required",
  (value) =>
    (value && value.length >= 2) ||
    "Collection name must be at least 2 characters",
  (value) =>
    (value && value.length <= 255) ||
    "Collection name must be less than 255 characters",
];

const descriptionRules = [
  (value) =>
    (value ? value.length <= 2000 : true) ||
    "Description must be less than 2000 characters",
];

const confirmationValid = computed(() => {
  if (!isValid.value) return false;
  if (!formData.value.selectedOwnerGroup) return false;
  return true;
});

watch(visible, (newVisible) => {
  if (!newVisible) return;
  resetValidation();
});

function show() {
  formData.value = {
    name: "",
    description: "",
    selectedOwnerGroup: props.group || null,
    selectedDatasets: [],
  };
  visible.value = true;
  resetValidation();

  // focus the name input after a short delay to ensure the modal is fully rendered
  setTimeout(() => {
    const input = document.querySelector(".collection-name-input input");
    if (input) input.focus();
  }, 300);
}

function hide() {
  visible.value = false;
}

async function confirm() {
  if (!confirmationValid.value || !validate()) return;

  loading.value = true;

  try {
    const payload = {
      name: formData.value.name,
      description: formData.value.description,
      owner_group_id: formData.value.selectedOwnerGroup.id,
    };
    if (formData.value.selectedDatasets.length) {
      payload.dataset_ids = formData.value.selectedDatasets.map(
        (d) => d.resource_id,
      );
    }

    const response = await CollectionService.create(payload);
    hide();
    toast.success("Collection created successfully.");
    emit("update", response.data);
  } catch (error) {
    console.error("Failed to create collection:", error);
    toast.error(
      error?.response?.data?.message ??
        "Failed to create collection. Please try again.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
