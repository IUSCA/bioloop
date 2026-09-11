/**
 * Reading the grants on a resource.
 *
 * The route is `GET /grants/resource/:resource_type/:resource_id`, and it is worth a helper
 * for two reasons. `GET /grants?resource_id=…` looks like the obvious call and is a 404,
 * which any assertion phrased as "not forbidden" accepts — a control written that way passes
 * against a route that does not exist. And the reply is not a list of grants: it is a list of
 * `{ subject, grants }` groups, one per subject holding something, so the flat list every
 * caller actually wants has to be assembled.
 *
 * `limit` is not accepted here; passing one is a 400.
 *
 * @see docs/design/groups/e2e-test-plan.md — Phase 3
 */

/** The URL, so a refusal assertion and a read agree about which route they mean. */
function grantsOnResourceUrl(resourceId, resourceType = 'DATASET') {
  return `/grants/resource/${resourceType}/${resourceId}`;
}

/** Every grant on a resource, flattened out of its per-subject groups. */
async function grantsOnResource(api, resourceId, resourceType = 'DATASET') {
  const bySubject = await api.get(grantsOnResourceUrl(resourceId, resourceType));
  return Object.values(bySubject).flatMap((group) => group.grants || []);
}

/**
 * The grants a particular access request produced.
 *
 * The link back is `source_access_request`, a nested object — not a `source_access_request_id`
 * column, which is what the schema has and what the route does not return. Filtering on the
 * id field silently matches nothing, and "no grant names the request" then reads as a missing
 * feature rather than a wrong field name.
 */
async function grantsFromRequest(api, resourceId, requestId, resourceType = 'DATASET') {
  const all = await grantsOnResource(api, resourceId, resourceType);
  return all.filter((g) => g.source_access_request?.id === requestId);
}

module.exports = { grantsOnResourceUrl, grantsOnResource, grantsFromRequest };
