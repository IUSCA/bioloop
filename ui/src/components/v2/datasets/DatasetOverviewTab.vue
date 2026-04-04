<template>
  <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
    <!-- Left: Metadata -->
    <VaCard>
      <VaCardContent>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold">DATASET DETAILS</h2>
        </div>

        <dl class="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
          <div class="py-2.5 flex items-center gap-4">
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Name
            </dt>
            <dd class="text-sm text-gray-800 dark:text-gray-200">
              {{ props.dataset.name }}
            </dd>
          </div>

          <div class="py-2.5 flex items-center gap-4">
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Type
            </dt>
            <dd class="text-sm font-semibold">{{ props.dataset.type }}</dd>
          </div>

          <div class="py-2.5 flex items-center gap-4">
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Description
            </dt>
            <dd class="text-sm line-clamp-2">
              {{ props.dataset.description || "—" }}
            </dd>
          </div>

          <div class="py-2.5 flex items-center gap-4">
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Owner Group
            </dt>
            <dd class="text-sm font-semibold">
              <RouterLink
                v-if="props.dataset.owner_group"
                :to="`/v2/groups/${props.dataset.owner_group.id}`"
              >
                {{ props.dataset.owner_group?.name || "—" }}
              </RouterLink>
            </dd>
          </div>

          <div class="py-2.5 flex items-center gap-4">
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Size
            </dt>
            <dd class="text-sm">{{ formatBytes(props.dataset.size) }}</dd>
          </div>

          <div
            v-if="props.dataset.created_at"
            class="py-2.5 flex items-center gap-4"
          >
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Created
            </dt>
            <dd class="text-sm">
              {{ datetime.displayDateTime(props.dataset.created_at) }}
            </dd>
          </div>

          <div
            v-if="props.dataset.updated_at"
            class="py-2.5 flex items-center gap-4"
          >
            <dt class="w-28 shrink-0 text-xs font-medium va-text-secondary">
              Updated
            </dt>
            <dd class="text-sm">
              {{ datetime.fromNow(props.dataset.updated_at) }}
            </dd>
          </div>
        </dl>
      </VaCardContent>
    </VaCard>

    <!-- Right: Stats & Actions -->
    <div class="flex flex-col gap-4">
      <!-- Stat Cards -->
      <div class="space-y-3">
        <MetricCard
          label="Files"
          icon="mdi-file-multiple"
          :value="props.dataset.num_files"
          :loading="false"
        />
        <MetricCard
          label="Grants"
          icon="mdi-key"
          :value="props.counts.grants"
          :loading="props.counts.grants === null"
        />
        <MetricCard
          label="Requests"
          icon="mdi-clipboard-list"
          :value="props.counts.requests"
          :loading="props.counts.requests === null"
        />
      </div>

      <!-- Quick Actions -->
      <VaCard v-if="props.canEdit || props.canArchive">
        <VaCardContent class="space-y-2 p-3">
          <VaButton
            v-if="props.canEdit"
            size="small"
            class="w-full"
            @click="openEditModal"
          >
            <i-mdi-pencil class="mr-1" />
            Edit Details
          </VaButton>

          <VaButton
            v-if="props.canArchive"
            size="small"
            color="danger"
            class="w-full"
            @click="emit('toggle-archive')"
          >
            <i-mdi-archive class="mr-1" />
            Archive
          </VaButton>
        </VaCardContent>
      </VaCard>
    </div>
  </div>

  <DatasetEditMetadataModal
    ref="editModalRef"
    :dataset-id="props.dataset.resource_id"
    :name="props.dataset.name"
    :description="props.dataset.description"
    @update="emit('update')"
  />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import { formatBytes } from "@/services/utils";
import DatasetEditMetadataModal from "./DatasetEditMetadataModal.vue";

const props = defineProps({
  dataset: { type: Object, required: true },
  counts: { type: Object, default: () => ({ grants: null, requests: null }) },
  canEdit: { type: Boolean, default: false },
  canArchive: { type: Boolean, default: false },
});

const emit = defineEmits(["update", "toggle-archive"]);

const editModalRef = ref(null);

function openEditModal() {
  editModalRef.value?.show();
}
</script>
