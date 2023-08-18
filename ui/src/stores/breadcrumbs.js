import { ref } from "vue";
import { defineStore } from "pinia";

export const useBreadcrumbsStore = defineStore("breadcrumbs", () => {
  const breadcrumbs = ref([]);

  function pushNavItem(value) {
    breadcrumbs.value.push(value);
  }

  return { breadcrumbs, pushNavItem };
});
