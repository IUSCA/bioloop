<template>
  <VaModal
    v-model="visible"
    :title="modalTitle"
    hide-default-actions
    @cancel="hide"
  >
    <template #footer>
      <div class="flex items-center justify-end gap-5">
        <VaButton preset="secondary" @click="hide">Cancel</VaButton>
        <VaButton
          :loading="loading"
          :disabled="!confirmationValid"
          :color="props.unarchive ? 'success' : 'danger'"
          @click="confirm"
        >
          {{ props.unarchive ? "Unarchive Group" : "Archive Group" }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <div class="space-y-6">
        <!-- Unarchive variant -->
        <template v-if="props.unarchive">
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
                  <span class="text-sky-600 dark:text-sky-300 font-semibold">{{
                    props.groupName
                  }}</span>
                </p>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  The group will return to active state and members can be
                  managed again.
                </p>
              </div>
            </div>
          </div>
        </template>

        <!-- Archive variant -->
        <template v-else>
          <!-- Warning box -->
          <div
            class="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/80 to-amber-100/60 p-4 shadow-sm dark:border-amber-700 dark:from-amber-950/40 dark:to-amber-950/30"
          >
            <div class="flex items-start gap-3">
              <div
                class="grid h-10 w-10 place-items-center rounded-full bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
              >
                <i-mdi-alert class="text-xl" />
              </div>

              <div class="space-y-2 text-sm">
                <p class="font-semibold text-amber-900 dark:text-amber-100">
                  This will permanently freeze the group.
                </p>
                <p class="text-amber-800 dark:text-amber-300">
                  Membership becomes read-only — no members can be added or
                  removed.
                </p>
                <p class="text-amber-800 dark:text-amber-300">
                  No new datasets, collections, or grants can be created under
                  this group.
                </p>
                <p class="text-amber-600 dark:text-amber-400">
                  Existing grants and dataset ownership remain intact.
                </p>
              </div>
            </div>
          </div>

          <!-- Reversible note -->
          <p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            This action is
            <strong class="text-gray-900 dark:text-gray-100">reversible</strong>
            — only a Platform Admin can unarchive. An audit record will be
            created.
          </p>

          <!-- Affected counts -->
          <div
            v-if="affectedItems.length > 0"
            class="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300"
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
                <span class="font-semibold">{{ item.count }}</span>
                <span>{{ item.label }}</span>
              </span>
            </div>
          </div>

          <!-- Confirmation input -->
          <div v-if="props.groupSlug" class="flex flex-col items-start gap-2">
            <p class="text-sm text-gray-600 dark:text-gray-300">
              Type
              <span class="font-mono text-gray-900 dark:text-gray-100 mx-1">
                {{ props.groupSlug }}
              </span>
              to confirm.
            </p>
            <VaInput
              class="w-full max-w-lg"
              ref="confirmationInput"
              v-model="confirmationText"
              :placeholder="props.groupSlug"
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
import GroupService from "@/services/v2/groups";

const props = defineProps({
  /** ID of the group being archived/unarchived. */
  groupId: { type: String, required: true },
  /** Name of the group being archived/unarchived. */
  groupName: { type: String, default: "" },
  /** Slug of the group, used for confirmation input. */
  groupSlug: { type: String, default: "" },
  /** If true, shows unarchive wording. */
  unarchive: { type: Boolean, default: false },
  /** Number of affected members (optional, shown in summary). */
  affectedMembers: { type: Number, default: null },
  /** Number of affected datasets (optional, shown in summary). */
  affectedDatasets: { type: Number, default: null },
  /** Number of affected subgroups (optional, shown in summary). */
  affectedSubgroups: { type: Number, default: null },
  /** Number of affected collections (optional, shown in summary). */
  affectedCollections: { type: Number, default: null },
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
    if (props.unarchive) {
      await GroupService.unarchive(props.groupId);
    } else {
      await GroupService.archive(props.groupId);
    }

    hide();
    toast.success(props.unarchive ? "Group unarchived." : "Group archived.");
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

const modalTitle = computed(() =>
  props.unarchive
    ? `Unarchive "${props.groupName}"?`
    : `Archive "${props.groupName}"?`,
);

const confirmationValid = computed(() => {
  if (props.unarchive) return true;
  if (!props.groupSlug) return true;
  return confirmationText.value === props.groupSlug;
});

const affectedItems = computed(() =>
  [
    props.affectedMembers != null && {
      count: props.affectedMembers,
      label: props.affectedMembers === 1 ? "member" : "members",
    },
    props.affectedDatasets != null && {
      count: props.affectedDatasets,
      label: props.affectedDatasets === 1 ? "dataset" : "datasets",
    },
    props.affectedSubgroups != null && {
      count: props.affectedSubgroups,
      label: props.affectedSubgroups === 1 ? "subgroup" : "subgroups",
    },
    props.affectedCollections != null && {
      count: props.affectedCollections,
      label: props.affectedCollections === 1 ? "collection" : "collections",
    },
  ].filter(Boolean),
);
</script>
