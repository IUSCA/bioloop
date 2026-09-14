import grantService from "@/services/v2/grants";

/**
 * What a subject already holds on a resource, by any path, reloaded when either changes.
 *
 * The request form reads it twice. The Current Access panel lists it, and the access type
 * selector ticks and disables what it already covers.
 * @see docs/design/groups/access-requests-plan.md — C2
 */
export function useSubjectCoverage(subjectRef, resourceRef) {
  const rows = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function load() {
    const subject = subjectRef.value;
    const resource = resourceRef.value;
    if (!subject?.id || !resource?.id) {
      rows.value = [];
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      // Coverage, not direct grants, because access inherited from a group is the thing a
      // requester most needs to know about before asking.
      const response = await grantService.getCoverageForSubject(
        subject.type,
        subject.id,
        resource.type,
        resource.id,
      );
      rows.value = response.data || [];
    } catch (err) {
      // The error itself, so ErrorState can tell a refusal from a failure.
      error.value = err;
      rows.value = [];
    } finally {
      loading.value = false;
    }
  }

  // Immediate, because the form opens with a subject already chosen.
  watch(() => [subjectRef.value?.id, resourceRef.value?.id], load, {
    immediate: true,
  });

  return { rows, loading, error, load };
}

/**
 * How a coverage row reaches the subject, in words for the person filling in the form.
 *
 * @param {Object} row - a coverage row carrying `via`, `via_group_name`, `via_collection_name`
 * @param {Object} subject - a USER subject reads as "You", a GROUP subject as "This group"
 * @returns {string} e.g. "You have this through Wong Lab"
 */
export function coverageReason(row, subject) {
  let who = subject?.type === "GROUP" ? "This group has this" : "You have this";
  // A system principal is a grant to everyone signed in, whichever principal holds it.
  if (row.via === "PRINCIPAL") who = "Everyone signed in has this";

  const paths = [];
  if (row.via === "GROUP" && row.via_group_name) {
    paths.push(`through ${row.via_group_name}`);
  }
  if (row.via_collection_name) {
    paths.push(`through the collection ${row.via_collection_name}`);
  }
  return paths.length ? `${who} ${paths.join(", ")}` : who;
}
