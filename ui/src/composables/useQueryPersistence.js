import { useRoute, useRouter } from "vue-router";

function safeDecodeURI(uri) {
  try {
    return decodeURI(uri);
  } catch (error) {
    return null;
  }
}

export default function useQueryPersistence({
  refObject,
  defaultValue,
  key = "q",
}) {
  const router = useRouter();
  const route = useRoute();

  const get = () => {
    return Object.assign(
      defaultValue,
      JSON.parse(safeDecodeURI(route.query[key] || "") || "{}"),
    );
  };

  const set = (state) => {
    const query = {
      [key]: encodeURI(JSON.stringify(state)),
    };
    router.push({
      query: Object.assign({}, route.query, query),
    });
  };

  // set initial value from route query params
  refObject.value = get();

  // watch refObject and set route query params
  watch(
    refObject,
    (newValue) => {
      set(newValue);
    },
    {
      deep: true,
    },
  );

  // watch route query params and set refObject
  watch(
    () => route.query[key],
    () => {
      refObject.value = get();
    },
  );

  return refObject;
}
