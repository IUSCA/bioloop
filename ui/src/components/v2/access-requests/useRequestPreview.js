import accessRequestService from "@/services/v2/access-requests";
import { debounce } from "lodash-es";

/**
 * What the request in the form would confer if approved as asked, reloaded as the form changes.
 *
 * Empty until a subject and at least one item are chosen. A response that arrives after a newer
 * one was asked for is dropped, so a slow reply never overwrites the current selection.
 * @see docs/design/groups/implementation/access-requests-plan.md — C6
 */
export function useRequestPreview(formState, resourceRef, accessTypesRef) {
  const rows = ref([]);
  const loading = ref(false);
  const error = ref(null);
  let latest = 0;

  async function load() {
    const subject = formState.subject;
    const resource = resourceRef.value;
    const items = formState.buildItems();
    const call = ++latest;
    if (!subject?.id || !resource?.id || items.length === 0) {
      rows.value = [];
      loading.value = false;
      error.value = null;
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      const { data } = await accessRequestService.computeEffectiveGrants({
        resource_id: resource.id,
        subject_id: subject.id,
        items,
      });
      if (call !== latest) return;
      const byId = new Map(accessTypesRef.value.map((t) => [t.id, t]));
      rows.value = data.map((row) => ({
        ...row,
        access_type: byId.get(row.access_type_id) ?? null,
      }));
    } catch (err) {
      if (call !== latest) return;
      error.value =
        err?.response?.data?.message || "Could not preview this request.";
      rows.value = [];
    } finally {
      if (call === latest) loading.value = false;
    }
  }

  const debouncedLoad = debounce(load, 350);

  watch(
    () => [
      formState.subject?.id,
      resourceRef.value?.id,
      formState.selectedPreset,
      [...formState.selectedTypes].join(","),
      formState.expiry?.type,
      String(formState.expiry?.value ?? ""),
    ],
    debouncedLoad,
    { immediate: true },
  );

  const hasSelection = computed(
    () =>
      Boolean(formState.subject?.id) &&
      (Boolean(formState.selectedPreset) || formState.selectedTypes.size > 0),
  );

  return { rows, loading, error, hasSelection };
}
