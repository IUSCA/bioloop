<template>
  <va-modal
    v-model="visible"
    title="Data Access Options"
    no-outside-dismiss
    fixed-layout
    hide-default-actions
  >
    <div class="">
      <!-- sm:w-full -->
      <span class="va-text-secondary">
        There are multiple methods available to access the project data. Please
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
              <span class="text-lg">Direct Download</span>
              <span class="px-1"> - </span>
              <span class=""> Transfer will use 450 MB of bandwidth </span>
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
            <CopyButton :text="downloadPath" preset="secondary" />
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
import config from "@/config";

const props = defineProps({
  dataset: {
    type: Object,
    default: () => ({}),
  },
  projectId: {
    type: String,
  },
});
// const emit = defineEmits(["update"]);

// parent component can invoke these methods through the template ref
defineExpose({
  show,
  hide,
});

const downloadURL = computed(() => {
  return `${window.location.origin}/datasets/filebrowser/${props.dataset?.id}`;
});

const downloadPath = computed(() => {
  return `${config.paths.download}/${props.dataset.metadata?.download_alias}`;
});

const visible = ref(false);

function hide() {
  visible.value = false;
}

function show() {
  visible.value = true;
}
</script>
