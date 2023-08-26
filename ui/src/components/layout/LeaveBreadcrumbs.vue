<template>
  <va-breadcrumbs
    separator=">"
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

const fetch_project = (projectId) => {
  // debugger;
  if (!project) {
    // debugger;
  }
  return (
    api
      .get(
        `/projects/${
          !auth.canOperate ? `${auth.user.username}/${projectId}` : projectId
        }`
      )
      // .then((res) => {
      //   debugger;
      //   return new Promise((resolve) => {
      //     setTimeout(() => {
      //       debugger;
      //       resolve(res);
      //     }, 2000);
      //   });
      // })
      .then((res) => {
        const project = res.data;
        projectStore.setProject(project);
        // debugger;
        return project;
      })
  );
};

const fetch_dataset = (datasetId) => {
  // debugger;
  if (!datasetId) {
    // debugger;
  }

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

const fetchResourcesForBreadcrumbs = () => {
  const routeProjectId = route.params.projectId;
  const routeDatasetId = route.params.datasetId;
  const promises = [];

  promises.push(
    !routeDatasetId || routeDatasetId === dataset.value.id
      ? Promise.resolve(dataset.value)
      : fetch_dataset(routeDatasetId)
  );
  promises.push(
    !routeProjectId || routeProjectId === project.value.slug
      ? Promise.resolve(project.value)
      : fetch_project(routeProjectId)
  );

  debugger;
  return Promise.all(promises).then((values) => {
    debugger;
    return {
      dataset: values[0],
      project: values[1],
    };
  });
};

onMounted(() => {
  debugger;
  configureAppBreadcrumbs();
});

watch(
  () => route.path,
  () => {
    // fetchResourcesForBreadcrumbs();
    debugger;
    configureAppBreadcrumbs();
  }
);

const configureProjectBreadcrumb = (project) => {
  debugger;
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
  debugger;
  if (!dataset.id) {
    return;
  }

  breadcrumbsStore.addNavItem(
    Object.values(DATASET_PATHS).find((path) => {
      return route.path.includes(path.label.trim().toLowerCase());
    }),
    route.params.projectId ? 3 : 1
  );

  let dataset_path = "/";
  if (route.params.projectId) {
    dataset_path += `projects/${route.params.projectId}/`;
  }
  // If inside the Project view, dataset breadcrumb's URL will always
  // be .../datasets/. Otherwise, it can be /datasets/, /rawdata/,
  // or /dataproducts/, depending on current route.
  const dataset_path_prefix = route.params.projectId
    ? "datasets"
    : route.path.slice(1, route.path.indexOf("/", 1));
  dataset_path += `${dataset_path_prefix}/${route.params.datasetId}`;

  breadcrumbsStore.addNavItem(
    {
      label: dataset.name,
      to: dataset_path,
    },
    route.params.projectId ? 4 : 2
  );
};

const configureAppBreadcrumbs = () => {
  // debugger;

  ui.setIsLoadingResource(true);

  if (route.path.includes("/dashboard")) {
    showBreadcrumbNav.value = false;
    ui.setIsLoadingResource(false);
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

  fetchResourcesForBreadcrumbs().then(({ project, dataset }) => {
    // debugger;
    if (route.params.projectId) {
      configureProjectBreadcrumb(project);
    }
    if (route.params.datasetId) {
      configureDatasetBreadcrumbs(dataset);
    }
    if (route.path.includes("/filebrowser")) {
      breadcrumbsStore.addNavItem(
        { label: "Files" },
        route.params.projectId ? 5 : 3
      );
    }

    ui.setIsLoadingResource(false);
  });
};

onBeforeRouteLeave((to) => {
  // debugger;
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
