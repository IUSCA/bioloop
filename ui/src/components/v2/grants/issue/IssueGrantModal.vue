<template>
  <VaModal
    v-model="visible"
    hide-default-actions
    @cancel="hide"
    size="large"
    close-button
    no-outside-dismiss
  >
    <template #header>
      <div class="mb-3">
        <div class="flex items-center gap-3">
          <div
            class="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
          >
            <Icon :icon="constants.icons.grant" class="text-2xl" />
          </div>
          <div>
            <h2 class="text-xl font-semibold">Grant Access</h2>
            <span class="text-sm text-gray-600 dark:text-gray-400">
              Issue access grants to a user or group
            </span>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div
        class="w-full flex items-center justify-between gap-4 border-t border-solid border-gray-200 dark:border-gray-600 pt-4"
      >
        <p class="text-xs text-gray-400 dark:text-gray-500">
          {{ selectionSummary }}
        </p>

        <div class="flex items-center justify-end gap-5">
          <VaButton preset="secondary" @click="hide">Cancel</VaButton>
          <VaButton
            :loading="loading"
            :disabled="!enableGrantButton"
            @click="confirm"
          >
            Grant Access
          </VaButton>
        </div>
      </div>
    </template>

    <!-- modal content -->
    <VaInnerLoading :loading="loading || accessTypesLoading || presetsLoading">
      <ErrorState
        v-if="accessTypesError || presetsError"
        :message="accessTypesError || presetsError"
        @retry="
          refreshAccessTypes();
          refreshPresets();
        "
      />

      <div v-else>
        <div
          class="min-h-[calc(100vh-15rem)] grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <!-- left -->
          <div class="col-span-2 flex flex-col gap-3">
            <!-- Resource header -->
            <ResourceChip :resource="props.resource" />

            <!-- subject selector -->
            <ModernCard title="Subject">
              <SubjectSelector
                :resource-owner-group-id="resourceOwningGroupId"
                v-model="subject"
              />
            </ModernCard>

            <!-- Divider -->
            <!-- <div
            class="border-t border-solid border-gray-200 dark:border-gray-600"
          /> -->

            <!-- Access: preset + individual together -->
            <ModernCard>
              <template #title>
                <div class="flex items-center gap-2">
                  Access
                  <span
                    class="text-xs normal-case tracking-normal font-normal text-gray-400 dark:text-gray-500"
                  >
                    (Choose one preset, individual types, or both.)
                  </span>
                </div>
              </template>
              <div>
                <!-- <p class="mb-0.5 text-sm font-medium uppercase tracking-wide">
                Access
              </p> -->
                <!-- <p class="mb-3 text-xs va-text-secondary">
                Choose one preset, individual types, or both.
              </p> -->

                <!-- <p class="mb-2 text-sm font-medium">Preset</p> -->
                <PresetSelector :presets="presets" v-model="selectedPreset" />

                <!-- Section divider -->
                <div class="my-4 flex items-center gap-3">
                  <div class="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
                  <span class="text-xs tracking-wide font-medium">
                    Additional access types
                  </span>
                  <div class="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
                </div>

                <AccessTypeSelector
                  :access-types="accessTypes"
                  :preset-covered-ids="presetCoveredIds"
                  v-model="selectedTypes"
                />
              </div>
            </ModernCard>
            <!-- Divider -->
            <!-- <div
            class="border-t border-solid border-gray-200 dark:border-gray-600"
          /> -->

            <!-- Expiry -->
            <ModernCard title="Expiry">
              <ExpirySelector v-model="expiry" />
            </ModernCard>

            <!-- Justification -->
            <div>
              <p class="mb-2 text-sm font-medium uppercase tracking-wide">
                Justification
                <span
                  class="normal-case tracking-normal font-normal va-text-secondary"
                >
                  (optional)
                </span>
              </p>
              <VaTextarea
                v-model="justification"
                placeholder="Reason for granting this access…"
                class="w-full"
                :min-rows="2"
                :max-rows="3"
              />
            </div>
          </div>

          <!-- right -->
          <div class="col-span-1">
            <!-- Effective grants preview -->

            <div class="sticky top-4">
              <EffectiveGrantsPreview
                v-if="isFormValid"
                :rows="previewGrants"
                :loading="previewLoading"
                :error="previewError"
                :subject-name="subject?.name"
                :access-type-map="accessTypeMap"
              />
              <div
                v-else
                class="flex flex-col items-center justify-center gap-2 p-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/40"
              >
                <Icon
                  icon="mdi-information-outline"
                  class="text-3xl text-gray-400 dark:text-gray-500"
                />
                <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Select a subject and access types to preview the effective
                  grants that will be issued.
                </p>
              </div>
            </div>
          </div>
        </div>

        <GrantScopeMessage
          v-if="isFormValid"
          :subject-type="subject?.type"
          :resource-type="props.resource?.type"
          class="mt-3"
        />
      </div>
    </VaInnerLoading>
  </VaModal>
</template>

<script setup>
import { useAccessTypes } from "@/components/v2/grants/issue/useAccessTypes";
import { useGrantPresets } from "@/components/v2/grants/issue/useGrantPresets";
import constants from "@/constants";
import toast from "@/services/toast";
import { maybePluralize } from "@/services/utils";
import grantService from "@/services/v2/grants";
import { VaInnerLoading } from "vuestic-ui/web-components";

const props = defineProps({
  resource: {
    type: Object,
    required: true,
  },
});
const emit = defineEmits(["update"]);

const visible = ref(true);
const loading = ref(false);

const {
  accessTypes,
  loading: accessTypesLoading,
  error: accessTypesError,
  refresh: refreshAccessTypes,
} = useAccessTypes(props.resource?.type); // TODO: handle dynamic resource changes

const {
  presets,
  loading: presetsLoading,
  error: presetsError,
  refresh: refreshPresets,
} = useGrantPresets();

// form state
const subject = ref({});
const selectedPreset = ref(null);
const selectedTypes = ref(new Set());
const expiry = ref({ type: "never", value: null });
const justification = ref("");

// preview state
const previewGrants = ref([]);
const previewLoading = ref(false);
const previewError = ref(null);

// computed
const grantCountsByType = computed(() => {
  const c = { new: 0, supersede: 0, existing: 0 };
  previewGrants.value.forEach((r) => {
    c[r.type] = (c[r.type] || 0) + 1;
  });
  return c;
});

const selectionSummary = computed(() => {
  // create a human readable summary based on previewGrants
  // e.g. "Granting 1 new grant, extending 1 existing grant, skipping 2 grants"
  // on <resource> to <subject>
  if (!previewGrants.value.length || !isFormValid.value) return null;

  const parts = [];
  if (grantCountsByType.value.new)
    parts.push(
      `create ${maybePluralize(grantCountsByType.value.new, "new grant")}`,
    );
  if (grantCountsByType.value.supersede)
    parts.push(
      `extend ${maybePluralize(grantCountsByType.value.supersede, "existing grant")}`,
    );
  if (
    grantCountsByType.value.new > 0 ||
    grantCountsByType.value.supersede > 0
  ) {
    const subjectName = subject.value?.user?.name || subject.value?.group?.name;
    return `This will ${parts.join(", ")} for ${subjectName}`;
  } else {
    return "No changes will be made to existing grants";
  }
});

const presetCoveredIds = computed(() => {
  if (selectedPreset.value === null) return new Set();
  return new Set(
    presets.value
      .find((p) => p.id === selectedPreset.value)
      ?.access_type_items?.map((item) => item.access_type_id) ?? [],
  );
});

const isFormValid = computed(() => {
  return (
    subject.value?.id && (selectedPreset.value || selectedTypes.value.size > 0)
  );
});

const enableGrantButton = computed(() => {
  return (
    isFormValid.value &&
    (grantCountsByType.value.new > 0 || grantCountsByType.value.supersede > 0)
  );
});

const accessTypeMap = computed(() => {
  const map = {};
  accessTypes.value.forEach((at) => (map[at.id] = at));
  return map;
});

const resourceOwningGroupId = computed(() => {
  return (
    props.resource?.dataset?.owner_group_id ||
    props.resource?.collection?.owner_group_id ||
    ""
  );
});

function show() {
  visible.value = true;
}

function hide() {
  visible.value = false;
}

defineExpose({ show, hide });

function confirm() {
  loading.value = true;
  const data = buildGrantsData();
  grantService
    .create(data)
    .then(() => {
      emit("update");
      hide();
    })
    .catch((err) => {
      const msg = err?.response?.data?.message || "Failed to issue grants";
      toast.error(msg);
    })
    .finally(() => {
      loading.value = false;
    });
}

function buildGrantsData() {
  const items = [];
  if (selectedPreset.value) {
    items.push({
      preset_id: selectedPreset.value,
      approved_expiry: expiry.value,
    });
  }
  selectedTypes.value.forEach((access_type_id) => {
    items.push({
      access_type_id,
      approved_expiry: expiry.value,
    });
  });
  return {
    subject_id: subject.value.id,
    resource_id: props.resource.id,
    resource_type: props.resource.type,
    items,
    justification: justification.value,
  };
}

debouncedWatch(
  [subject, selectedPreset, selectedTypes, expiry],
  () => {
    if (!isFormValid.value) {
      return;
    }
    previewLoading.value = true;
    previewError.value = null;
    const data = buildGrantsData();
    grantService
      .computeEffectiveGrants(data)
      .then((res) => {
        previewGrants.value = res.data.map((row) => ({
          ...row,
          access_type:
            accessTypeMap.value[row.access_type_id] || row.access_type,
        }));
      })
      .catch((err) => {
        previewError.value =
          err?.response?.data?.message || "Failed to compute effective grants";
      })
      .finally(() => {
        previewLoading.value = false;
      });
  },
  {
    debounce: 350,
  },
);

onMounted(() => {});
</script>
