<template>
  <VaModal
    v-model="visible"
    :title="modalTitle"
    hide-default-actions
    @cancel="hide"
  >
    <template #footer>
      <div class="flex items-center justify-end gap-5 mt-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="loading"
          :disabled="!confirmationValid"
          :color="props.isArchived ? 'success' : 'danger'"
          @click="confirm"
        >
          {{ props.isArchived ? "Unarchive Collection" : "Archive Collection" }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <div class="space-y-6">
        <!-- Unarchive variant -->
        <template v-if="props.isArchived">
          <div
            class="rounded-xl border border-green-200 bg-green-50/70 p-4 shadow-sm dark:border-green-800 dark:bg-green-950/40"
          >
            <div class="flex items-start gap-3">
              <div
                class="grid h-10 w-10 place-items-center rounded-full bg-green-600/15 text-green-600 dark:bg-green-300/15 dark:text-green-200"
              >
                <i-mdi-check-circle-outline class="text-2xl" />
              </div>

              <div class="space-y-1">
                <p
                  class="text-sm font-semibold text-gray-900 dark:text-gray-100"
                >
                  Unarchive
                  <span class="text-sky-600 dark:text-sky-300 font-semibold">
                    {{ props.collectionName }}
                  </span>
                </p>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  The collection will return to active state and its datasets
                  can be managed again.
                </p>
              </div>
            </div>
          </div>
        </template>

        <!-- Archive variant -->
        <template v-else>
          <p class="text-sm font-semibold text-gray-700 dark:text-gray-200">
            This action represents a governance boundary closure. Review what
            changes.
          </p>

          <div class="grid gap-4 md:grid-cols-2">
            <div
              class="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40"
            >
              <div class="flex items-start gap-3">
                <div
                  class="grid h-10 w-10 place-items-center rounded-full bg-emerald-600/15 text-emerald-600 dark:bg-emerald-300/15 dark:text-emerald-200"
                >
                  <i-mdi-check-circle-outline class="text-2xl" />
                </div>

                <div class="space-y-2">
                  <p
                    class="text-sm font-semibold text-emerald-900 dark:text-emerald-100"
                  >
                    PRESERVED
                  </p>
                  <ul
                    class="space-y-1 text-sm text-emerald-800 dark:text-emerald-200"
                  >
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-800 dark:bg-emerald-200"
                      />
                      Dataset ownership
                    </li>
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-800 dark:bg-emerald-200"
                      />
                      All existing grants
                    </li>
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-800 dark:bg-emerald-200"
                      />
                      Audit history
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              class="rounded-xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm dark:border-rose-700 dark:bg-rose-950/40"
            >
              <div class="flex items-start gap-3">
                <div
                  class="grid h-10 w-10 place-items-center rounded-full bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200"
                >
                  <i-mdi-alert class="text-xl" />
                </div>

                <div class="space-y-2">
                  <p
                    class="text-sm font-semibold text-rose-900 dark:text-rose-100"
                  >
                    PROHIBITED AFTER ARCHIVE
                  </p>
                  <ul
                    class="space-y-1 text-sm text-rose-800 dark:text-rose-200"
                  >
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-rose-700 dark:bg-rose-200"
                      />
                      Add / remove datasets
                    </li>
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-rose-700 dark:bg-rose-200"
                      />
                      Modify collection contents
                    </li>
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-rose-700 dark:bg-rose-200"
                      />
                      Update grants
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            This action is
            <strong class="text-gray-900 dark:text-gray-100">reversible</strong>
            — only a Platform Admin can unarchive. An audit record will be
            created.
          </p>

          <div
            v-if="affectedItems.length > 0"
            class="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300 border border-solid border-gray-300 dark:border-gray-700"
          >
            <div class="mb-2 font-semibold text-gray-700 dark:text-gray-200">
              Affected
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="item in affectedItems"
                :key="item.label"
                class="inline-flex items-center gap-2 rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <span class="font-semibold">{{ intl.format(item.count) }}</span>
                <span>{{ item.label }}</span>
              </span>
            </div>
          </div>

          <div
            v-if="props.collectionSlug"
            class="flex flex-col items-start gap-2"
          >
            <p class="text-sm text-gray-600 dark:text-gray-300">
              Type
              <span class="font-mono text-gray-900 dark:text-gray-100 mx-1">
                {{ props.collectionSlug }}
              </span>
              to confirm.
            </p>
            <VaInput
              class="w-full"
              ref="confirmationInput"
              v-model="confirmationText"
              :placeholder="props.collectionSlug"
              outline
            />
          </div>
        </template>
      </div>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import toast from "@/services/toast";
import { maybePluralize } from "@/services/utils";
import CollectionService from "@/services/v2/collections";

const props = defineProps({
  /** ID of the collection being archived/unarchived. */
  collectionId: { type: String, required: true },
  /** Name of the collection being archived/unarchived. */
  collectionName: { type: String, default: "" },
  /** Slug of the collection, used for confirmation input. */
  collectionSlug: { type: String, default: "" },
  /** If true, shows unarchive wording. */
  isArchived: { type: Boolean, default: false },
  /** Number of affected datasets (optional, shown in summary). */
  affectedDatasets: { type: Number, default: null },
});

const emit = defineEmits(["update"]);

const visible = ref(false);
const confirmationText = ref("");
const confirmationInput = ref(null);
const loading = ref(false);

function show() {
  confirmationText.value = "";
  visible.value = true;

  nextTick(() => {
    confirmationInput.value?.focus?.();
  });
}

function hide() {
  confirmationText.value = "";
  visible.value = false;
}

async function confirm() {
  loading.value = true;

  try {
    if (props.isArchived) {
      await CollectionService.unarchive(props.collectionId);
    } else {
      await CollectionService.archive(props.collectionId);
    }

    hide();
    toast.success(
      props.isArchived ? "Collection unarchived." : "Collection archived.",
    );
    emit("update");
  } catch (err) {
    toast.error(
      err?.response?.data?.message ??
        "Failed to complete the action. Please try again.",
    );
  } finally {
    loading.value = false;
  }
}

defineExpose({ show, hide });

const intl = new Intl.NumberFormat();

const modalTitle = computed(() =>
  props.isArchived
    ? `UNARCHIVE COLLECTION: ${props.collectionName}`
    : `ARCHIVE COLLECTION: ${props.collectionName}`,
);

const confirmationValid = computed(() => {
  if (props.isArchived) return true;
  if (!props.collectionSlug) return true;
  return confirmationText.value === props.collectionSlug;
});

const affectedItems = computed(() =>
  [
    props.affectedDatasets != null && {
      count: props.affectedDatasets,
      label: maybePluralize(props.affectedDatasets, "dataset", {
        showCount: false,
      }),
    },
  ].filter(Boolean),
);
</script>
