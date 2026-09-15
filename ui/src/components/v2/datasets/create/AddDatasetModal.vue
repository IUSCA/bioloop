<!--
  The first question: is the data already on a filesystem we can read, or is it on this
  machine?

  Two cards rather than a dropdown, because the distinction decides everything that follows
  and is easy to get wrong. Import registers a directory and copies nothing; upload moves
  bytes out of this browser.

  @see docs/design/groups/implementation/dataset-creation-plan.md — A6
  @see docs/public/mockups/dataset-creation-screens.html
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
          class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        >
          <Icon icon="mdi-database-plus" />
        </div>
        <div>
          <h2 class="text-xl font-semibold">Add Dataset</h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            <template v-if="group">
              The new dataset will belong to
              <span class="font-semibold italic">{{ group.name }}</span
              >.
            </template>
            <template v-else>
              Choose how the data reaches Bioloop. You can pick the owning group
              next.
            </template>
          </p>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-3 mt-6">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
      </div>
    </template>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button
        v-for="choice in choices"
        :key="choice.key"
        type="button"
        class="text-left p-5 rounded-xl border-2 transition-colors border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
        @click="pick(choice.key)"
      >
        <div class="flex items-center gap-3 mb-3">
          <div
            class="flex items-center justify-center w-11 h-11 rounded-lg"
            :class="choice.iconClass"
          >
            <Icon :icon="choice.icon" class="text-2xl" />
          </div>
          <h3 class="text-lg font-semibold">{{ choice.title }}</h3>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {{ choice.description }}
        </p>

        <ul class="space-y-1">
          <li
            v-for="point in choice.points"
            :key="point"
            class="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400"
          >
            <Icon icon="mdi-check" class="mt-0.5 shrink-0" />
            <span>{{ point }}</span>
          </li>
        </ul>
      </button>
    </div>
  </VaModal>

  <ImportDatasetModal ref="importModal" :group="group" @created="onCreated" />
  <UploadDatasetModal ref="uploadModal" :group="group" @created="onCreated" />
</template>

<script setup>
import ImportDatasetModal from "@/components/v2/datasets/create/ImportDatasetModal.vue";
import UploadDatasetModal from "@/components/v2/datasets/create/UploadDatasetModal.vue";
import { ref } from "vue";

defineProps({
  // Set when opened from a group's page; the owning group is then fixed.
  group: { type: Object, required: false, default: null },
});

const emit = defineEmits(["created"]);

defineExpose({ show, hide });

const visible = ref(false);
const importModal = ref(null);
const uploadModal = ref(null);

const choices = [
  {
    key: "import",
    title: "Import",
    icon: "mdi-folder-search-outline",
    iconClass:
      "bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400",
    description:
      "The data is already on a filesystem Bioloop can read — an instrument drop location, for example.",
    points: [
      "Nothing is copied; the directory is registered where it is",
      "Finishes immediately, however large the data",
      "You pick the directory from your group's import sources",
    ],
  },
  {
    key: "upload",
    title: "Upload",
    icon: "mdi-cloud-upload-outline",
    iconClass:
      "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    description:
      "The data is on this computer. Files are sent from your browser to Bioloop.",
    points: [
      "Transfers continue while you use the rest of the app",
      "Each file is checksummed and verified on arrival",
      "Reloading the page ends the transfer",
    ],
  },
];

function pick(key) {
  visible.value = false;
  if (key === "import") importModal.value.show();
  else uploadModal.value.show();
}

function onCreated(dataset) {
  emit("created", dataset);
}

function show() {
  visible.value = true;
}

function hide() {
  visible.value = false;
}
</script>
