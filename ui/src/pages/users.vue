<template>
  <h2 class="text-3xl font-bold">Registered Users</h2>
  <div class="mt-10">
    <div class="flex justify-between gap-3 mb-2">
      <div class="">
        <va-input
          v-model="filterInput"
          class="flex flex-col mb-2 border-gray-800 border border-solid"
          placeholder="search users"
          outline
          clearable
        />
      </div>
      <div class="text-right">
        <va-button icon="add" class="px-3" @click="openModalToCreateUser">
          Create User</va-button
        >
      </div>
    </div>

    <va-data-table
      :items="users"
      :columns="columns"
      :hoverable="true"
      :filter="filterInput"
      :loading="data_loading"
    >
      <template #cell(created_at)="{ value }">
        <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
      </template>
      <template #cell(updated_at)="{ value }">
        <span>{{ moment(value).utc().format("YYYY-MM-DD") }}</span>
      </template>
      <template #cell(is_deleted)="{ source }">
        <span>{{ source ? "Disabled" : "Enabled" }}</span>
      </template>
      <template #cell(actions)="{ rowIndex }">
        <va-button
          preset="plain"
          icon="edit"
          color="secondary"
          @click="openModalToEditItemById(rowIndex)"
        />
      </template>
    </va-data-table>
  </div>

  <va-modal
    :model-value="editing"
    :title="editModalTitle"
    size="small"
    @ok="effectFn"
    @cancel="resetEditModal"
    no-outside-dismiss
  >
    <div class="max-w-lg">
      <va-inner-loading :loading="modal_loading">
        <va-form class="flex flex-wrap gap-2 gap-y-6" ref="modifyFormRef">
          <va-input
            v-model="editedUser.username"
            label="Username"
            class="w-64"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />
          <va-input
            v-model="editedUser.name"
            label="Name"
            class="w-64"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />
          <va-input
            v-model="editedUser.email"
            label="Email"
            class="w-64"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />
          <va-input
            v-model="editedUser.cas_id"
            label="CAS ID"
            class="flex-[1_1_100%]"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
            ]"
          />
          <va-switch
            v-model="editedUser.status"
            true-label="Enabled"
            false-label="Disabled"
            class="flex-[1_1_100%]"
            color="success"
          />

          <va-input
            v-model="editedUser.roles_str"
            label="Roles"
            class="flex-[1_1_100%]"
            :rules="[
              (value) => (value && value.length > 0) || 'Field is required',
              (value) =>
                value
                  .split(',')
                  .map((r) => r?.trim())
                  .map((r) => r && r.length > 0)
                  .reduce((acc, curr) => acc && curr, true) ||
                'Invalid role specified',
            ]"
          />

          <va-input
            v-model="editedUser.notes"
            type="textarea"
            label="Notes"
            autosize
            :min-rows="3"
          />
        </va-form>
      </va-inner-loading>
    </div>
  </va-modal>
</template>

<script setup>
import moment from "moment";
import UserService from "@/services/user";
import toast from "@/services/toast";

const users = ref([]);
const filterInput = ref("");
const editing = ref(false);
const editedUser = ref({});
const modifyFormRef = ref(null);
const modal_loading = ref(false);
const editMode = ref("modify");
const data_loading = ref(false);

const editModalTitle = computed(() => {
  return editMode.value == "modify" ? "Modify User" : "Create User";
});
const effectFn = computed(() => {
  return editMode.value == "modify" ? modifyUser : createUser;
});

const columns = ref([
  { key: "username", sortable: true, sortingOptions: ["desc", "asc", null] },
  { key: "name", sortable: true },
  { key: "email", sortable: true },
  { key: "cas_id", sortable: true },
  {
    key: "created_at",
    sortable: true,
    label: "created on",
  },
  {
    key: "updated_at",
    sortable: true,
    label: "updated on",
  },
  { key: "is_deleted", sortable: true, label: "status" },
  { key: "actions" },
]);

function fetch_all_users() {
  data_loading.value = true;
  UserService.getAll()
    .then((_users) => {
      users.value = _users;
      console.log(_users);
    })
    .catch((err) => {
      console.error(err);
      toast.error("Unable to fetch Users");
    })
    .finally(() => {
      data_loading.value = false;
    });
}

function openModalToEditItemById(id) {
  editMode.value = "modify";
  console.log("edit", id);
  editing.value = true;
  // eslint-disable-next-line no-unused-vars
  const { created_at, updated_at, ...user } = users.value[id];
  editedUser.value = {
    ...user,
    status: !user.is_deleted,
    roles_str: (user.roles || []).join(", "),
    orig_username: user.username,
  };
  console.log(editedUser.value);
}

function openModalToCreateUser() {
  editMode.value = "create";
  editing.value = true;
  // eslint-disable-next-line no-unused-vars
  editedUser.value = {
    status: true,
    roles_str: "",
  };
  console.log(editedUser.value);
}

function resetEditModal() {
  editing.value = false;
  editedUser.value = {};
}

function modifyUser() {
  console.log("modify user");
  if (modifyFormRef.value.validate()) {
    const { roles_str, orig_username, status, ...updates } = editedUser.value;
    updates.is_deleted = !status;
    updates.roles = roles_str
      .split(",")
      .map((r) => r?.trim())
      .filter((r) => r && r.length > 0);

    modal_loading.value = true;

    console.log(updates);
    UserService.modifyUser(orig_username, updates)
      .then((modifiedUser) => {
        fetch_all_users();
        console.log("modify success", modifiedUser);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        modal_loading.value = false;
        resetEditModal();
      });
  }
}

function createUser() {
  console.log("create user");
  if (modifyFormRef.value.validate()) {
    const { roles_str, status, ...updates } = editedUser.value;
    updates.is_deleted = !status;
    updates.roles = roles_str
      .split(",")
      .map((r) => r?.trim())
      .filter((r) => r && r.length > 0);

    modal_loading.value = true;

    console.log(updates);
    UserService.createUser(updates)
      .then((user) => {
        fetch_all_users();
        console.log("create success", user);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        modal_loading.value = false;
        resetEditModal();
      });
  }
}

fetch_all_users();
</script>
