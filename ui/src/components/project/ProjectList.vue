<template>
  <va-list
    :class="['grid', 'gap-4', props.wrap ? 'grid-cols-2' : 'grid-cols-1']"
  >
    <va-list-item
      v-for="(project, index) in props.projects"
      :key="index"
      class="col-span-1"
    >
      <va-list-item-section>
        <va-list-item-label>
          <span> {{ project.name }} </span>

          <span class="va-text-secondary p-1"> &VerticalLine; </span>

          <i-mdi-zip-box-outline class="text-lg inline pr-1" />
          <span class=""> {{ project.datasets?.length }} </span>

          <span class="va-text-secondary p-1"> &VerticalLine; </span>

          <i-mdi-account class="text-lg inline pr-1" />
          <span class=""> {{ project.users?.length }} </span>
        </va-list-item-label>

        <va-list-item-label caption>
          <div class="flex gap-3 pt-1">
            <div class="flex gap-1 flex-none">
              <i-mdi:calendar-plus class="flex-none" />
              <span> {{ datetime.date(project.created_at) }} </span>
            </div>
            <div class="flex gap-1 flex-none">
              <i-mdi:update class="flex-none" />
              <span> {{ datetime.date(project.updated_at) }} </span>
            </div>
          </div>
        </va-list-item-label>
      </va-list-item-section>

      <va-list-item-section v-if="props.showRemove" class="flex-none">
        <va-button
          preset="secondary"
          icon="delete"
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
  wrap: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["remove"]);
</script>
