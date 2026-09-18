<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<!-- eslint-disable vuejs-accessibility/click-events-have-key-events -->
<template>
  <div class="relative">
    <OnClickOutside @trigger="close">
      <va-form>
        <va-input
          ref="inputRef"
          clearable
          :placeholder="props.placeholder"
          :disabled="props.disabled"
          v-model="query"
          class="w-full"
          @focus="open"
          @keydown="onKeydown"
          @update:model-value="onQueryChange"
        >
          <template #prependInner>
            <i-mdi:magnify />
          </template>
        </va-input>
      </va-form>

      <div
        v-if="isOpen"
        ref="listRef"
        class="absolute w-full bg-white dark:bg-gray-800 border border-solid border-slate-200 dark:border-slate-700 shadow-lg rounded rounded-t-none z-50 max-h-[25rem] overflow-y-auto"
        @scroll="onScroll"
      >
        <div
          v-if="loading && items.length === 0"
          class="p-4 text-center text-gray-500 dark:text-gray-400"
        >
          Loading…
        </div>

        <div
          v-else-if="items.length === 0"
          class="p-4 text-center text-gray-500 dark:text-gray-400"
        >
          <span class="flex gap-2 items-center justify-center">
            <i-mdi:magnify-remove-outline class="flex-none text-xl" />
            <span class="flex-none">{{ props.emptyText }}</span>
          </span>
        </div>

        <template v-else>
          <div
            v-for="(item, index) in items"
            :key="item.id ?? index"
            role="button"
            tabindex="0"
            :class="[
              'cursor-pointer',
              highlightIndex === index ? 'bg-gray-100 dark:bg-gray-700' : '',
            ]"
            @click="select(item)"
            @mouseenter="highlightIndex = index"
            @focus="highlightIndex = index"
          >
            <slot name="result-item" :item="item" :index="index" :query="query">
              <div class="px-3 py-2 text-sm">{{ item.name ?? item }}</div>
            </slot>
          </div>

          <div
            v-if="loading"
            class="p-2 text-center text-xs text-gray-500 dark:text-gray-400"
          >
            Loading more…
          </div>
          <div
            v-else-if="!hasMore && total > props.pageSize"
            class="p-2 text-center text-xs text-gray-400 dark:text-gray-500"
          >
            {{ total }} results
          </div>
        </template>
      </div>
    </OnClickOutside>
  </div>
</template>

<script setup>
import { OnClickOutside } from "@vueuse/components";
import { useDebounceFn } from "@vueuse/core";

/**
 * A select whose list is there before you type.
 *
 * `AutoCompleteSearch` is a search bar: its empty-query state belongs to recent and suggested
 * searches, and it fetches nothing until a query exists. A picker has the opposite shape —
 * clicking it should show what is on offer, so somebody who does not know the name can scroll
 * and recognise it. Typing narrows the same list.
 *
 * Pages are appended as the list is scrolled, so the caller's fetch function is asked for one
 * page at a time rather than for everything the scope admits.
 *
 * @see docs/design/groups/access-model.md — What each search scope shows
 */
const props = defineProps({
  /**
   * `(query, offset, limit) => ({ items, total })`. Called with an empty query when the list
   * first opens. Errors are the caller's to log; this component shows an empty list.
   */
  fetchFn: { type: Function, required: true },
  placeholder: { type: String, default: "Search…" },
  emptyText: { type: String, default: "No results found" },
  pageSize: { type: Number, default: 10 },
  debounceMs: { type: Number, default: 250 },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(["select"]);

const query = ref("");
const isOpen = ref(false);
const loading = ref(false);
const items = ref([]);
const total = ref(0);
const highlightIndex = ref(-1);
const listRef = ref(null);

const hasMore = computed(() => items.value.length < total.value);

/**
 * Which request the arriving page belongs to. Typing while a page is in flight would
 * otherwise append the old query's results under the new query.
 */
let requestId = 0;

async function loadPage({ append }) {
  const mine = ++requestId;
  loading.value = true;
  try {
    const offset = append ? items.value.length : 0;
    const page = await props.fetchFn(query.value, offset, props.pageSize);
    if (mine !== requestId) return;
    items.value = append ? [...items.value, ...page.items] : page.items;
    total.value = page.total ?? items.value.length;
    if (!append) highlightIndex.value = -1;
  } finally {
    if (mine === requestId) loading.value = false;
  }
}

const reload = useDebounceFn(
  () => loadPage({ append: false }),
  props.debounceMs,
);

function open() {
  if (isOpen.value) return;
  isOpen.value = true;
  loadPage({ append: false });
}

function close() {
  isOpen.value = false;
  highlightIndex.value = -1;
}

function onQueryChange() {
  if (!isOpen.value) isOpen.value = true;
  reload();
}

function select(item) {
  emit("select", item);
  query.value = "";
  close();
}

/** Within one row's height of the bottom, which is where a person expects more to arrive. */
function onScroll(event) {
  const el = event.target;
  if (loading.value || !hasMore.value) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
    loadPage({ append: true });
  }
}

function onKeydown(event) {
  if (event.key === "Escape") {
    close();
    return;
  }
  if (!isOpen.value) {
    open();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    highlightIndex.value = Math.min(
      highlightIndex.value + 1,
      items.value.length - 1,
    );
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    highlightIndex.value = Math.max(highlightIndex.value - 1, 0);
  } else if (event.key === "Enter" && highlightIndex.value >= 0) {
    event.preventDefault();
    select(items.value[highlightIndex.value]);
  }
}
</script>
