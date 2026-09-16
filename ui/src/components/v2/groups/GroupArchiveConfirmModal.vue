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
          :color="unarchiving ? 'success' : 'danger'"
          @click="confirm"
        >
          {{ unarchiving ? "Unarchive Group" : "Archive Group" }}
        </VaButton>
      </div>
    </template>

    <VaInnerLoading :loading="loading">
      <div class="space-y-6">
        <!-- Unarchive variant -->
        <template v-if="unarchiving">
          <div
            class="rounded-lg border border-solid border-green-200 bg-green-50/70 p-4 shadow-sm dark:border-green-800 dark:bg-green-950/40"
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
                  The group will return to active state and members, resources,
                  and grants can be managed again.
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
              class="rounded-lg border border-solid border-emerald-200 bg-emerald-50/70 p-4 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40"
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
                      Dataset and Collection ownership
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
                      Membership (frozen)
                    </li>
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-800 dark:bg-emerald-200"
                      />
                      Audit history
                    </li>
                    <li class="flex items-start gap-2">
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-emerald-800 dark:bg-emerald-200"
                      />
                      Hierarchy relationships
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              class="rounded-lg border border-solid border-rose-200 bg-rose-50/70 p-4 shadow-sm dark:border-rose-700 dark:bg-rose-950/40"
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
                    <li
                      v-for="label in prohibited"
                      :key="label"
                      class="flex items-start gap-2"
                    >
                      <span
                        class="mt-1 inline-block h-2 w-2 rounded-full bg-rose-700 dark:bg-rose-200"
                      />
                      {{ label }}
                    </li>
                  </ul>
                </div>
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
            class="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300 border border-solid border-gray-300 dark:border-gray-700"
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
              class="w-full"
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
import { maybePluralize } from "@/services/utils";
import GroupService from "@/services/v2/groups";
import StateService from "@/services/v2/states";
import { prohibitedLabels } from "@/services/v2/stateLabels";

const props = defineProps({
  /** ID of the group being archived/unarchived. */
  groupId: { type: String, required: true },
  /** Name of the group being archived/unarchived. */
  groupName: { type: String, default: "" },
  /** Slug of the group, used for confirmation input. */
  groupSlug: { type: String, default: "" },
  /**
   * Which action this dialog confirms: `archive` or `unarchive`.
   *
   * The action the toggle offered, rather than the group's archived column. The two agree
   * today, and taking the action keeps the dialog from confirming one thing while the page
   * offered another: what the page offers comes from `_meta.available_actions`.
   *
   * @see docs/design/groups/decisions.md — 17. Resource state is checked after authorization
   */
  action: {
    type: String,
    default: "archive",
    validator: (value) => ["archive", "unarchive"].includes(value),
  },
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

/** Whether this dialog is confirming the way back out. */
const unarchiving = computed(() => props.action === "unarchive");

const visible = ref(false);
const confirmationText = ref("");
const confirmationInput = ref(null);
const loading = ref(false);

// What archiving stops, from each resource type's own state rules. A group's archive dialog
// lists the group itself and what it owns.
const ARCHIVE_SCOPE = [
  "group",
  "collection",
  "dataset",
  "grant",
  "access_request",
];
const blockedActions = ref([]);
const prohibited = computed(() =>
  prohibitedLabels(blockedActions.value, ARCHIVE_SCOPE),
);

async function loadBlockedActions() {
  try {
    // One call per resource type, because what archiving forbids is the resource's answer.
    const answers = await Promise.all(
      ARCHIVE_SCOPE.map((type) =>
        StateService.forbiddenActions(type, "archived"),
      ),
    );
    blockedActions.value = answers.flatMap((res, i) =>
      res.data.forbidden_actions.map((f) => `${ARCHIVE_SCOPE[i]}.${f.action}`),
    );
  } catch {
    // Nothing is listed rather than a list that may be wrong.
    blockedActions.value = [];
  }
}

function show() {
  confirmationText.value = "";
  visible.value = true;
  if (!unarchiving.value) loadBlockedActions();

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
    if (unarchiving.value) {
      await GroupService.unarchive(props.groupId);
    } else {
      await GroupService.archive(props.groupId);
    }

    hide();
    toast.success(unarchiving.value ? "Group unarchived." : "Group archived.");
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
  unarchiving.value
    ? `UNARCHIVE GROUP: ${props.groupName}`
    : `ARCHIVE GROUP: ${props.groupName}`,
);

const confirmationValid = computed(() => {
  if (unarchiving.value) return true;
  if (!props.groupSlug) return true;
  return confirmationText.value === props.groupSlug;
});

const affectedItems = computed(() =>
  [
    props.affectedMembers != null && {
      count: props.affectedMembers,
      label: maybePluralize(props.affectedMembers, "member", {
        showCount: false,
      }),
    },
    props.affectedDatasets != null && {
      count: props.affectedDatasets,
      label: maybePluralize(props.affectedDatasets, "dataset", {
        showCount: false,
      }),
    },
    // props.affectedSubgroups != null && {
    //   count: props.affectedSubgroups,
    //   label: maybePluralize(props.affectedSubgroups, "subgroup", {showCount: false,}),
    // },
    props.affectedCollections != null && {
      count: props.affectedCollections,
      label: maybePluralize(props.affectedCollections, "collection", {
        showCount: false,
      }),
    },
  ].filter(Boolean),
);
</script>
