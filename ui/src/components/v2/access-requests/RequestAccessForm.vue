<template>
  <div class="flex flex-col gap-4">
    <div
      class="min-h-[calc(100vh-20rem)] grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      <!-- Left side: Form fields -->
      <div class="col-span-2 flex flex-col gap-4">
        <!-- Resource chip -->
        <ResourceChip :resource="props.resource" />

        <!-- Subject selector -->
        <ModernCard title="Who needs access">
          <RequestSubjectSelector v-model="formState.subject" />
        </ModernCard>

        <!-- Access: preset + individual types -->
        <ModernCard>
          <template #title>
            <div class="flex items-center gap-2">
              Access
              <span
                class="text-xs normal-case tracking-normal font-normal text-gray-400 dark:text-gray-500"
              >
                {{
                  presets.length
                    ? "(Choose one preset, individual types, or both.)"
                    : "(Choose one or more access types.)"
                }}
              </span>
            </div>
          </template>

          <div class="space-y-4">
            <!-- Presets are scoped to collections, so a dataset has none and skips this block.
                 @see docs/design/groups/access-presets.md — 2.11 Presets are scoped to collections -->
            <template v-if="presets.length">
              <div>
                <PresetSelector
                  v-model="formState.selectedPreset"
                  :presets="presets"
                />
              </div>

              <!-- Divider -->
              <div class="flex items-center gap-3">
                <div class="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
                <span class="text-xs tracking-wide font-medium">
                  Additional access types
                </span>
                <div class="h-px flex-1 bg-gray-200 dark:bg-gray-600" />
              </div>
            </template>

            <!-- Access type selector -->
            <div>
              <!-- Only requestable types, and what the subject already holds is ticked and
                   disabled. @see docs/design/groups/ui-information-architecture.md — Access types in forms -->
              <AccessTypeSelector
                v-model="formState.selectedTypes"
                :access-types="requestableAccessTypes"
                :preset-covered-ids="presetCoveredIds"
                :held-reasons="heldReasons"
                :resource-type="props.resource?.type"
              />
            </div>
          </div>
        </ModernCard>

        <!-- Expiry -->
        <ModernCard title="For how long">
          <ExpirySelector v-model="formState.expiry" />
        </ModernCard>

        <!-- Purpose (required for submission) -->
        <div>
          <div class="flex items-center gap-2 mb-2">
            <p class="text-sm font-medium uppercase tracking-wide">Purpose</p>
            <span class="text-red-500 dark:text-red-400">*</span>
            <span
              class="text-xs normal-case tracking-normal font-normal text-gray-400 dark:text-gray-500"
            >
              (required)
            </span>
          </div>
          <VaTextarea
            v-model="formState.purpose"
            placeholder="Describe why you need this access…"
            class="w-full"
            :min-rows="3"
            :max-rows="5"
          />
        </div>

        <!-- Grant scope message -->
        <GrantScopeMessage
          v-if="formState.subject?.id"
          :subject-type="formState.subject?.type"
          :resource-type="props.resource?.type"
        />

        <!-- In-flight conflict alert -->
        <ModernAlert
          v-if="formState.conflictError"
          color="danger"
          :closeable="true"
          @close="formState.resetConflictError()"
        >
          <template #title>Some of this is already requested</template>
          <div class="space-y-2 text-sm">
            <p>{{ formState.conflictError.message }}</p>
            <p v-if="conflictingItemNames.length > 0" class="text-xs">
              Already in a pending request:
              <strong>{{ conflictingItemNames.join(", ") }}</strong>
            </p>
            <p class="text-xs">
              Wait for that request to be decided, or withdraw it, then try
              again.
            </p>
          </div>
        </ModernAlert>
      </div>

      <!-- Right side: what the subject already has -->
      <div class="col-span-1">
        <CurrentAccessPreview
          :subject="formState.subject"
          :resource="props.resource"
          :rows="coverageRows"
          :loading="coverageLoading"
          :error="coverageError"
          @retry="loadCoverage"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAccessTypes } from "@/components/v2/grants/issue/useAccessTypes";
import { useGrantPresets } from "@/components/v2/grants/issue/useGrantPresets";
import { coverageReason, useSubjectCoverage } from "./useSubjectCoverage";

const props = defineProps({
  resource: {
    type: Object,
    required: true,
  },
  /**
   * The state the enclosing modal submits. The form owned its own instance and the modal
   * owned another, so the Submit button read a state nobody was filling in and stayed
   * disabled no matter what was typed here.
   */
  formState: {
    type: Object,
    required: true,
  },
});

const {
  accessTypes,
  // loading: accessTypesLoading,
  // error: accessTypesError,
} = useAccessTypes(computed(() => props.resource?.type));

const {
  presets,
  // loading: presetsLoading,
  // error: presetsError,
} = useGrantPresets(computed(() => props.resource?.type));

// A type only an admin grants, such as sensitive metadata, is not offered here.
const requestableAccessTypes = computed(() =>
  accessTypes.value.filter((t) => t.is_requestable),
);

const {
  rows: coverageRows,
  loading: coverageLoading,
  error: coverageError,
  load: loadCoverage,
} = useSubjectCoverage(
  computed(() => props.formState.subject),
  computed(() => props.resource),
);

// What the subject already holds, together with everything it implies, keyed by access type
// id. The selector ticks and disables these, so nobody asks for access they already have.
// @see docs/design/groups/decisions.md — 7. Access types imply one another
const heldReasons = computed(() => {
  const byId = new Map(accessTypes.value.map((t) => [t.id, t]));
  const reasons = new Map();
  for (const row of coverageRows.value) {
    const reason = coverageReason(row, props.formState.subject);
    const conferred = byId.get(row.access_type_id)?.implies ?? [];
    for (const id of [row.access_type_id, ...conferred]) {
      if (!reasons.has(id)) reasons.set(id, reason);
    }
  }
  return reasons;
});

// Computed: Items covered by selected preset
const presetCoveredIds = computed(() => {
  if (!props.formState.selectedPreset) return new Set();
  const preset = presets.value.find(
    (p) => p.id === props.formState.selectedPreset,
  );
  return new Set(
    preset?.access_type_items?.map((item) => item.access_type_id) ?? [],
  );
});

// Computed: Conflicting item names
const conflictingItemNames = computed(() => {
  if (!props.formState.conflictError) return [];

  const names = [];

  // Map preset IDs
  (props.formState.conflictError.preset_ids || []).forEach((presetId) => {
    const preset = presets.value.find((p) => p.id === presetId);
    if (preset) {
      names.push(`${preset.name} (preset)`);
    }
  });

  // Map access type IDs
  (props.formState.conflictError.access_type_ids || []).forEach((typeId) => {
    const type = accessTypes.value.find((t) => t.id === typeId);
    if (type) {
      names.push(type.description || type.name);
    }
  });

  return names;
});
</script>
