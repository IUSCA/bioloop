<template>
  <AutoCompleteSearch
    :autocomplete-fn="searchGroups"
    placeholder="Search groups you administer..."
    @select="onSelectGroup"
  >
    <template #result-item="{ item }">
      <div class="flex items-center gap-3 py-1 px-2">
        <GroupIcon :group="item" size="sm" />
        <div class="flex-1 text-sm">
          <div class="font-medium">{{ item.name }}</div>
          <!-- <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ formatGroupPath(item) }}
            </div> -->
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">
          {{ item._count?.members || 0 }} members
        </div>
      </div>
    </template>
  </AutoCompleteSearch>
</template>

<script setup>
import AutoCompleteSearch from "@/components/utils/AutoCompleteSearch.vue";
import GroupService from "@/services/v2/groups";
import GroupIcon from "./GroupIcon.vue";

const emit = defineEmits(["select"]);

async function searchGroups(searchQuery) {
  try {
    const response = await GroupService.search({
      search_term: searchQuery,
      limit: 5,
      is_archived: false,
      scope: "admin",
    });
    return response.data?.data || [];
  } catch (error) {
    console.error("Failed to search groups:", error);
    return [];
  }
}

function onSelectGroup(group) {
  emit("select", group);
}
</script>
