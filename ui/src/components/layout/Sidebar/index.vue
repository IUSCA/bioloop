<template>
  <va-sidebar
    :minimized="props.isSidebarCollapsed"
    class="pt-2"
    width="13rem"
    minimizedWidth="0"
  >
    <!-- user sidebar items -->
    <div v-if="getFeaturesForRole({ role: 'user' }).length > 0">
      <SidebarItems
        :items="getFeaturesForRole({ role: 'user' })"
        :isActive="isActive"
      />
      <va-divider />
    </div>

    <!--   isPermittedForOperatorFeature() - return permitted operator items -->
    <!-- operator sidebar items -->
    <div
      v-if="
        getFeaturesForRole({ role: 'operator', sharedWithRole: 'user' })
          .length > 0
      "
    >
      <SidebarItems
        :items="
          getFeaturesForRole({ role: 'operator', sharedWithRole: 'user' })
        "
        :isActive="isActive"
      />
      <va-divider />
    </div>

    <!-- admin sidebar items   -->
    <div v-if="auth.canAdmin">
      <SidebarItems
        :items="getFeaturesForRole({ role: 'admin' })"
        :isActive="isActive"
      />
      <va-sidebar-item href="/grafana/dashboards" target="_blank">
        <va-sidebar-item-content>
          <Icon icon="mdi:chart-line" class="text-2xl" />
          <!-- User can hide item with css if they want -->
          <va-sidebar-item-title>
            <div class="flex items-center">
              <span>Metrics</span>
              <i-mdi-open-in-new class="ml-1 text-sm" />
            </div>
          </va-sidebar-item-title>
        </va-sidebar-item-content>
      </va-sidebar-item>
      <va-divider />
    </div>

    <!-- other sidebar items   -->
    <div v-if="bottom_items.length > 0">
      <SidebarItems :items="bottom_items" :isActive="isActive" />
    </div>
  </va-sidebar>
</template>

<script setup>
import config from "@/config";
import constants from "@/constants";
import { useAuthStore } from "@/stores/auth";
import { useNavStore } from "@/stores/nav";
import { storeToRefs } from "pinia";

const props = defineProps({ isSidebarCollapsed: Boolean });

const user_items = constants.sidebar.user_items;
const operator_items = constants.sidebar.operator_items;
const admin_items = constants.sidebar.admin_items;
// const operator_and_
// user_items = constants.sidebar.
const bottom_items = constants.sidebar.bottom_items;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const nav = useNavStore();
const { sidebarDatasetType } = storeToRefs(nav);

// console.log(
//   "oonstants.sidebat_operator_items",
//   constants.sidebar.operator_items,
// );

onMounted(() => {
  console.log("filtered");
  console.log("in onMounted");
  console.log(
    constants.sidebar.operator_items.find((e) => {
      // console.log("e", e);
      return (e.enabled_for_roles || []).length > 0;
    }),
  );
});

// const allOperatorItems = computed(() => {
//   constants.sidebar.operator_items.find((e) => {
//     // console.log("e", e);
//     return e.enabled_for_roles?.length === 0;
//   });
// });

const operatorItemsSharedByRoles = ref(
  constants.sidebar.operator_items.filter((e) => {
    // console.log("e", e);
    return e.enabled_for_roles?.length > 0;
  }),
);

const operatorItems = computed(() => {
  // const roleSpecificFeatures =
  //   operatorItemsSharedByRoles.value?.length > 0 &&
  //   operator_items.value.filter((e) => {
  //     return e.enabled_for_roles?.includes(auth.role);
  //   });

  return operatorItemsSharedByRoles.value?.length === 0
    ? operator_items
    : [
        operator_items.filter(
          (item) =>
            item.feature_key === constants.sidebar.operator_items.feature_key,
        ),
      ];
});

// console.log("operatorItemsSharedByRoles", operatorItemsSharedByRoles.value);

function isActive(path) {
  /**
   * This function is executed for every sidebar item rendered
   * If the return value is true, that item is highlighted
   * path is from the sidebar item config
   * route.path is the actual path in the browser URL
   *
   * Since paths of all components start with '/',
   * dashboard requires a special check All types of datasets use the same
   * /datasets/ prefix, these require special handling
   */
  if (path === "/") return route.path === "/";
  if (
    route.path.startsWith("/datasets") &&
    sidebarDatasetType.value in config.dataset.types
  ) {
    return (
      path ===
      `/${config.dataset.types[sidebarDatasetType.value]?.collection_path}`
    );
  }
  return route.path.startsWith(path);
}

// todo - operator items are messed up in UI
const getFeaturesForRole = ({ role = "", sharedWithRole = "" } = {}) => {
  let roleItems = [];
  // const userRole = auth.user.roles[0];

  switch (role) {
    case "admin":
      roleItems = admin_items;
      break;
    case "operator":
      roleItems = operator_items;
      break;
    case "user":
      roleItems = user_items;
      break;
    default:
      roleItems = user_items;
  }

  if (!sharedWithRole) {
    return roleItems;
  }

  roleItems = roleItems
    .filter((item) => {
      return (item.enabled_for_roles || []).length > 0
        ? (item.enabled_for_roles || []).includes(sharedWithRole)
        : true;
    })
    .filter((item) => !!item);

  return roleItems;

  // if (auth.hasRole("operator") || auth.hasRole("admin")) {
  //   return operator_items;
  // } else if (auth.hasRole("user")) {
  //   const currentUserRole = auth.user.roles[0];
  //   return operator_items
  //     .filter((item) => {
  //       return item.enabled_for_roles?.includes(currentUserRole);
  //     })
  //     .filter((item) => !!item);
  // }

  // check which items are shared with all orther roles

  // take current role as arg
  // OR get roles of with which to share items - array arg
  //  - return items which are shared with all roles

  // -for admin div, return Projects
  // - for operator div, return

  // let res = operator_items
  //   .map((item) => {
  //     if ((item.enabled_for_roles || []).length === 0) {
  //       return item;
  //     }
  //
  //     // console.log("item", item);
  //     const itemPermittedByRole = item.enabled_for_roles?.some((role) => {
  //       return auth.hasRole(role);
  //     });
  //     return itemPermittedByRole ? item : null;
  //   })
  //   .filter((item) => item !== null);

  // console.log("res", res);

  // return res;

  // const datasetCreationFeature = constants.sidebar.operator_items.find(
  //   (item) => item.feature_key === constants.features.CREATE_DATASET,
  // );
  // if (datasetCreationFeature) {
  //   // Current user either has the Operator/Admin role or the User role
  //   return auth.canOperate || !(auth.canOperate || auth.canAdmin);
  // } else {
  //   // Current user does not have the User role
  //   return auth.canOperate;
  // }
};

router.beforeEach(() => {
  sidebarDatasetType.value = null;
});
</script>

<style>
/* In minimized state, the default right margin is making the icons smaller */
aside.va-sidebar--minimized .va-sidebar__item__content > * {
  margin-right: 0;
}
</style>
