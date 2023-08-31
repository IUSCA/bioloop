<template>
  <va-breadcrumbs
    separator=">"
    v-show="VISIBILITY.isBreadcrumbNavVisible"
    :class="'text-lg mb-3 breadcrumbs'"
  >
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbs"
      :key="`${item}-${index}`"
      :label="getItemLabel(item)"
      :to="item.to"
      :disabled="index === breadcrumbs.length - 1 || item.disabled"
    >
      <Icon :icon="item.icon" v-if="!!item.icon" />
    </va-breadcrumbs-item>
  </va-breadcrumbs>
  <va-divider v-if="VISIBILITY.isBreadcrumbNavVisible" />
</template>

<script setup>
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";
import { useUIStore } from "@/stores/ui";
import { useDatasetStore } from "@/stores/dataset";
import { useProjectStore } from "@/stores/projects/project";
import { getDatasetPathPrefix } from "@/services/utils";

const breadcrumbsStore = useBreadcrumbsStore();
const datasetStore = useDatasetStore();
const projectStore = useProjectStore();
const route = useRoute();
const ui = useUIStore();

const getItemLabel = (item) => {
  const isLabelBreadcrumb =
    Object.values(BREADCRUMBS).filter((crumb) => crumb.label === item.label)
      .length > 0;
  return isLabelBreadcrumb || !ui.isMobileView
    ? item.label
    : item.label?.slice(0, 7) + "...";
};

const breadcrumbs = computed(() => {
  return breadcrumbsStore.breadcrumbNavItems;
});

const project = computed(() => {
  return projectStore.project;
});

const dataset = computed(() => {
  return datasetStore.dataset;
});

onMounted(() => {
  configureAppBreadcrumbs();
});

watch([() => project.value, () => dataset.value], () => {
  configureAppBreadcrumbs(project.value, dataset.value);
});

const configureProjectBreadcrumb = (project) => {
  if (!project.slug) {
    return;
  }
  breadcrumbsStore.addNavItem(
    {
      label: project.name,
      to: `/projects/${project.slug}`,
    },
    2
  );
};

const configureDatasetBreadcrumbs = (dataset) => {
  if (!dataset.id) {
    return;
  }

  // add breadcrumb to indicate type of dataset (
  // 'Raw Data', 'Data Product', etc.)
  breadcrumbsStore.addNavItem(
    {
      ...Object.values(DATASET_BREADCRUMBS).find((crumb) =>
        crumb.to.includes(dataset.type.replace("_", "").toLowerCase())
      ),
      disabled: route.params.projectId && route.params.datasetId,
    },
    route.params.projectId ? 3 : 1
  );

  let dataset_path = "";
  if (route.params.projectId) {
    dataset_path += `/projects/${route.params.projectId}`;
  }
  // If inside the Project view, dataset breadcrumb's URL will always
  // be .../datasets/. Else, it can be /rawdata/... or /dataproducts/...,
  // depending on the type of dataset being rendered.
  dataset_path += route.params.projectId
    ? "/datasets/"
    : `${getDatasetPathPrefix(dataset)}/`;
  dataset_path += `${dataset.id}`;

  // add breadcrumb for actual dataset
  breadcrumbsStore.addNavItem(
    {
      label: dataset.name,
      to: dataset_path,
    },
    route.params.projectId ? 4 : 2
  );
};

const configureFileBrowserBreadcrumbs = () => {
  breadcrumbsStore.addNavItem(
    { label: "Files" },
    route.params.projectId ? 5 : 3
  );
};

const configureAppBreadcrumbs = (project, dataset) => {
  VISIBILITY.isBreadcrumbNavVisible = false;

  breadcrumbsStore.resetNavItems();

  if (route.path === "/" || route.path.includes("/dashboard")) {
    VISIBILITY.isBreadcrumbNavVisible = true;
    return;
  }

  // add breadcrumb item for home
  breadcrumbsStore.addNavItem({ icon: "mdi-home", to: "/" }, 0);

  // add breadcrumb item for first level pages (Projects, Profile, etc.)
  breadcrumbsStore.addNavItem(
    Object.values(BREADCRUMBS).find((crumb) => route.path.includes(crumb.to)),
    1
  );

  if (route.params.projectId && project?.slug) {
    configureProjectBreadcrumb(project);
  }
  if (route.params.datasetId && dataset?.name) {
    configureDatasetBreadcrumbs(dataset);
  }
  if (route.path.includes("/filebrowser")) {
    configureFileBrowserBreadcrumbs();
  }

  VISIBILITY.isBreadcrumbNavVisible = true;
};

const VISIBILITY = {
  _isBreadcrumbNavVisible: false,
  get isBreadcrumbNavVisible() {
    return (
      route.path !== "/" &&
      !route.path.includes("/dashboard") &&
      !ui.isLoadingResource
    );
  },
  set isBreadcrumbNavVisible(val) {
    this._isBreadcrumbNavVisible = val;
  },
};

const BREADCRUMBS = {
  PROJECTS: { label: "Projects", to: "/projects" },
  USERS: { label: "Users", to: "/users" },
  ABOUT: { label: "About", to: "/about" },
  PROFILE: { label: "Profile", to: "/profile" },
  RAW_DATA: { label: "Raw Data", to: "/rawdata" },
  DATA_PRODUCTS: { label: "Data Products", to: "/dataproducts" },
  FILES: { label: "Files" },
};

const DATASET_BREADCRUMBS = {
  RAW_DATA: BREADCRUMBS.RAW_DATA,
  DATA_PRODUCTS: BREADCRUMBS.DATA_PRODUCTS,
};
</script>

<style>
@media all and (max-width: 639px) {
  .breadcrumbs {
    padding-top: 0.25rem;
  }
}

.va-breadcrumbs__item:not(:last-child) {
  color: rgb(118, 124, 136);
}
</style>
