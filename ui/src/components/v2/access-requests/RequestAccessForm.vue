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
        <ModernCard title="Subject">
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
                (Choose one preset, individual types, or both.)
              </span>
            </div>
          </template>

          <div class="space-y-4">
            <!-- Preset selector -->
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

            <!-- Access type selector -->
            <div>
              <AccessTypeSelector
                v-model="formState.selectedTypes"
                :access-types="accessTypes"
                :preset-covered-ids="presetCoveredIds"
              />
            </div>
          </div>
        </ModernCard>

        <!-- Expiry -->
        <ModernCard title="Requested Expiry">
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
              (required for submission)
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
          <template #title>Request conflict detected</template>
          <div class="space-y-2 text-sm">
            <p>{{ formState.conflictError.message }}</p>
            <p v-if="conflictingItemNames.length > 0" class="text-xs">
              Conflicting items:
              <strong>{{ conflictingItemNames.join(", ") }}</strong>
            </p>
            <p class="text-xs">
              Please wait for the conflicting request to be resolved or withdraw
              it first.
            </p>
          </div>
        </ModernAlert>
      </div>

      <!-- Right side: Current access preview -->
      <div class="col-span-1">
        <CurrentAccessPreview
          :subject="formState.subject"
          :resource="props.resource"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAccessTypes } from "@/components/v2/grants/issue/useAccessTypes";
import { useGrantPresets } from "@/components/v2/grants/issue/useGrantPresets";
import { useRequestAccessForm } from "./useRequestAccessForm";

const props = defineProps({
  resource: {
    type: Object,
    required: true,
  },
});

const formState = useRequestAccessForm({
  resource: props.resource,
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

// Computed: Items covered by selected preset
const presetCoveredIds = computed(() => {
  if (!formState.selectedPreset.value) return new Set();
  const preset = presets.value.find(
    (p) => p.id === formState.selectedPreset.value,
  );
  return new Set(
    preset?.access_type_items?.map((item) => item.access_type_id) ?? [],
  );
});

// Computed: Conflicting item names
const conflictingItemNames = computed(() => {
  if (!formState.conflictError.value) return [];

  const names = [];

  // Map preset IDs
  (formState.conflictError.value.preset_ids || []).forEach((presetId) => {
    const preset = presets.value.find((p) => p.id === presetId);
    if (preset) {
      names.push(`${preset.name} (preset)`);
    }
  });

  // Map access type IDs
  (formState.conflictError.value.access_type_ids || []).forEach((typeId) => {
    const type = accessTypes.value.find((t) => t.id === typeId);
    if (type) {
      names.push(type.name);
    }
  });

  return names;
});
</script>
