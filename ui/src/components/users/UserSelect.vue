<template>
  <AutoComplete
    v-model:search-text="searchText"
    :data="users"
    :filter-fn="filterFn"
    placeholder="Search users by name, username, or email"
  >
    <template #filtered="{ item }">
      <span> {{ item.name }} </span>
      <span class="va-text-secondary pl-3 text-sm"> {{ item.email }} </span>
    </template>
  </AutoComplete>
</template>

<script setup>
import userService from "@/services/user";

// const emit = defineEmits(["select"]);

const users = ref([]);
const searchText = ref("");

const filterFn = (text) => (user) => {
  const _text = text.toLowerCase();
  return (
    user.name.toLowerCase().includes(_text) ||
    user.username.toLowerCase().includes(_text) ||
    user.email.toLowerCase().includes(_text)
  );
};

userService.getAll().then((data) => {
  users.value = data.users;
});
</script>
