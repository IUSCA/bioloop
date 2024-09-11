import { useRoute, useRouter } from "vue-router";

// function safeDecodeURI(uri) {
//   try {
//     return decodeURI(uri);
//   } catch (error) {
//     return null;
//   }
// }

function safeJSONParse(json) {
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

/**
 * Custom Vue Composition Function for Query Parameter Persistence
 *
 * This composition function helps you manage query parameters in the URL and keep them
 * in sync with a reactive object in your Vue application.
 *
 * @param {object} options - Configuration options.
 * @param {Ref} options.refObject - A Vue ref object that stores the query parameter state.
 * @param {object} options.defaultValueFn - The function that returns the default value for the query parameters.
 * @param {string} [options.key="q"] - The key to use in the URL for the query parameters.
 * @param {boolean} [options.history_push=true] - Set to `true` to use `router.push` for navigation;
 *                                                `false` to use `router.replace`.
 * @returns {Ref} - The same `refObject` with two-way binding to the URL query parameters.
 */
export default function useQueryPersistence({
  refObject,
  defaultValueFn,
  key = "q",
  history_push = true,
}) {
  const router = useRouter();
  const router_nav = history_push ? router.push : router.replace;
  const route = useRoute();
  let updating_route = false;

  const get = () => {
    // return a new object instead of mutating the defaultValue
    // this allows vue to trigger watches correctly
    return Object.assign(
      {},
      defaultValueFn(),
      safeJSONParse(route.query[key] || "{}") || {},
    );
  };

  const set = (state) => {
    // if state is the same as defaultValue, remove the query param
    if (JSON.stringify(state) === JSON.stringify(defaultValueFn())) {
      const query = Object.assign({}, route.query);
      delete query[key];
      return router_nav({
        query,
      });
    }
    const query = {
      [key]: JSON.stringify(state),
    };
    return router_nav({
      query: Object.assign({}, route.query, query),
    });
  };

  // set initial value from route query params
  refObject.value = get();

  // watch refObject and set route query params
  watch(
    refObject,
    async (newValue) => {
      console.log("refObject changed", newValue);
      updating_route = true;
      await set(newValue);
      updating_route = false;
    },
    {
      deep: true,
      flush: "post",
    },
  );

  // watch route query params and set refObject
  watch(
    () => route.query[key],
    () => {
      if (!updating_route) {
        refObject.value = get();
      }
    },
  );

  return refObject;
}
