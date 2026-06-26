import grantService from "@/services/v2/grants";

export function useAccessTypes(resourceTypeRef) {
  const accessTypes = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetch(resourceType) {
    if (!resourceType) {
      accessTypes.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const { data } = await grantService.listAccessTypes(resourceType);
      accessTypes.value = data;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  // if resourceTypeRef is provided, auto-fetch when it changes
  if (resourceTypeRef) {
    watch(
      resourceTypeRef,
      (newType) => {
        fetch(newType);
      },
      { immediate: true },
    );
  }

  return {
    accessTypes: readonly(accessTypes),
    loading: readonly(loading),
    error: readonly(error),
    fetch,
  };
}
