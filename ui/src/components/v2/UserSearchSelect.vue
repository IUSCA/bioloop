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

const props = defineProps({
  // Subject ids the search must never offer, so a caller can keep somebody out of a list they
  // are filling. Filtering happens after the fetch, so ask for enough rows to still return
  // `RESULT_COUNT` once the excluded ones are dropped.
  excludeIds: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(["select"]);

const RESULT_COUNT = 5;
// The directory answers a caller who is not a platform admin only for a search of at least
// three characters, and with at most ten rows.
// @see docs/design/groups/decisions.md — 16. The access model's open questions have answers, row 15
const MIN_SEARCH_LENGTH = 3;
const MAX_ROWS = 10;

async function searchUsers(searchQuery) {
  if ((searchQuery ?? "").trim().length < MIN_SEARCH_LENGTH) return [];
  try {
    const res = await UserService.getAll({
      search: searchQuery.trim(),
      take: Math.min(RESULT_COUNT + props.excludeIds.length, MAX_ROWS),
    });
    const value = res.data?.users || [];
    return value
      .filter((user) => !props.excludeIds.includes(user.subject_id))
      .slice(0, RESULT_COUNT);
  } catch (error) {
    console.error("Failed to search users:", error);
    return [];
  }
}
</script>
