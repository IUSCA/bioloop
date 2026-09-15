<!--
  The persistent view of transfers that are still running.

  Sits in the app chrome, not in any page, because that is the point: the dialog closes and
  the transfer keeps going, so something outside the page has to show it. Collapsed it is one
  line; expanded it lists each dataset.

  Renders nothing when there is nothing to report.

  @see docs/design/groups/implementation/dataset-creation-plan.md — C3
-->
<template>
  <div
    v-if="store.list.length"
    class="fixed bottom-4 right-4 z-50 w-80 rounded-xl shadow-lg border bg-white dark:bg-gray-900 dark:border-gray-700"
  >
    <button
      type="button"
      class="w-full flex items-center gap-3 px-4 py-3 text-left"
      @click="expanded = !expanded"
    >
      <Icon
        :icon="
          store.hasActive
            ? 'mdi-cloud-upload-outline'
            : 'mdi-check-circle-outline'
        "
        :class="store.hasActive ? 'text-blue-500' : 'text-emerald-500'"
      />
      <span class="flex-1 text-sm font-medium">
        <template v-if="store.hasActive">
          Uploading {{ store.active.length }} dataset{{
            store.active.length === 1 ? "" : "s"
          }}
        </template>
        <template v-else>Uploads finished</template>
      </span>
      <span
        v-if="store.hasActive"
        class="text-xs text-gray-500 dark:text-gray-400"
      >
        {{ store.overallPercent }}%
      </span>
      <Icon :icon="expanded ? 'mdi-chevron-down' : 'mdi-chevron-up'" />
    </button>

    <VaProgressBar
      v-if="store.hasActive"
      :model-value="store.overallPercent"
      size="small"
      class="mx-4"
    />

    <div
      v-if="expanded"
      class="divide-y dark:divide-gray-700 max-h-72 overflow-y-auto"
    >
      <div
        v-for="t in store.list"
        :key="t.datasetId"
        class="px-4 py-3 space-y-1"
      >
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium truncate flex-1">{{
            t.datasetName
          }}</span>
          <VaButton
            v-if="t.status !== 'uploading'"
            preset="plain"
            size="small"
            icon="mdi-close"
            @click="store.dismiss(t.datasetId)"
          />
        </div>

        <div class="text-xs text-gray-500 dark:text-gray-400">
          <template v-if="t.status === 'uploading'">
            {{ t.filesDone }} of {{ t.filesTotal }} files ·
            {{ formatBytes(t.uploadedBytes) }} of
            {{ formatBytes(t.totalBytes) }}
          </template>
          <template v-else-if="t.status === 'finalizing'">
            Finishing up — the server is moving the files
          </template>
          <template v-else-if="t.status === 'complete'">
            Uploaded and queued for processing
          </template>
          <template v-else>
            {{ t.failures[0]?.message || "Upload failed" }}
          </template>
        </div>

        <VaProgressBar
          v-if="t.status === 'uploading'"
          :model-value="t.percent"
          size="small"
        />
      </div>
    </div>

    <div
      v-if="expanded && !store.hasActive"
      class="px-4 py-2 border-t dark:border-gray-700"
    >
      <VaButton preset="plain" size="small" @click="store.dismissFinished()">
        Clear finished
      </VaButton>
    </div>
  </div>
</template>

<script setup>
import { formatBytes } from "@/services/utils";
import { useUploadStore } from "@/stores/v2/upload";
import { onBeforeUnmount, onMounted, ref } from "vue";

const store = useUploadStore();
const expanded = ref(false);

/**
 * A File handle cannot outlive the document, so a reload ends every transfer no matter what
 * we do. Warning is the honest thing to offer.
 */
function warnIfUploading(event) {
  if (!store.hasActive) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", warnIfUploading));
onBeforeUnmount(() =>
  window.removeEventListener("beforeunload", warnIfUploading),
);
</script>
