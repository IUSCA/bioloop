<!--
  The hover card is supplementary: the row itself carries the elided path, and the whole tree
  is on the group's page. Nothing here is reachable only by pointer, which is why these two
  rules are turned off rather than answered with focus handlers on a div that never takes
  focus — the focusable element is the row, inside PagedSearchSelect.
-->
<!-- eslint-disable vuejs-accessibility/mouse-events-have-key-events -->
<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<template>
  <div>
    <PagedSearchSelect
      :fetch-fn="fetchGroups"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      empty-text="No groups found"
      @select="onSelect"
    >
      <template #result-item="{ item }">
        <div
          class="flex items-center gap-3 py-1 px-2"
          @mouseenter="showCard($event, item)"
          @mouseleave="hideCard"
        >
          <GroupIcon :group="item" size="sm" />
          <div class="flex-1 text-sm min-w-0">
            <div class="font-medium truncate">{{ item.name }}</div>
            <!--
              A name identifies a group only among its siblings, so the row says where this one
              sits. The middle of a deep path is elided; the hover card carries the whole tree.
              @see docs/design/groups/decisions.md — 20. Group names are unique among siblings
            -->
            <div
              v-if="item.ancestors?.length"
              class="text-xs text-gray-500 dark:text-gray-400 truncate"
            >
              {{ elidedPath(item.ancestors) }}
            </div>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400 flex-none">
            {{ item._count?.members || 0 }} members
          </div>
        </div>
      </template>
    </PagedSearchSelect>

    <!--
      Teleported and fixed, because the list it belongs to scrolls and would clip it. It takes
      no pointer events, so moving towards it never has to be handled: it holds nothing to
      click, and the slug is text. The copy button for the slug lives on the group's Overview.
    -->
    <Teleport to="body">
      <div
        v-if="card.group"
        class="fixed z-[9999] pointer-events-none w-72 rounded border border-solid border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 shadow-lg p-3"
        :style="{ top: `${card.top}px`, left: `${card.left}px` }"
      >
        <GroupLineageTree
          :group="card.group"
          :ancestors="card.group.ancestors || []"
          :link-ancestors="false"
        />
        <div
          v-if="card.group.slug"
          class="mt-2 pt-2 border-t border-solid border-slate-100 dark:border-slate-700 text-xs font-mono text-gray-500 dark:text-gray-400 truncate"
        >
          {{ card.group.slug }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import GroupService from "@/services/v2/groups";
import GroupIcon from "./GroupIcon.vue";
import GroupLineageTree from "./GroupLineageTree.vue";
import PagedSearchSelect from "@/components/utils/PagedSearchSelect.vue";

/**
 * The group picker, in every place a group is chosen.
 *
 * What it offers is decided by `scope`, which is the API's own vocabulary: the caller asks for
 * the groups a particular action would accept, rather than the component filtering a wider
 * list. The table of what each scope shows is in the design record.
 *
 * @see docs/design/groups/access-model.md — What each search scope shows
 */
const props = defineProps({
  /**
   * One of the API's search scopes. `can_administer` for the pickers that name a group the
   * caller must govern, `discoverable` for choosing who receives access, `visible` for the
   * platform-admin parent picker.
   */
  scope: { type: String, required: true },
  placeholder: { type: String, default: "Search groups…" },
  disabled: { type: Boolean, default: false },
  /** Archived groups are party to nothing new, so they are out of every picker by default. */
  isArchived: { type: Boolean, default: false },
});

const emit = defineEmits(["select"]);

async function fetchGroups(query, offset, limit) {
  try {
    const response = await GroupService.search({
      search_term: query || undefined,
      limit,
      offset,
      is_archived: props.isArchived,
      scope: props.scope,
    });
    return {
      items: response.data?.data || [],
      total: response.data?.metadata?.total ?? 0,
    };
  } catch (error) {
    console.error("Failed to search groups:", error);
    return { items: [], total: 0 };
  }
}

/**
 * The path as one line: root, an ellipsis for whatever is between, and the parent.
 *
 * Three names do not fit on a dropdown row, and the two that identify a group are the top of
 * the tree and the group directly above it.
 */
function elidedPath(ancestors) {
  const names = [...ancestors]
    .sort((a, b) => b.depth - a.depth)
    .map((a) => a.name);
  if (names.length <= 2) return names.join(" › ");
  return `${names[0]} › … › ${names[names.length - 1]}`;
}

const card = reactive({ group: null, top: 0, left: 0 });

function showCard(event, group) {
  if (!group.ancestors?.length && !group.slug) return;
  const rect = event.currentTarget.getBoundingClientRect();
  // Beside the row, or on its left when there is no room to the right.
  const width = 288; // w-72
  const gap = 8;
  const fitsRight = rect.right + gap + width < window.innerWidth;
  card.left = fitsRight
    ? rect.right + gap
    : Math.max(gap, rect.left - gap - width);
  card.top = Math.min(rect.top, window.innerHeight - 200);
  card.group = group;
}

function hideCard() {
  card.group = null;
}

function onSelect(group) {
  hideCard();
  emit("select", group);
}
</script>
