<!--
  Send files from this computer.

  The dialog registers the dataset, hands the files to the upload store, and closes. It does
  not stay open for the transfer: the store outlives it, so the user is free to navigate.
  A reload still ends the transfer, and the dialog says so rather than leaving the user to
  discover it.

  @see docs/design/groups/implementation/dataset-creation-plan.md — C4
-->
<template>
  <VaModal
    v-model="visible"
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
          <Icon icon="mdi-cloud-upload-outline" />
        </div>
        <div>
          <h2 class="text-xl font-semibold">Upload Dataset</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Files are sent from this browser. The transfer keeps going while you
            use the rest of Bioloop.
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3 mt-6">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="submitting"
          :disabled="!canSubmit"
          color="primary"
          @click="submit"
        >
          Start Upload
          <i-mdi-arrow-right class="ml-2" />
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="submitting">
      <VaForm ref="formRef" class="space-y-3">
        <ModernCard icon="mdi-file-multiple-outline" title="What to send">
          <div class="space-y-4">
            <div class="flex gap-3">
              <VaButton
                :preset="selectionMode === 'files' ? 'primary' : 'secondary'"
                size="small"
                @click="pickFiles"
              >
                <Icon icon="mdi-file-outline" class="mr-2" />
                Choose files
              </VaButton>
              <VaButton
                :preset="
                  selectionMode === 'directory' ? 'primary' : 'secondary'
                "
                size="small"
                @click="pickDirectory"
              >
                <Icon icon="mdi-folder-outline" class="mr-2" />
                Choose a folder
              </VaButton>
            </div>

            <!--
              Hidden and driven by the buttons above, because the native file input cannot
              be styled and cannot be told to offer a directory without the attribute pair
              below. Labelled all the same, so assistive technology reaching them directly
              is not left with two unnamed controls.
            -->
            <input
              ref="fileInput"
              type="file"
              multiple
              class="hidden"
              aria-label="Choose files to upload"
              @change="onFilesChosen('files', $event)"
            />
            <input
              ref="dirInput"
              type="file"
              webkitdirectory
              directory
              class="hidden"
              aria-label="Choose a folder to upload"
              @change="onFilesChosen('directory', $event)"
            />

            <div
              v-if="files.length"
              class="rounded-lg border dark:border-gray-700 p-3 space-y-1"
            >
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium">
                  {{ files.length }} file{{ files.length === 1 ? "" : "s" }}
                  <template v-if="directoryName">
                    from {{ directoryName }}
                  </template>
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ formatBytes(totalBytes) }}
                </span>
              </div>
              <ul
                class="max-h-40 overflow-y-auto text-xs text-gray-500 dark:text-gray-400"
              >
                <li
                  v-for="file in previewFiles"
                  :key="file.name"
                  class="truncate"
                >
                  {{ file.webkitRelativePath || file.name }}
                </li>
                <li v-if="files.length > previewFiles.length" class="italic">
                  and {{ files.length - previewFiles.length }} more
                </li>
              </ul>
            </div>

            <ModernAlert
              icon="mdi-information"
              color="info"
              title="Before you start"
            >
              The transfer continues if you close this dialog and move around
              the app. Reloading or closing the tab ends it, and you would need
              to start again.
            </ModernAlert>
          </div>
        </ModernCard>

        <ModernCard icon="mdi-identification-card" title="Identity">
          <div class="space-y-4">
            <VaInput
              v-model="form.name"
              class="w-full upload-name-input"
              outline
              label="Dataset Name"
              required-mark
              placeholder="e.g., PLATE_07_IMAGES"
              :rules="nameRules"
              :error="nameTaken"
              :error-messages="
                nameTaken ? ['That name is already used in this group'] : []
              "
              @blur="checkName"
            />

            <VaSelect
              v-model="form.type"
              class="w-full"
              outline
              label="Type"
              required-mark
              :options="typeOptions"
              value-by="value"
              text-by="text"
              @update:model-value="checkName"
            />

            <VaTextarea
              v-model="form.description"
              class="w-full"
              outline
              label="Description"
              :rows="2"
              placeholder="Optional"
            />
          </div>
        </ModernCard>

        <ModernCard :icon="getIcon('group')" title="Owning Group">
          <OwnerGroupSelect
            :disabled="submitting"
            :preselect-group-id="props.group?.id"
            @update:model-value="onGroupSelected"
          />
        </ModernCard>
      </VaForm>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import ModernAlert from "@/components/utils/ModernAlert.vue";
import ModernCard from "@/components/utils/ModernCard.vue";
import OwnerGroupSelect from "@/components/v2/datasets/create/OwnerGroupSelect.vue";
import DatasetService from "@/services/v2/datasets";
import { getIcon } from "@/services/v2/icons";
import toast from "@/services/toast";
import { formatBytes } from "@/services/utils";
import { useUploadStore } from "@/stores/v2/upload";
import { computed, ref } from "vue";

const props = defineProps({
  group: { type: Object, required: false, default: null },
});

const emit = defineEmits(["created"]);

defineExpose({ show, hide });

const uploadStore = useUploadStore();

const visible = ref(false);
const submitting = ref(false);
const nameTaken = ref(false);

const fileInput = ref(null);
const dirInput = ref(null);

const files = ref([]);
const selectionMode = ref("files");
const directoryName = ref("");

const form = ref({
  name: "",
  type: "RAW_DATA",
  description: "",
  ownerGroup: null,
});

const typeOptions = [
  { value: "RAW_DATA", text: "Raw Data" },
  { value: "DATA_PRODUCT", text: "Data Product" },
];

const nameRules = [
  (v) => !!v || "A dataset name is required",
  (v) => (v && v.length >= 3) || "At least 3 characters",
];

const totalBytes = computed(() =>
  files.value.reduce((sum, f) => sum + f.size, 0),
);

// Enough to show what was picked without rendering ten thousand rows.
const previewFiles = computed(() => files.value.slice(0, 25));

const canSubmit = computed(
  () =>
    files.value.length > 0 &&
    !!form.value.name &&
    form.value.name.length >= 3 &&
    !!form.value.ownerGroup &&
    !nameTaken.value,
);

function pickFiles() {
  fileInput.value?.click();
}

function pickDirectory() {
  dirInput.value?.click();
}

function onFilesChosen(mode, event) {
  const chosen = Array.from(event.target.files || []);
  if (chosen.length === 0) return;

  selectionMode.value = mode;
  files.value = chosen;
  directoryName.value =
    mode === "directory"
      ? chosen[0].webkitRelativePath?.split("/")[0] || ""
      : "";

  // A folder's own name is the obvious dataset name, and is usually what people want.
  if (!form.value.name && directoryName.value) {
    form.value.name = directoryName.value;
    checkName();
  }
}

function onGroupSelected(group) {
  form.value.ownerGroup = group;
  checkName();
}

async function checkName() {
  if (!form.value.name || !form.value.ownerGroup) {
    nameTaken.value = false;
    return;
  }
  try {
    const { data } = await DatasetService.nameAvailable({
      name: form.value.name,
      type: form.value.type,
      owner_group_id: form.value.ownerGroup.id,
    });
    nameTaken.value = !data.available;
  } catch {
    // The create is the real gate and answers 409; a failed check must not block the form.
    nameTaken.value = false;
  }
}

/**
 * Register the dataset, hand the files to the store, and close.
 *
 * The dialog does not wait for the transfer. Once the store has the files, this component
 * can be destroyed without stopping anything.
 */
async function submit() {
  submitting.value = true;
  try {
    const { data: uploadLog } = await DatasetService.registerUpload({
      name: form.value.name,
      type: form.value.type,
      owner_group_id: form.value.ownerGroup.id,
      description: form.value.description || undefined,
    });

    uploadStore.start({
      dataset: { ...uploadLog.dataset, owner_group: form.value.ownerGroup },
      files: files.value,
      selectionMode: selectionMode.value,
      directoryName: directoryName.value,
    });

    toast.success(`Uploading ${uploadLog.dataset.name}`);
    emit("created", uploadLog.dataset);
    hide();
  } catch (err) {
    const status = err?.response?.status;
    // A 409 is not only a name collision any more: an archived owning group refuses the
    // upload with the same status, so the message decides which happened.
    // @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
    if (status === 409) {
      toast.error(
        err.response.data?.message ||
          "A dataset with that name already exists in this group",
      );
    } else if (status === 403) {
      toast.error("You cannot add datasets to that group");
    } else {
      toast.error("Could not start the upload");
    }
  } finally {
    submitting.value = false;
  }
}

function show() {
  files.value = [];
  selectionMode.value = "files";
  directoryName.value = "";
  nameTaken.value = false;
  form.value = {
    name: "",
    type: "RAW_DATA",
    description: "",
    ownerGroup: null,
  };
  visible.value = true;
}

function hide() {
  visible.value = false;
}
</script>
