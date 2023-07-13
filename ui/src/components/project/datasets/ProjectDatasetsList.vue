<template>
  <va-list
    :class="['grid', 'gap-3', props.wrap ? 'grid-cols-2' : 'grid-cols-1']"
  >
    <va-list-item
      v-for="(dataset, index) in props.datasets"
      :key="index"
      class="col-span-1"
    >
      <va-list-item-section avatar>
        <Icon :icon="datasetService.get_icon(dataset.type)" class="text-2xl" />
      </va-list-item-section>

      <va-list-item-section>
        <va-list-item-label>
          {{ dataset.name }}
        </va-list-item-label>

        <va-list-item-label caption>
          {{ dataset.type }}
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section
        v-if="dataset?.assigned_at && props.showAssignedDate"
      >
        <va-list-item-label class="self-end">
          {{ datetime.date(dataset.assigned_at) }}
        </va-list-item-label>

        <va-list-item-label caption class="self-end">
          Assigned Date
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="props.showRemove" class="flex-none">
        <va-button
          preset="secondary"
          icon="delete"
          color="danger"
          round
          @click="emit('remove', dataset)"
          class="self-end"
        />
      </va-list-item-section>
    </va-list-item>
  </va-list>
</template>

<script setup>
import * as datetime from "@/services/datetime";
import datasetService from "@/services/dataset";

const props = defineProps({
  datasets: {
    type: Array,
    default: () => [],
  },
  showRemove: {
    type: Boolean,
    default: false,
  },
  showAssignedDate: {
    type: Boolean,
    default: false,
  },
  wrap: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);
</script>
