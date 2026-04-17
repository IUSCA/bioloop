<template>
  <va-modal
    v-model="visible"
    title="Data Access Options"
    fixed-layout
    hide-default-actions
  >
    <div class="flex flex-col gap-2 mb-3">
      <p class="text-sm va-text-secondary leading-relaxed">
        There are multiple methods available to access the dataset. Please
        select the option that best fits your needs. Use care when downloading
        datasets outside of the IU network; large datasets can consume a
        significant portion of a home ISP's monthly data cap. Transfers within
        IU's network will likely experience better performance than external
        transfers.
      </p>

      <div class="mt-3 flex flex-col gap-2">
        <!-- Direct Download (Individual Files) -->
        <button
          type="button"
          class="access-option-btn group"
          @click="handleDirectDownload"
        >
          <span
            class="access-option-icon bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"
          >
            <i-mdi-monitor-arrow-down class="text-xl" />
          </span>
          <span class="flex flex-col items-start text-left min-w-0">
            <span class="access-option-title"
              >Direct Download
              <span class="access-option-tag">Individual Files</span>
            </span>
            <span class="access-option-desc">
              Browse and download individual files. Bandwidth usage depends on
              what you download.
            </span>
          </span>
        </button>

        <!-- Download Archive -->
        <button
          v-if="hasBundleName"
          type="button"
          class="access-option-btn group"
          :disabled="archiveLoading"
          @click="initiate_dataset_download"
        >
          <span
            class="access-option-icon bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400"
          >
            <i-mdi-folder-zip-outline v-if="!archiveLoading" class="text-xl" />
            <i-mdi-loading v-else class="text-xl animate-spin" />
          </span>
          <span class="flex flex-col items-start text-left min-w-0">
            <span class="access-option-title">Download Archive</span>
            <span class="access-option-desc">
              Download the entire dataset as a single
              <span class="font-medium text-gray-700 dark:text-gray-300">
                .tar
              </span>
              archive.
              <template v-if="props.dataset?.bundle?.size != null">
                Transfer will use
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  {{ formatBytes(props.dataset?.bundle?.size) }}
                </span>
                of bandwidth.
              </template>
            </span>
          </span>
        </button>

        <!-- IU Storage -->
        <button
          type="button"
          class="access-option-btn group"
          @click="handleCopyPath"
        >
          <span
            class="access-option-icon bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
          >
            <i-mdi-check-bold v-if="pathCopied" class="text-xl" />
            <i-mdi-console v-else class="text-xl" />
          </span>
          <span class="flex flex-col items-start text-left min-w-0">
            <span class="access-option-title">
              IU Storage
              <span
                v-if="pathCopied"
                class="access-option-tag !bg-emerald-100 !text-emerald-700 dark:!bg-emerald-900/60 dark:!text-emerald-300"
              >
                Path copied!
              </span>
            </span>
            <span class="access-option-desc">
              Access data directly through IU's computing clusters.
            </span>
            <span
              class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-full"
            >
              {{ downloadPath }}
            </span>
          </span>
        </button>
      </div>
    </div>
  </va-modal>
</template>

<script setup>
import config from "@/config";
import datasetService from "@/services/dataset";
import statisticsService from "@/services/statistics";
import toast from "@/services/toast";
import { downloadFile, formatBytes } from "@/services/utils";
import { useClipboard } from "@vueuse/core";

const props = defineProps({
  dataset: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["navigate-to-files"]);

defineExpose({ show, hide });

const { copy, copied: pathCopied } = useClipboard({ copiedDuring: 2500 });

const archiveLoading = ref(false);

const hasBundleName = computed(
  () => !!datasetService.get_bundle_name(props.dataset),
);

const downloadPath = computed(
  () => `${config.paths.download}/${props.dataset.metadata?.stage_alias}`,
);

function handleDirectDownload() {
  hide();
  emit("navigate-to-files");
}

function handleCopyPath() {
  copy(downloadPath.value);
  statisticsService
    .log_data_access({
      access_type: config.download_types.SLATE_SCRATCH,
      file_id: null,
      dataset_id: props.dataset.id,
    })
    .catch((e) => {
      console.log("Unable to log data access attempt", e);
    });
}

const initiate_dataset_download = () => {
  archiveLoading.value = true;
  datasetService
    .get_file_download_data({ dataset_id: props.dataset.id })
    .then((res) => {
      const url = new URL(res.data.url);
      url.searchParams.set("token", res.data.bearer_token);
      downloadFile({ url: url.toString(), filename: props.dataset.name });
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to initiate dataset download");
    })
    .finally(() => {
      archiveLoading.value = false;
    });
};

const visible = ref(false);

function hide() {
  visible.value = false;
}

function show() {
  visible.value = true;
}
</script>

<style scoped>
.access-option-btn {
  @apply flex items-start gap-4 w-full rounded-lg px-4 py-3.5 text-left
    border border-solid border-gray-200 dark:border-gray-700
    bg-white dark:bg-gray-800/40
    transition-all duration-150 cursor-pointer
    hover:border-blue-400 dark:hover:border-blue-500
    hover:bg-blue-50/50 dark:hover:bg-blue-900/10
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
    disabled:opacity-50 disabled:cursor-not-allowed;
}

.access-option-icon {
  @apply flex items-center justify-center shrink-0 w-10 h-10 rounded-lg;
}

.access-option-title {
  @apply flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug;
}

.access-option-tag {
  @apply inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-none
    bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300;
}

.access-option-desc {
  @apply mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed;
}
</style>
