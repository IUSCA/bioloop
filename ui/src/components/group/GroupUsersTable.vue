<template>
  <div>
    <!-- Search and Filters -->
    <div class="flex mb-3 gap-3">
      <div class="flex-1">
        <va-input
          v-model="searchQuery"
          class="w-full"
          placeholder="Search users"
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
      :items="displayedUsers"
      :columns="columns"
      v-model:sort-by="sortBy"
      v-model:sorting-order="sortOrder"
      hoverable
      :loading="loading"
    >
      <!-- Name -->
      <template #cell(name)="{ value }">
        <span>{{ value }}</span>
      </template>

      <!-- Username -->
      <template #cell(username)="{ value }">
        <span >{{ value }}</span>
      </template>

      <!-- Email -->
      <template #cell(email)="{ value }">
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
      :total_results="filteredUsers.length"
      :curr_items="displayedUsers.length"
      :page_size_options="PAGE_SIZE_OPTIONS"
    />
  </div>
</template>

<script setup>
import * as datetime from "@/services/datetime";

const props = defineProps({
  groupId: {
    type: String,
    required: true,
  },
  initialUsers: {
    type: Array,
    default: () => [],
  },
});

const columns = [
  {
    key: "name",
    label: "Name",
    width: "20%",
    // sortable: true,
    thAlign: "left",
    tdAlign: "left",
  },
  {
    key: "username",
    label: "Username",
    width: "20%",
    // sortable: true,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "email",
    label: "Email",
    width: "25%",
    // sortable: true,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "assigned_at",
    label: "Added",
    width: "15%",
    // sortable: true,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "assignor",
    label: "Added By",
    width: "20%",
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
const sortBy = ref("username");
const sortOrder = ref("asc");

const users = computed(() => {
  return props.initialUsers.map((u) => ({
    username: u.user.username,
    name: u.user.name,
    email: u.user.email,
    assigned_at: u.assigned_at,
    assignor: u.assignor,
  }));
});

const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value;

  const query = searchQuery.value.toLowerCase();
  return users.value.filter(
    (user) =>
      user.username?.toLowerCase().includes(query) ||
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
  );
});

const displayedUsers = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredUsers.value.slice(start, end);
});

const handleSearch = useDebounceFn(() => {
  page.value = 1;
}, 300);

watch([pageSize], () => {
  page.value = 1;
});
</script>
