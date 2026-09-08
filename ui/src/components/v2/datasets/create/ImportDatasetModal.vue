<!--
  Register a directory that already exists. Nothing is copied.

  The directory field is a typeahead over GET /v2/fs, which resolves only inside import
  sources this user may browse. Picking a source first is what makes the typeahead useful:
  it gives the path a root to complete from.

  No project or instrument fields. Projects do not exist in v2, and instruments are deferred.

  @see docs/design/groups/dataset-creation-plan.md — B4
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
          class="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
        >
          <Icon icon="mdi-folder-search-outline" />
        </div>
        <div>
          <h2 class="text-xl font-semibold">Import Dataset</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Register a directory that is already on disk. The files stay where
            they are.
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
          Import Dataset
          <i-mdi-arrow-right class="ml-2" />
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="submitting">
      <VaForm ref="formRef" class="space-y-3">
        <ModernCard icon="mdi-folder-outline" title="Where the data is">
          <div class="space-y-4">
            <ModernAlert
              v-if="sources.length === 0 && !loadingSources"
              icon="mdi-folder-off-outline"
              color="warning"
              title="No import sources"
            >
              None of your groups has an import source configured. A platform
              admin sets these up once they have confirmed Bioloop can read the
              path. Ask yours to add one.
            </ModernAlert>

            <VaSelect
              v-else
              v-model="form.sourceId"
              class="w-full"
              outline
              label="Import Source"
              required-mark
              :loading="loadingSources"
              :options="sourceOptions"
              value-by="value"
              text-by="text"
              placeholder="Choose a source"
            />

            <ModernAlert
              v-if="selectedSource && selectedSource.status === 'SUSPENDED'"
              icon="mdi-alert-outline"
              color="warning"
              title="This source is unavailable"
            >
              {{
                selectedSource.status_reason ||
                "Bioloop cannot currently read this location."
              }}
              Nothing can be imported from it until it is back.
            </ModernAlert>

            <div v-if="form.sourceId && !sourceUnavailable">
              <VaInput
                v-model="form.originPath"
                class="w-full"
                outline
                label="Directory"
                required-mark
                placeholder="Start typing a directory name"
                @update:model-value="onPathInput"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Only directories inside the chosen source can be imported.
              </p>

              <div
                v-if="suggestions.length"
                class="mt-2 border rounded-lg divide-y dark:divide-gray-700 dark:border-gray-700 max-h-56 overflow-y-auto"
              >
                <button
                  v-for="entry in suggestions"
                  :key="entry.path"
                  type="button"
                  class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                  @click="chooseDirectory(entry)"
                >
                  <Icon icon="mdi-folder-outline" class="shrink-0" />
                  <span class="truncate">{{ entry.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </ModernCard>

        <ModernCard icon="mdi-identification-card" title="Identity">
          <div class="space-y-4">
            <VaInput
              v-model="form.name"
              class="w-full import-name-input"
              outline
              label="Dataset Name"
              required-mark
              placeholder="e.g., RUN_2026_09_08_A"
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
import ImportSourceService from "@/services/v2/import-sources";
import { getIcon } from "@/services/v2/icons";
import toast from "@/services/toast";
import { computed, ref } from "vue";

const props = defineProps({
  group: { type: Object, required: false, default: null },
});

const emit = defineEmits(["created"]);

defineExpose({ show, hide });

const visible = ref(false);
const submitting = ref(false);
const loadingSources = ref(false);

const sources = ref([]);
const suggestions = ref([]);
const nameTaken = ref(false);

const form = ref({
  sourceId: null,
  originPath: "",
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

const sourceOptions = computed(() =>
  sources.value.map((s) => ({
    value: s.id,
    text:
      s.status === "SUSPENDED"
        ? `${s.label} — unavailable`
        : `${s.label} (${s.owner_group?.name})`,
  })),
);

const selectedSource = computed(
  () => sources.value.find((s) => s.id === form.value.sourceId) || null,
);

const sourceUnavailable = computed(
  () => selectedSource.value?.status === "SUSPENDED",
);

const canSubmit = computed(
  () =>
    !!form.value.originPath &&
    !!form.value.name &&
    form.value.name.length >= 3 &&
    !!form.value.ownerGroup &&
    !sourceUnavailable.value &&
    !nameTaken.value,
);

function onGroupSelected(group) {
  form.value.ownerGroup = group;
  checkName();
}

/**
 * Ask the scoped availability endpoint. It answers only about the chosen group, so a name
 * held elsewhere is not reported and not revealed.
 */
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
    // A failed check must not block the form; the create is the real gate and answers 409.
    nameTaken.value = false;
  }
}

let browseToken = 0;

/**
 * The endpoint takes a partial path and matches siblings, so the input is sent as typed
 * rather than being split here. Responses are tagged so a slow one cannot overwrite a
 * newer one.
 */
async function onPathInput(value) {
  if (!selectedSource.value) return;

  const typed = (value || "").trim();
  const query = typed.startsWith("/")
    ? typed
    : `${selectedSource.value.path}/${typed}`;

  const token = ++browseToken;
  try {
    const { data } = await ImportSourceService.browse({
      path: query,
      dirs_only: true,
    });
    if (token === browseToken) suggestions.value = data;
  } catch {
    if (token === browseToken) suggestions.value = [];
  }
}

function chooseDirectory(entry) {
  form.value.originPath = entry.path;
  suggestions.value = [];
  if (!form.value.name) {
    form.value.name = entry.name;
    checkName();
  }
}

async function submit() {
  submitting.value = true;
  try {
    const { data } = await DatasetService.import({
      name: form.value.name,
      type: form.value.type,
      origin_path: form.value.originPath,
      owner_group_id: form.value.ownerGroup.id,
      description: form.value.description || undefined,
    });
    toast.success(`Imported ${data.dataset.name}`);
    emit("created", data.dataset);
    hide();
  } catch (err) {
    const status = err?.response?.status;
    if (status === 409) {
      toast.error(
        err.response.data?.message || "That directory or name is already taken",
      );
    } else if (status === 403) {
      toast.error("You cannot import from that location");
    } else {
      toast.error("Could not import the dataset");
    }
  } finally {
    submitting.value = false;
  }
}

async function loadSources() {
  loadingSources.value = true;
  try {
    const { data } = await ImportSourceService.list();
    sources.value = data;
    if (data.length === 1) form.value.sourceId = data[0].id;
  } catch {
    toast.error("Could not load your import sources");
  } finally {
    loadingSources.value = false;
  }
}

function show() {
  form.value = {
    sourceId: null,
    originPath: "",
    name: "",
    type: "RAW_DATA",
    description: "",
    ownerGroup: null,
  };
  suggestions.value = [];
  nameTaken.value = false;
  visible.value = true;
  loadSources();
}

function hide() {
  visible.value = false;
}
</script>
