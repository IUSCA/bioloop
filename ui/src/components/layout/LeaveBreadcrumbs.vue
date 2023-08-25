<template>
  <va-breadcrumbs
    v-if="showBreadcrumbNav"
    :class="ui.isMobileView ? 'text-sm' : 'text-xl'"
  >
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbs"
      :key="`${item}-${index}`"
      :label="item.label"
      :to="item.to"
      :disabled="index === breadcrumbs.length - 1"
    >
      <Icon :icon="item.icon" v-if="!!item.icon" />
    </va-breadcrumbs-item>
  </va-breadcrumbs>
  <va-divider v-if="showBreadcrumbNav" />
  <slot></slot>
</template>

<script setup>
import api from "@/services/api";
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";
import { useUIStore } from "@/stores/ui";
import { useDatasetStore } from "@/stores/dataset";
import { useProjectStore } from "@/stores/projects/project";
import { useAuthStore } from "@/stores/auth";
import { onBeforeRouteLeave } from "vue-router";

const showBreadcrumbNav = ref(true);

const auth = useAuthStore();
const breadcrumbsStore = useBreadcrumbsStore();
const datasetStore = useDatasetStore();
const projectStore = useProjectStore();
const route = useRoute();
const ui = useUIStore();

const breadcrumbs = computed(() => {
  return breadcrumbsStore.breadcrumbNavItems;
});

const project = computed(() => {
  return projectStore.project;
});

const dataset = computed(() => {
  return datasetStore.dataset;
});

const configureAppBreadcrumbs = (project, dataset) => {
  if (route.path.includes("/dashboard")) {
    showBreadcrumbNav.value = false;
    return;
  }

  // add first two breadcrumb items
  breadcrumbsStore.addNavItem({ icon: "mdi-home", to: "/" }, 0);
  breadcrumbsStore.addNavItem(
    Object.values(LEVEL_1_PATHS).find((path) => {
      return route.path.includes(path.to);
    }),
    1
  );

  // add breadcrumb for project's label
  if (route.params.projectId) {
    configureProjectBreadcrumbs(project);
  }

  if (route.params.datasetId) {
    // add breadcrumb to indicate type of dataset ('Raw Data', 'Data Products', etc.)
    breadcrumbsStore.addNavItem(
      Object.values(DATASET_PATHS).find((path) => {
        return route.path.includes(path.label.trim().toLowerCase());
      }),
      route.params.projectId ? 3 : 1
    );
    // add breadcrumb for dataset's label
    configureDatasetBreadcrumbs(dataset);
    // add breadcrumb for file browser
    if (route.path.includes("/filebrowser")) {
      breadcrumbsStore.addNavItem(
        { label: "Files" },
        route.params.projectId ? 5 : 3
      );
    }
  }
};

const configureProjectBreadcrumbs = (project) => {
  const configureBreadcrumb = (project) => {
    breadcrumbsStore.addNavItem(
      {
        label: project.name,
        to: `/projects/${project.slug}`,
      },
      2
    );
  };

  // If project in the route is the same as the one in the store,
  // its breadcrumb can be configured now
  if (route.params.projectId === project?.slug) {
    configureBreadcrumb(project);
  } else {
    // If not, fetch project and configure its breadcrumb
    fetch_project(route.params.projectId).then((project) => {
      configureBreadcrumb(project);
    });
  }
};

const configureDatasetBreadcrumbs = (dataset) => {
  const configureBreadcrumb = (dataset) => {
    let to = "/";
    if (route.params.projectId) {
      to += `projects/${route.params.projectId}/`;
    }
    // If inside the Project view, dataset breadcrumb's URL will always
    // be .../datasets/. Otherwise, it can be /datasets/, /rawdata/,
    // or /dataproducts/, depending on current route.
    const dataset_path_prefix = route.params.projectId
      ? "datasets"
      : route.path.slice(1, route.path.indexOf("/", 1));
    to += `${dataset_path_prefix}/${route.params.datasetId}`;

    breadcrumbsStore.addNavItem(
      {
        label: dataset.name,
        to,
      },
      route.params.projectId ? 4 : 2
    );
  };

  // If dataset in the route is the same as the one in the store,
  // its breadcrumb can be configured now
  if (route.params.datasetId === dataset?.id) {
    configureBreadcrumb(dataset);
  } else {
    fetch_dataset(route.params.datasetId).then((dataset) => {
      // If not, fetch dataset and configure its breadcrumb
      configureBreadcrumb(dataset);
    });
  }
};

const fetch_project = (projectId) => {
  return api
    .get(
      `/projects/${
        !auth.canOperate ? `${auth.user.username}/${projectId}` : projectId
      }`
    )
    .then((res) => {
      const project = res.data;
      projectStore.setProject(project);
      return project;
    });
};

const fetch_dataset = (datasetId) => {
  return api.get(`/datasets/${datasetId}`).then((res) => {
    const dataset = res.data;
    // configuring dataset's workflows requires external logic that is overkill to include here.
    // When the Dataset component mounts, the dataset fetches and sets its workflows, if
    // they aren't already set.
    delete dataset.workflows;

    datasetStore.setDataset(dataset);
    return dataset;
  });
};

onMounted(() => {
  configureAppBreadcrumbs(project.value, dataset.value);
});

watch(
  () => route.path,
  () => {
    configureAppBreadcrumbs(project.value, dataset.value);
  }
);

onBeforeRouteLeave((to) => {
  if (!to.params.projectId) {
    breadcrumbsStore.removeProjectBreadcrumbs();
  }
  if (!to.params.datasetId) {
    breadcrumbsStore.removeDatasetBreadcrumbs();
  }
  if (!to.path.includes("filebrowser")) {
    breadcrumbsStore.removeFilebrowserBreadcrumbs();
  }
});

const LEVEL_1_PATHS = {
  PROJECTS: { label: "Projects", to: "/projects" },
  USERS: { label: "Users", to: "/users" },
  ABOUT: { label: "About", to: "/about" },
  PROFILE: { label: "Profile", to: "/profile" },
  RAW_DATA: { label: "Raw Data", to: "/rawdata" },
  DATA_PRODUCTS: { label: "Data Products", to: "/dataproducts" },
  DATASET: { label: "Dataset" },
};

const DATASET_PATHS = {
  RAW_DATA: LEVEL_1_PATHS.RAW_DATA,
  DATA_PRODUCTS: LEVEL_1_PATHS.DATA_PRODUCTS,
  DATASET: LEVEL_1_PATHS.DATASET,
};
</script>
