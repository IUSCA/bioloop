<template>
  <div>
    <!-- Search and Filters -->
    <div class="flex mb-3 gap-3">
      <div class="flex-1">
        <va-input
          v-model="searchQuery"
          class="w-full"
          placeholder="Search projects"
          outline
          clearable
          @update:model-value="handleSearch"
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>
      <!-- Filter button placeholder -->
      <va-button preset="primary" class="flex-none" disabled>
        <i-mdi-filter />
        <span>Filters</span>
      </va-button>
    </div>

    <va-data-table
      :items="displayedProjects"
      :columns="columns"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortOrder"
      hoverable
      :loading="loading"
      @row:click="handleRowClick"
      clickable
    >
      <!-- Name -->
      <template #cell(name)="{ rowData }">
        <router-link :to="`/projects/${rowData.slug}`" class="va-link">{{ rowData.name }}</router-link>
      </template>

      <!-- Description -->
      <template #cell(description)="{ value }">
        <span>{{ value }}</span>
      </template>

      <!-- Assigned At -->
      <template #cell(assigned_at)="{ value }">
        <span>{{ datetime.displayDateTime(value) }}</span>
      </template>

      <!-- Assigned By -->
      <template #cell(assignor)="{ rowData }">
        <span v-if="rowData.assignor">
          {{ rowData.assignor.name }} ({{ rowData.assignor.username }})
        </span>
        <span v-else class="va-text-secondary">-</span>
      </template>
    </va-data-table>

    <!-- Pagination -->
    <Pagination
      class="mt-4 px-1 lg:px-3"
      v-model:page="page"
      v-model:page_size="pageSize"
      :total_results="filteredProjects.length"
      :curr_items="displayedProjects.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const router = useRouter();

const props = defineProps({
  groupId: {
    type: String,
    required: true,
  },
  initialProjects: {
    type: Array,
    default: () => [],
  },
});

const columns = [
  {
    key: "name",
    label: "Name",
    width: "20%",
    thAlign: "left",
    tdAlign: "left",
  },
  {
    key: "description",
    label: "Description",
    width: "30%",
    // sortable: false,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "assigned_at",
    label: "Added",
    width: "12%",
    // sortable: true,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "assignor",
    label: "Added By",
    width: "15%",
    // sortable: false,
    thAlign: "right",
    tdAlign: "right",
  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const loading = ref(false);
const searchQuery = ref("");
const page = ref(1);
const pageSize = ref(10);
const sortBy = ref("name");
const sortOrder = ref("asc");

const projects = computed(() => {
  return props.initialProjects.map((p) => ({
    id: p.project.id,
    name: p.project.name,
    slug: p.project.slug,
    description: p.project.description,
    assigned_at: p.assigned_at,
    assignor: p.assignor,
  }));
});

const filteredProjects = computed(() => {
  if (!searchQuery.value) return projects.value;

  const query = searchQuery.value.toLowerCase();
  return projects.value.filter(
    (project) =>
      project.name?.toLowerCase().includes(query) ||
      project.slug?.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
  );
});

const displayedProjects = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredProjects.value.slice(start, end);
});

const handleSearch = useDebounceFn(() => {
  page.value = 1;
}, 300);

const navigateToProject = (projectId) => {
  router.push(`/projects/${projectId}`);
};

const handleRowClick = ({ item }) => {
  navigateToProject(item.id);
};

watch([pageSize], () => {
  page.value = 1;
});
</script>
