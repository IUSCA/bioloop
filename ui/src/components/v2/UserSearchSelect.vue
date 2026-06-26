<template>
  <AutoCompleteSearch
    :autocomplete-fn="searchUsers"
    @select="(user) => emit('select', user)"
  >
    <template #result-item="{ item }">
      <div class="flex items-center gap-3 py-1 px-2 text-sm">
        <UserAvatar :username="item.username" :name="item.name" />
        <div class="flex-1">
          <div class="font-medium">{{ item.name || item.email }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            {{ item.email }}
          </div>
        </div>
      </div>
    </template>
  </AutoCompleteSearch>
</template>

<script setup>
import AutoCompleteSearch from "@/components/utils/AutoCompleteSearch.vue";
import UserService from "@/services/v2/users";

// const props = defineProps({});
const emit = defineEmits(["select"]);

async function searchUsers(searchQuery) {
  try {
    const res = await UserService.getAll({
      search: searchQuery,
      take: 5,
    });
    const value = res.data?.users || [];
    return value;
  } catch (error) {
    console.error("Failed to search users:", error);
    return [];
  }
}
</script>
