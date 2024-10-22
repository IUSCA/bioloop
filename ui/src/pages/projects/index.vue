<template>
  <div>
    <!-- search bar and create button -->
    <div class="flex items-center gap-3 mb-3">
      <!-- search bar -->
      <div class="flex-1">
        <va-input
          v-model="params.search"
          @update:model-value="debouncedUpdate"
          class="w-full"
          placeholder="Search projects by name, associated dataset names, and user names."
          outline
          clearable
        >
          <template #prependInner>
            <Icon icon="material-symbols:search" class="text-xl" />
          </template>
        </va-input>
      </div>

      <!-- reset button -->
      <div class="flex-none" v-if="isResetVisible">
        <va-button icon="restart_alt" @click="resetSortParams" preset="primary">
          Reset Sort
        </va-button>
      </div>

      <!-- create button -->
      <div class="flex-none" v-if="auth.canOperate">
        <va-button
          icon="add"
          class="px-1"
          color="success"
          @click="router.push('/projects/new')"
        >
          Create Project
        </va-button>
      </div>
    </div>

    <!-- projects table -->
    <div>
      <va-data-table
        :items="row_items"
        :columns="columns"
        v-model:sort-by="params.sortBy"
        v-model:sorting-order="params.sortingOrder"
        disable-client-side-sorting
        hoverable
        :loading="data_loading"
      >
        <template #cell(name)="{ rowData }">
          <router-link :to="`/projects/${rowData.slug}`" class="va-link">
            {{ rowData.name }}
          </router-link>
        </template>

        <template #cell(datasets)="{ source }">
          {{ (source || []).length }}
        </template>

        <template #cell(users)="{ source }">
          <div class="flex gap-1">
            <va-chip
              v-for="(user, i) in source.slice(0, 3)"
              :key="i"
              size="small"
              class="flex-none"
            >
              {{ user?.username }}
            </va-chip>
            <va-chip v-if="source.length > 3" size="small" class="flex-none">
              +{{ source.length - 3 }}
            </va-chip>
          </div>
        </template>

        <!-- <template #cell(contacts)="{ source }">
          <div class="flex gap-1">
            <va-chip
              v-for="(user, i) in source.slice(0, 3)"
              :key="i"
              size="small"
              class="flex-none"
            >
              {{ user }}
            </va-chip>
            <va-chip v-if="source.length > 3" size="small" class="flex-none">
              +{{ source.length - 3 }}
            </va-chip>
          </div>
        </template> -->

        <template #cell(created_at)="{ value }">
          <span>{{ datetime.date(value) }}</span>
        </template>

        <template #cell(updated_at)="{ value }">
          <span>{{ datetime.date(value) }}</span>
        </template>

        <template #cell(actions)="{ rowData }">
          <div class="flex gap-1">
            <va-button
              class="flex-auto"
              preset="plain"
              icon="edit"
              @click="openModalToEditProject(rowData)"
            />
            <va-button
              class="flex-auto"
              preset="plain"
              icon="delete"
              color="danger"
              @click="openModalToDeleteProject(rowData)"
            />
          </div>
        </template>
      </va-data-table>
    </div>
  </div>

  <!-- pagination -->
  <Pagination
    class="mt-4 px-1 lg:px-3"
    v-model:page="params.currentPage"
    v-model:page_size="params.itemsPerPage"
    :total_results="totalItems"
    :curr_items="row_items.length"
    :page_size_options="PAGE_SIZE_OPTIONS"
  />

  <!-- edit modal -->
  <EditProjectInfoModal
    ref="editModal"
    :id="selectedId"
    @update="fetch_projects"
  />

  <!-- create modal -->
  <!-- <CreateProjectModal ref="createModal" @update="fetch_projects" /> -->

  <!-- delete modal -->
  <DeleteProjectModal
    ref="deleteModal"
    :data="selectedForDeletion"
    @update="fetch_projects"
  />
</template>

<script setup>
import useQueryPersistence from "@/composables/useQueryPersistence";
import * as datetime from "@/services/datetime";
import projectService from "@/services/projects";
import toast from "@/services/toast";
import { useAuthStore } from "@/stores/auth";
import { useProjectFormStore } from "@/stores/projects/projectForm";
import { useDebounceFn } from "@vueuse/core";

const auth = useAuthStore();
const projectFormStore = useProjectFormStore();
const router = useRouter();

const projects = ref([]);
const data_loading = ref(false);
const totalItems = ref(0);
const PAGE_SIZE_OPTIONS = [25, 50, 100];

const debouncedUpdate = useDebounceFn((val) => {
  params.value.search = val;
}, 300);

function defaultParams() {
  return {
    search: "",
    sortBy: "updated_at",
    sortingOrder: "desc",
    currentPage: 1,
    itemsPerPage: 25,
  };
}

const params = ref(defaultParams());

useQueryPersistence({
  refObject: params,
  defaultValueFn: defaultParams,
  key: "q",
  history_push: true,
});

const isResetVisible = computed(() => {
  const defaultParamsObj = defaultParams();
  return (
    params.value.sortBy !== defaultParamsObj.sortBy ||
    params.value.sortingOrder !== defaultParamsObj.sortingOrder
  );
});

function resetSortParams() {
  // Reset params to their default values
  params.value.sortBy = defaultParams().sortBy;
  params.value.sortingOrder = defaultParams().sortingOrder;
}

const row_items = computed(() => {
  return projects.value.map((project) => {
    // eslint-disable-next-line no-unused-vars
    const { users, contacts, datasets, ...rest } = project;
    const _users = (users || []).map((obj) => ({
      id: obj?.user?.id,
      username: obj?.user?.username,
    }));
    // const contact_values = (contacts || []).map(
    //   (contact) => contact?.contact?.value
    // );
    const _datasets = (datasets || []).map((d) => ({
      id: d?.dataset?.id,
      name: d?.dataset?.name,
    }));
    return {
      ...rest,
      users: _users,
      // contacts: contact_values,
      datasets: _datasets,
    };
  });
});

// This could've been split into two variables user_columns and admin_columns
// and concataned based on user roles
// but the order of columns would not be preserved
const columns = [
  { key: "name", sortable: true },
  ...(auth.canOperate ? [{ key: "users", sortable: false, width: "30%" }] : []),
  {
    key: "datasets",
    sortable: false,
    width: "80px",
    thAlign: "center",
    tdAlign: "center",
  },
  // ...(auth.canOperate ? [{ key: "contacts", sortable: true }] : []),
  { key: "created_at", sortable: true, width: "100px" },
  { key: "updated_at", sortable: true, width: "150px" },
  ...(auth.canOperate ? [{ key: "actions", width: "80px" }] : []),
];

function fetch_projects() {
  data_loading.value = true;

  const skip = (params.value.currentPage - 1) * params.value.itemsPerPage;

  const queryparams = {
    forSelf: !auth.canOperate,
    search: params.value.search,
    take: params.value.itemsPerPage,
    skip: skip,
    sortBy: params.value.sortBy,
    sort_order: params.value.sortingOrder,
  };

  projectService
    .getAll(queryparams)
    .then((res) => {
      projects.value = res.data.projects;
      totalItems.value = res.data.metadata.count;
    })
    .catch((error) => {
      console.error(error);
      toast.error("Error fetching Projects");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

fetch_projects();

const editModal = ref(null);
const selectedId = ref(null);

function openModalToEditProject(rowData) {
  const { name, description, browser_enabled, funding } = rowData;
  projectFormStore.$patch({ name, description, browser_enabled, funding });
  selectedId.value = rowData.id;
  editModal.value.show();
}

const deleteModal = ref(null);
const selectedForDeletion = ref({});

function openModalToDeleteProject(rowData) {
  selectedForDeletion.value = rowData;
  deleteModal.value.show();
}

watch(
  () => params.value.currentPage,
  () => {
    fetch_projects();
  },
);

watch(
  [
    () => params.value.itemsPerPage,
    () => params.value.search,
    () => params.value.sortBy,
    () => params.value.sortingOrder,
  ],
  () => {
    if (params.value.currentPage === 1) {
      fetch_projects();
    }
    params.value.currentPage = 1;
  },
);
</script>

<route lang="yaml">
meta:
  title: Projects
  nav: [{ label: "Projects" }]
</route>
