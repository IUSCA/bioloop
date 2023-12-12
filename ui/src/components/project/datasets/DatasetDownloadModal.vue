<template>
  <va-modal
    v-model="visible"
    title="Data Access Options"
    fixed-layout
    hide-default-actions
  >
    <div class="">
      <!-- sm:w-full -->
      <span class="va-text-secondary">
        There are multiple methods available to access the dataset. Please
        select the option that best fits your needs. Use care when downloading
        datasets outside of the IU network; large datasets can consume a
        significant portion of a home ISP's monthly data cap. Transfers within
        IU's network will likely experience better performance than external
        transfers.
      </span>

      <va-list class="mt-4 flex flex-col gap-3">
        <!-- Direct Download -->
        <va-list-item>
          <!-- icon -->
          <va-list-item-section avatar>
            <i-mdi:monitor-arrow-down class="text-2xl" />
          </va-list-item-section>

          <!-- Name and caption -->
          <va-list-item-section>
            <va-list-item-label>
              <span class="text-lg">Direct Download (Individual Files)</span>
              <span class="px-1"> - </span>
              <span class="">
                Transfer of all files will use
                {{ formatBytes(dataset.du_size) }} of bandwidth
              </span>
            </va-list-item-label>

            <va-list-item-label caption>
              <span> {{ downloadURL }} </span>
            </va-list-item-label>
          </va-list-item-section>

          <!-- Action icon -->
          <va-list-item-section class="flex-none">
            <a target="_blank" :href="downloadURL">
              <va-button
                preset="secondary"
                icon="open_in_new"
                color="primary"
                round
                class="self-end"
              />
            </a>
          </va-list-item-section>
        </va-list-item>

        <!-- Direct Download -->
        <va-list-item>
          <!-- icon -->
          <va-list-item-section avatar>
            <i-mdi:folder-zip-outline class="text-2xl" />
          </va-list-item-section>

          <!-- .tar file download -->
          <va-list-item-section>
            <va-list-item-label>
              <span class="text-lg">Download Archive</span>
              <span class="px-1"> - </span>
              <span class="">
                Size: {{ formatBytes(dataset.bundle.size) }}
              </span>
            </va-list-item-label>
          </va-list-item-section>

          <!-- Action icon -->
          <va-list-item-section class="flex-none">
            <va-button
              preset="secondary"
              icon="download"
              color="primary"
              round
              class="self-end"
              @click="initiate_dataset_download"
            />
          </va-list-item-section>
        </va-list-item>

        <!-- IU Storage -->
        <va-list-item>
          <!-- icon -->
          <va-list-item-section avatar>
            <i-mdi:console class="text-2xl" />
          </va-list-item-section>

          <!-- Name and caption -->
          <va-list-item-section>
            <va-list-item-label>
              <span class="text-lg">IU Storage</span>
              <span class="px-1"> - </span>
              <span class="">
                Access data directly through IU's computing clusters
              </span>
            </va-list-item-label>

            <va-list-item-label caption>
              <span>
                {{ downloadPath }}
              </span>
            </va-list-item-label>
          </va-list-item-section>

          <!-- Action icon -->
          <va-list-item-section class="flex-none">
            <CopyButton
              :text="downloadPath"
              preset="secondary"
              @text-copied="log_data_access"
            />
          </va-list-item-section>
        </va-list-item>
      </va-list>
    </div>

    <template #footer>
      <div class="flex w-full justify-end gap-5">
        <va-button preset="secondary" class="flex-none" @click="hide">
          CLOSE
        </va-button>
      </div>
    </template>
  </va-modal>
</template>

<script setup>
import statisticsService from "@/services/statistics";
import datasetService from "@/services/dataset";
import config from "@/config";
import { formatBytes, downloadFile } from "@/services/utils";
import { useToastStore } from "@/stores/toast";

const props = defineProps({
  dataset: {
    type: Object,
    default: () => ({}),
  },
});
// const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const toast = useToastStore();

const downloadURL = computed(() => {
  return `${window.location.origin}/datasets/${props.dataset?.id}/filebrowser`;
});

const downloadPath = computed(() => {
  return `${config.paths.download}/${props.dataset.metadata?.stage_alias}`;
});

const log_data_access = () => {
  statisticsService
    .log_data_access({
      access_type: config.download_types.SLATE_SCRATCH,
      file_id: null,
      dataset_id: props.dataset.id,
    })
    .catch((e) => {
      console.log("Unable to log data access attempt", e);
      toast.error("Unable to log data access attempt");
    });
};

const initiate_dataset_download = () => {
  datasetService
    .get_file_download_data({
      dataset_id: props.dataset.id,
    })
    .then((res) => {
      const url = new URL(res.data.url);
      url.searchParams.set("token", res.data.bearer_token);
      downloadFile({
        url: url.toString(),
        filename: props.dataset.name,
      });
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to initiate dataset download");
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
