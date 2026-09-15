import config from "@/config";
import axios from "axios";

/**
 * The client the public profile pages use.
 *
 * It is a bare axios instance on purpose. `@/services/api` attaches a bearer token and
 * redirects to `/auth/logout` on any 401, which would eject a signed-out reader from a page
 * written for signed-out readers. Nothing here needs a token, and a failure here is rendered
 * by the page rather than announced in a toast.
 *
 * @see docs/design/groups/implementation/profiles.md — The UI
 */
const publicApi = axios.create({ baseURL: config.apiBasePath });

export default {
  /** A published group profile. Rejects with a 404 when the profile is not public. */
  getGroup(id) {
    return publicApi.get(`/public/groups/${id}`);
  },

  getCollection(id) {
    return publicApi.get(`/public/collections/${id}`);
  },
};
