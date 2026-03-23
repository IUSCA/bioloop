<template>
  <VaModal
    v-model="visible"
    size="large"
    hide-default-actions
    no-outside-dismiss
    @cancel="hide"
  >
    <!-- ── HEADER ─────────────────────────────────── -->
    <template #header>
      <div
        class="flex items-start gap-4 pb-3 border-b border-solid border-gray-200 dark:border-gray-700/60"
      >
        <div
          class="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 text-emerald-500 dark:text-emerald-400"
        >
          <Icon icon="mdi-database-plus-outline" class="text-xl" />
        </div>
        <div class="min-w-0">
          <h2
            class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100"
          >
            Add datasets to collection
          </h2>
          <p class="mt-0.5 text-sm text-gray-500 dark:text-gray-400 leading-5">
            Only datasets owned by the same group as this collection can be
            added. Each addition immediately extends access to all existing
            grant holders.
          </p>
        </div>
      </div>
    </template>

    <!-- ── BODY ──────────────────────────────────── -->
    <div class="px-3 mt-5 space-y-3">
      <!-- Governance alert -->
      <div
        class="flex gap-3 items-start rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-solid border-amber-200 dark:border-amber-700/50 px-4 py-3.5"
      >
        <Icon
          icon="mdi-shield-alert-outline"
          class="shrink-0 mt-0.5 text-amber-500 dark:text-amber-400 text-lg"
        />
        <div class="min-w-0">
          <p
            class="text-sm font-medium text-amber-800 dark:text-amber-300 leading-5"
          >
            Authorization scope change
          </p>
          <p
            class="mt-0.5 text-sm text-amber-700 dark:text-amber-400/80 leading-5"
          >
            Adding datasets expands this collection's authorization footprint.
            All subjects with active grants on this collection will
            <strong class="font-semibold">immediately gain access</strong>
            to any newly added datasets. This operation is audited.
          </p>
        </div>
      </div>

      <!-- Dataset search/select — delegates to existing component -->
      <div>
        <DatasetSearchSelect
          :disabled="loading"
          v-model:selected="selectedDatasets"
          :owner-group-id="props.ownerGroupId"
        />
      </div>
    </div>

    <!-- ── FOOTER ─────────────────────────────────── -->
    <template #footer>
      <div class="flex items-center justify-between gap-3 px-3 py-4">
        <!-- Selection summary -->
        <p class="text-sm text-gray-500 dark:text-gray-400">
          <template v-if="selectedDatasets.length > 0">
            <span class="font-medium text-gray-700 dark:text-gray-300">{{
              selectedDatasets.length
            }}</span>
            {{ selectedDatasets.length === 1 ? "dataset" : "datasets" }}
            selected
          </template>
          <template v-else> No datasets selected </template>
        </p>

        <div class="flex items-center gap-2.5">
          <VaButton
            preset="secondary"
            class="!text-sm !font-medium"
            :disabled="loading"
            @click="hide"
          >
            Cancel
          </VaButton>
          <VaButton
            color="primary"
            class="!text-sm !font-medium"
            :loading="loading"
            :disabled="loading || selectedDatasets.length === 0"
            @click="confirmAddDatasets"
          >
            <template v-if="selectedDatasets.length > 0">
              Add {{ maybePluralize(selectedDatasets.length, "Dataset") }}
            </template>
            <template v-else> Add Datasets </template>
          </VaButton>
        </div>
      </div>
    </template>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import { maybePluralize } from "@/services/utils";
import CollectionService from "@/services/v2/collections";

const props = defineProps({
  collectionId: { type: String, required: true },
  ownerGroupId: { type: String, required: true },
});

const emit = defineEmits(["update"]);

defineExpose({ show, hide });

const visible = ref(false);
const loading = ref(false);
const selectedDatasets = ref([]);

function show() {
  selectedDatasets.value = [];
  visible.value = true;
}

function hide() {
  visible.value = false;
}

function confirmAddDatasets() {
  loading.value = true;

  const datasetIds = selectedDatasets.value.map((d) => d.resource_id);

  CollectionService.addDatasets(props.collectionId, datasetIds)
    .then(() => {
      toast.success(
        `${maybePluralize(selectedDatasets.value.length, "Dataset")} added to collection.`,
      );
      emit("update");
      hide();
    })
    .catch((error) => {
      console.error("Error adding datasets to collection:", error);
      toast.error(
        error?.response?.data?.message ||
          "Failed to add datasets to collection.",
      );
    })
    .finally(() => {
      loading.value = false;
    });
}
</script>
