<template>
  <AutoComplete
    v-model:search-text="searchText"
    :data="projects"
    filter-by="name"
    placeholder="Search projects by name"
    data-test-id="project-search-autocomplete"
  >
    <template #filtered="{ item }">
      <div class="flex">
        <div class="flex-auto">
          <span> {{ item.name }} </span>
          <!-- <span class="va-text-secondary p-1"> &VerticalLine; </span> -->
          <!-- <span class="va-text-secondary text-sm"> {{ item.type }} </span> -->
        </div>
        <div class="flex gap-3 flex-none">
          <div class="flex items-center gap-1">
            <i-mdi-zip-box-outline class="va-text-secondary" />
            <span class=""> {{ item.datasets?.length }} </span>
          </div>

          <div class="flex items-center gap-1">
            <i-mdi-account class="va-text-secondary" />
            <span class=""> {{ item.users?.length }} </span>
          </div>
        </div>
      </div>
    </template>
  </AutoComplete>
</template>

<script setup>
import projectService from "@/services/projects";
// import { formatBytes } from "@/services/utils";

const props = defineProps({
  excludeIds: {
    type: Array,
    default: () => [],
  },
});

const searchText = ref("");
const projects = ref([]);

projectService.getAll({ forSelf: false }).then((res) => {
  projects.value = (res.data.projects || []).filter(
    (p) => !props.excludeIds.includes(p.id),
  );
});
</script>
