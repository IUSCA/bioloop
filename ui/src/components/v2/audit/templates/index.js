import collectionsEventRegistry from "./collections";
import grantsEventRegistry from "./grants";
import groupsEventRegistry from "./groups";
import requestsEventRegistry from "./requests";

export const registry = {
  ...groupsEventRegistry,
  ...collectionsEventRegistry,
  ...grantsEventRegistry,
  ...requestsEventRegistry,
};

const eventTypes = Object.keys(registry);

export function getEventTypes() {
  return eventTypes;
}
