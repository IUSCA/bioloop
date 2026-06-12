import grantService from "@/services/v2/grants";

export function useGrantPresets(resourceTypeRef) {
  const presets = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetch(resourceType) {
    if (!resourceType) {
      presets.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      const { data } = await grantService.listGrantPresets(resourceType);
      presets.value = data;
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
    presets: readonly(presets),
    loading: readonly(loading),
    error: readonly(error),
    fetch,
  };
}
