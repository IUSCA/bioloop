<template>
  <div>
    <!-- search bar and create button -->
    <div class="flex items-center gap-3 mb-3">
      <!-- search bar -->
      <div class="flex-1">
        <va-input
          v-model="filterInput"
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
        v-model:sort-by="sortBy"
        v-model:sorting-order="sortingOrder"
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
              preset="plain"
              icon="edit"
              @click="openModalToEditProject(rowData)"
            />
            <va-button
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
import * as datetime from "@/services/datetime";
import projectService from "@/services/projects";
import { useAuthStore } from "@/stores/auth";
import { useProjectFormStore } from "@/stores/projects/projectForm";

const auth = useAuthStore();
const projectFormStore = useProjectFormStore();
const router = useRouter();

const projects = ref([]);
const filterInput = ref("");
const debouncedFilterInput = refDebounced(filterInput, 200);
const data_loading = ref(false);

// initial sorting order
const sortBy = ref("updated_at");
const sortingOrder = ref("desc");

const row_items = computed(() => {
  return projects.value
    .map((project) => {
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
    })
    .filter((row) => {
      const searchText = debouncedFilterInput.value?.toLowerCase() || "";
      return (
        searchText === "" ||
        customFilteringFn(searchText, {
          name: row.name,
          users: row.users,
          datasets: row.datasets,
        })
      );
    });
});

// This could've been split into two variables user_columns and admin_columns
// and concataned based on user roles
// but the order of columns would not be preserved
const columns = [
  { key: "name", sortable: true },
  ...(auth.canOperate ? [{ key: "users", sortable: true, width: "30%" }] : []),
  {
    key: "datasets",
    sortable: true,
    width: "80px",
    thAlign: "center",
    tdAlign: "center",
  },
  // ...(auth.canOperate ? [{ key: "contacts", sortable: true }] : []),
  { key: "created_at", sortable: true, width: "100px" },
  { key: "updated_at", sortable: true, width: "150px" },
  ...(auth.canOperate ? [{ key: "actions", width: "80px" }] : []),
];

function customFilteringFn(searchText, { name, users, datasets }) {
  return (
    searchText === "" ||
    (name || "").toLowerCase().includes(searchText) ||
    users.some((user) =>
      (user?.username || "").toLowerCase().includes(searchText),
    ) ||
    datasets.some((dataset) =>
      (dataset?.name || "").toLowerCase().includes(searchText),
    )
  );
}

function fetch_projects() {
  data_loading.value = true;
  projectService
    .getAll({
      forSelf: !auth.canOperate,
    })
    .then((res) => {
      projects.value = res.data;
    })
    .finally(() => {
      data_loading.value = false;
    });
}
fetch_projects();

// edit modal code
// template ref binding
const editModal = ref(null);
const selectedId = ref(null);

function openModalToEditProject(rowData) {
  const { name, description, browser_enabled, funding } = rowData;
  projectFormStore.$patch({ name, description, browser_enabled, funding });
  selectedId.value = rowData.id;
  editModal.value.show();
}

// create modal code
// const createModal = ref(null);

// function openModalToCreateProject() {
//   createModal.value.show();
// }

// delete modal code
// template ref binding
const deleteModal = ref(null);
const selectedForDeletion = ref({});

function openModalToDeleteProject(rowData) {
  selectedForDeletion.value = rowData;
  deleteModal.value.show();
}
</script>

<route lang="yaml">
meta:
  title: Projects
  nav: [{ label: "Projects" }]
</route>
