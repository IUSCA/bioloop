<template>
  <va-list
    :class="['grid', 'gap-3', props.wrap ? 'grid-cols-2' : 'grid-cols-1']"
  >
    <va-list-item v-for="(project, index) in props.projects" :key="index" class="">
      <va-list-item-section>
        <va-list-item-label>
          {{ project.name }}
        </va-list-item-label>

        <va-list-item-label caption>
          {{ project.slug }}
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="project?.assigned_at && props.showAssignData">
        <va-list-item-label class="self-end">
          <span v-if="project?.assignor" class="text-sm">
            by
            <span class="font-semibold">
              {{ project.assignor.username }}
            </span>
          </span>
          <span v-else> Assigned </span>
        </va-list-item-label>

        <va-list-item-label caption class="self-end">
          <span> on {{ datetime.date(project.assigned_at) }} </span>
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="props.showRemove" class="flex-none">
        <va-button
          preset="secondary"
          icon="close"
          color="danger"
          round
          @click="emit('remove', project)"
          class="self-end"
        />
      </va-list-item-section>
    </va-list-item>
  </va-list>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  projects: {
    type: Array,
    default: () => [],
  },
  showRemove: {
    type: Boolean,
    default: false,
  },
  showAssignData: {
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
