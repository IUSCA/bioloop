<template>
  <!-- search bar and filter -->
  <div class="flex mb-3 gap-3">
    <!-- search bar -->
    <div class="flex-1">
      <va-input
        v-model="searchQuery"
        class="w-full"
        placeholder="Search groups"
        outline
        clearable
        @update:model-value="handleSearch"
      >
        <template #prependInner>
          <Icon icon="material-symbols:search" class="text-xl" />
        </template>
      </va-input>
    </div>

    <!-- Filter button (placeholder) -->
    <va-button preset="primary" class="flex-none" disabled>
      <i-mdi-filter />
      <span>Filters</span>
    </va-button>

    <!-- New Group button -->
    <va-button
      icon="add"
      class="px-1"
      color="success"
      @click="showCreateModal"
      v-if="auth.canOperate"
    >
      New Group
    </va-button>
  </div>

  <va-data-table
    :items="groups"
    :columns="columns"
    v-model:sort-by="sortBy"
    v-model:sorting-order="sortOrder"
    disable-client-side-sorting
    hoverable
    :loading="loading"
    @row:click="handleRowClick"
    clickable
  >
    <!-- Name -->
    <template #cell(name)="{ rowData }">
      <router-link :to="`/groups/${rowData.id}`" class="va-link">
        {{ rowData.name }}
      </router-link>
    </template>

    <!-- Description -->
    <template #cell(description)="{ value }">
      <va-popover :message="value">
        <span>{{ value.length > 80 ? value.slice(0, 80) + '...' : value }}</span>
      </va-popover>
    </template>

    <!-- Parent Group -->
    <template #cell(parent)="{ rowData }">
      <span v-if="rowData.parent">{{ rowData.parent.name }}</span>
    </template>

    <!-- Users Count -->
    <template #cell(users_count)="{ rowData }">
      <span>{{ rowData.users?.length  }}</span>
    </template>

    <!-- Projects Count -->
    <template #cell(projects_count)="{ rowData }">
      <span>{{ rowData.projects?.length  }}</span>
    </template>

    <!-- Created At -->
    <template #cell(created_at)="{ value }">
      <span>{{ datetime.displayDateTime(value) }}</span>
    </template>

    <!-- Actions -->
    <template #cell(actions)="{ rowData }">
      <div class="flex gap-2 flex-nowrap justify-end">
        <!-- View Group -->
        <!-- <va-popover message="View Group">
          <va-button
            preset="plain"
            @click.stop="navigateToGroup(rowData.id)"
          >
            <div>
              <i-mdi-arrow-expand />
            </div>
          </va-button>
        </va-popover> -->
        <!-- Edit Group (placeholder) -->
        <va-popover message="Edit Group" v-if="auth.canOperate">
          <va-button preset="plain" disabled @click.stop>
            <div>
              <i-mdi-pencil />
            </div>
          </va-button>
        </va-popover>
      </div>
    </template>
  </va-data-table>

  <!-- pagination -->
  <Pagination
    class="mt-4 px-1 lg:px-3"
    v-model:page="page"
    v-model:page_size="pageSize"
    :total_results="totalGroupsCount"
    :curr_items="groups.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />

  <!-- Create Group Modal -->
  <CreateGroupModal ref="createGroupModal" @create="handleCreateGroup" />
</template>

<script setup>
import * as datetime from "@/services/datetime";
import groupService from "@/services/group";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();

const columns = [
  {
    key: "name",
    width: "20%",
    sortable: true,
    thAlign: "left",
    tdAlign: "left",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "description",
    sortable: false,
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "parent",
    label: "Parent Group",
    width: "15%",
    sortable: false,
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "users_count",
    label: "Users",
    width: "3%",
    sortable: false,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "projects_count",
    label: "Projects",
    width: "3%",
    sortable: false,
    thAlign: "center",
    tdAlign: "center",
  },
  {
    key: "created_at",
    label: "Created",
    width: "15%",
    sortable: true,
    thAlign: "center",
    tdAlign: "center",
    tdStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
    thStyle:
      "white-space: pre-wrap; word-wrap: break-word; word-break: break-word;",
  },
  {
    key: "actions",
    width: "10%",
    sortable: false,
    thAlign: "right",
    tdAlign: "right",
  },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const loading = ref(false);
const groups = ref([]);
const totalGroupsCount = ref(0);
const searchQuery = ref("");
const page = ref(1);
const pageSize = ref(25);
const sortBy = ref("updated_at");
const sortOrder = ref("desc");

const createGroupModal = ref(null);

const fetchGroups = async () => {
  loading.value = true;
  try {
    const query = {
      search: searchQuery.value,
      skip: (page.value - 1) * pageSize.value,
      take: pageSize.value,
      sort_by: sortBy.value,
      sort_order: sortOrder.value,
      include_users: true,
      include_projects: true,
      include_parent: true,
    };

    const response = await groupService.getAll(query);
    groups.value = response.data.groups;
    totalGroupsCount.value = response.data.metadata.count;
  } catch (error) {
    toast.error("Failed to fetch groups");
  } finally {
    loading.value = false;
  }
};

const handleSearch = useDebounceFn(() => {
  page.value = 1;
  fetchGroups();
}, 500);

const navigateToGroup = (groupId) => {
  router.push(`/groups/${groupId}`);
};

const handleRowClick = ({ item }) => {
  navigateToGroup(item.id);
};

const showCreateModal = () => {
  createGroupModal.value.showModal();
};

const handleCreateGroup = async (groupData) => {
  loading.value = true;
  try {
    await groupService.create(groupData);
    toast.success("Group created successfully");
    page.value = 1;
    await fetchGroups();
  } catch (error) {
    toast.error("Failed to create group");
  } finally {
    loading.value = false;
  }
};

watch([sortBy, sortOrder, pageSize], () => {
  if (page.value === 1) {
    fetchGroups();
  } else {
    page.value = 1;
  }
});

watch(page, fetchGroups);

onMounted(fetchGroups);
</script>

<route lang="yaml">
meta:
  title: Groups
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Groups" }]
</route>
