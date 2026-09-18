import { computed, unref } from "vue";

/**
 * The inline custom property that makes a paginated table's container reserve one full page
 * of rows, for binding to the element carrying `.v2-table-page`.
 *
 * Without it the container is only as tall as the rows it happens to hold, so a short last
 * page pulls the pagination control up the screen. Measured on the datasets list: stepping
 * from a 20-row page to the 7-row last page raised the control by 587px, out from under the
 * pointer that had just clicked it.
 *
 * Returns null while everything fits on one page. There is no jump to prevent then, and
 * reserving the height would leave a short table sitting above a band of empty space.
 *
 * @param {import('vue').Ref<number>|number} total - results across every page
 * @param {import('vue').Ref<number>|number} pageSize - rows per page, as the reader chose it
 * @returns {import('vue').ComputedRef<{'--v2-table-page-rows': number}|null>}
 * @see docs/contributing/v2-design-system.md — Tables
 */
export function useTablePageStyle(total, pageSize) {
  return computed(() => {
    const rows = Number(unref(pageSize)) || 0;
    const results = Number(unref(total)) || 0;
    if (!rows || results <= rows) return null;
    return { "--v2-table-page-rows": rows };
  });
}
