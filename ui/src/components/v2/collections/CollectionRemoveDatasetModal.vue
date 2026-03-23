<template>
  <VaModal
    v-model="visible"
    size="medium"
    hide-default-actions
    no-outside-dismiss
    @cancel="hide"
  >
    <!-- ── HEADER ─────────────────────────────────── -->
    <template #header>
      <div
        class="flex items-center gap-4 pb-3 border-b border-solid border-gray-200 dark:border-gray-700/60"
      >
        <div
          class="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/10 ring-1 ring-red-500/20 text-red-500 dark:text-red-400"
        >
          <Icon icon="mdi-database-minus-outline" class="text-xl" />
        </div>
        <div class="min-w-0">
          <h2
            class="text-base font-semibold leading-6 text-gray-900 dark:text-gray-100"
          >
            Remove dataset from collection
          </h2>
        </div>
      </div>
    </template>

    <!-- ── BODY ──────────────────────────────────── -->
    <div class="px-3 mt-5 space-y-3">
      <!-- Governance alert -->
      <div
        class="flex gap-3 items-start rounded-lg bg-amber-50 dark:bg-amber-950/30 border-solid border-amber-200 dark:border-amber-700/50 px-4 py-3.5"
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
            Removing a dataset narrows this collection's authorization
            footprint. Subjects whose access is <em>solely</em> derived from
            this collection's grants will
            <strong class="font-semibold">immediately lose access</strong> to
            the dataset. This operation is audited.
          </p>
        </div>
      </div>

      <!-- Confirmation block -->
      <div
        class="rounded-lg border border-solid border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 overflow-hidden"
      >
        <!-- Dataset being removed -->
        <div
          class="flex items-center gap-3 px-4 py-3.5 border-b border-solid border-red-200 dark:border-red-800/60"
        >
          <div
            class="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400"
          >
            <Icon icon="mdi-database-outline" class="text-base" />
          </div>
          <div class="min-w-0 flex-1">
            <p
              class="text-sm font-mono font-semibold text-gray-900 dark:text-gray-100 truncate"
            >
              {{ dataset?.name ?? "—" }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Will be removed from
              <span class="font-medium text-gray-700 dark:text-gray-300">
                {{ props.collection?.name ?? "this collection" }}
              </span>
            </p>
          </div>
          <span
            class="shrink-0 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-full ring-1 ring-red-200 dark:ring-red-700/50"
          >
            Removing
          </span>
        </div>

        <!-- Consequence list -->
        <ul class="px-4 py-3.5 space-y-2">
          <li
            class="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-5"
          >
            <Icon
              icon="mdi-account-key-outline"
              class="shrink-0 mt-0.5 text-base"
            />
            <span>
              Subjects whose access derives <em>exclusively</em> from this
              collection's grants will lose access to this dataset immediately.
            </span>
          </li>
          <li
            class="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-5"
          >
            <Icon
              icon="mdi-shield-check-outline"
              class="shrink-0 mt-0.5 text-base"
            />
            <span>
              Dataset ownership and direct grants are unaffected — only this
              collection's membership is changed.
            </span>
          </li>
          <li
            class="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 leading-5"
          >
            <Icon
              icon="mdi-clipboard-text-clock-outline"
              class="shrink-0 mt-0.5 text-base"
            />
            <span>
              This change is recorded in the audit log with full provenance.
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- ── FOOTER ─────────────────────────────────── -->
    <template #footer>
      <div class="flex items-center justify-end gap-2.5 px-3 py-4">
        <VaButton
          preset="secondary"
          class="!text-sm !font-medium"
          :disabled="loading"
          @click="hide"
        >
          Cancel
        </VaButton>
        <VaButton
          color="danger"
          class="!text-sm !font-medium"
          :loading="loading"
          :disabled="loading"
          @click="removeDataset"
        >
          <Icon icon="mdi-database-minus-outline" class="mr-1 text-base" />
          Remove Dataset
        </VaButton>
      </div>
    </template>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import CollectionService from "@/services/v2/collections";

const props = defineProps({
  collection: { type: Object, required: true },
});

const emit = defineEmits(["update"]);

defineExpose({ show, hide });

const visible = ref(false);
const loading = ref(false);
const dataset = ref(null);

function show(selectedDataset) {
  if (!selectedDataset) {
    console.warn("CollectionRemoveDatasetModal: no dataset provided");
    return;
  }
  dataset.value = selectedDataset;
  visible.value = true;
}

function hide() {
  visible.value = false;
  dataset.value = null;
}

async function removeDataset() {
  loading.value = true;
  try {
    await CollectionService.removeDataset(
      props.collection.id,
      dataset.value.resource_id,
    );
    toast.success(`${dataset.value.name} removed from collection.`);
    emit("update");
    hide();
  } catch (err) {
    console.error("Failed to remove dataset:", err);
    toast.error(
      err?.response?.data?.message ??
        "Failed to remove dataset from collection.",
    );
  } finally {
    loading.value = false;
  }
}
</script>
