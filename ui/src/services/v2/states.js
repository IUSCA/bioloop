import api from "../api";

class StateService {
  /**
   * What a named state forbids for one resource type, as
   * `{ resource_type, state, forbidden_actions: [{ action, message }] }`.
   *
   * Which actions a state forbids is the resource's own business, so the answer is per
   * resource type and a dialog listing several types asks for each one.
   */
  forbiddenActions(resourceType, stateName = "archived") {
    return api.get(`/v2/states/${resourceType}/${stateName}/forbidden-actions`);
  }
}

export default new StateService();
