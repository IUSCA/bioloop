// ui/src/composables/useChangeTracker.js
import _ from "lodash";
import { computed, ref, watch } from "vue";

/* NOTES ON LODASH METHODS USED: */
// _.isObjectLike - checks if value is not null and is of type "object" (includes arrays, plain objects, etc.)
// _.cloneDeep - creates a deep clone of the value, ensuring nested objects/arrays are also copied
// _.isEqual - performs a deep equality check between two values, returning true if they are equivalent
// _.union - creates an array of unique values from the combined arrays (used here to get all keys from both objects)

/**
 * Track changes on an object/array ref and compute a patch payload.
 *
 * Example usage:
 * ```js
 * import { ref } from "vue";
 * import { useChangeTracker } from "@/composables/useChangeTracker";
 *
 * const formData = ref({ name: "", description: "" });
 * const { hasChanges, init, getUpdates } = useChangeTracker(formData);
 *
 * // set baseline (usually after loading existing data)
 * init({ name: "Existing", description: "Existing" });
 *
 * // later…
 * if (hasChanges.value) {
 *   const payload = getUpdates();
 *   // send payload to API
 * }
 * ```
 *
 * @param {import("vue").Ref<any>} stateRef
 * @param {object} [options]
 * @param {string[]} [options.ignoreKeys] keys to ignore for diff/hasChanges
 * @param {boolean} [options.autoInit=true] automatically reset baseline when `stateRef` changes from outside
 */
export function useChangeTracker(
  stateRef,
  { ignoreKeys = [], autoInit = true } = {},
) {
  const baseline = ref(_.cloneDeep(stateRef.value));

  const normalize = (obj) => (obj == null ? obj : _.cloneDeep(obj));

  // robust comparison that ignores key order and allows for non-object values,
  // returns true if there are any changes compared to baseline
  const hasChanges = computed(() => {
    const current = stateRef.value;
    const original = baseline.value;

    // Fast path for primitives - just return the new value if different, otherwise empty object
    if (!_.isObjectLike(current) || !_.isObjectLike(original)) {
      return !_.isEqual(current, original);
    }

    // Compare key-by-key, but keep the behavior deterministic
    // ignores order of keys
    const keys = _.union(Object.keys(original), Object.keys(current)).filter(
      (k) => !ignoreKeys.includes(k),
    );

    return keys.some((k) => !_.isEqual(current[k], original[k]));
  });

  function init(newBaseline) {
    baseline.value = normalize(newBaseline ?? stateRef.value);
  }

  function resetToBaseline() {
    if (_.isObjectLike(baseline.value)) {
      // copies baseline values back into the state (useful if you want to “cancel” edits)
      Object.assign(stateRef.value, _.cloneDeep(baseline.value));
    } else {
      stateRef.value = baseline.value;
    }
  }

  function getUpdates() {
    const current = stateRef.value;
    const original = baseline.value;
    const updates = {};

    // Fast path for primitives - just return the new value if different, otherwise empty object
    if (!_.isObjectLike(current) || !_.isObjectLike(original)) {
      // primitive/array diff case
      if (!_.isEqual(current, original)) return current;
      return {};
    }

    const keys = _.union(Object.keys(original), Object.keys(current)).filter(
      (k) => !ignoreKeys.includes(k),
    );

    keys.forEach((k) => {
      if (!_.isEqual(current[k], original[k])) {
        updates[k] = current[k];
      }
    });

    return updates;
  }

  if (autoInit) {
    watch(
      stateRef,
      () => {
        init();
      },
      { deep: true },
    );
  }

  return {
    // computed boolean for whether there are any changes compared to baseline
    hasChanges,
    // function to manually set the baseline to a specific value (defaults to current state)
    init,
    // function to reset the state back to the baseline value
    resetToBaseline,
    // function to get an object containing only the changed keys/values compared to baseline
    getUpdates,
  };
}
