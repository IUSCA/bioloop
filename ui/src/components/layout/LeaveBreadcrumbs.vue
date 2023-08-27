<template>
  <va-breadcrumbs
    separator=">"
    v-show="VISIBILITY.isBreadcrumbNavVisible"
    :class="'text-sm mb-3 breadcrumbs'"
  >
    <va-breadcrumbs-item
      v-for="(item, index) in breadcrumbs"
      :key="`${item}-${index}`"
      :label="getItemLabel(item)"
      :to="item.to"
      :disabled="index === breadcrumbs.length - 1"
    >
      <Icon :icon="item.icon" v-if="!!item.icon" />
    </va-breadcrumbs-item>
  </va-breadcrumbs>
  <va-divider v-if="VISIBILITY.isBreadcrumbNavVisible" />
</template>

<script setup>
import api from "@/services/api";
import { useBreadcrumbsStore } from "@/stores/breadcrumbs";
import { useUIStore } from "@/stores/ui";
import { useDatasetStore } from "@/stores/dataset";
import { useProjectStore } from "@/stores/projects/project";
import { useAuthStore } from "@/stores/auth";
import { useFileBrowserStore } from "@/stores/fileBrowser";
import { useToastStore } from "@/stores/toast";

const auth = useAuthStore();
const breadcrumbsStore = useBreadcrumbsStore();
const datasetStore = useDatasetStore();
const projectStore = useProjectStore();
const fileBrowserStore = useFileBrowserStore();
const route = useRoute();
const ui = useUIStore();
const toast = useToastStore();

const getItemLabel = (item) => {
  const isLabelBreadcrumb =
    Object.values(BREADCRUMBS).filter((e) => e.label === item.label).length > 0;
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

const fileList = computed(() => {
  return fileBrowserStore.fileList;
});

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
    })
    .catch((e) => {
      console.error(e);
      toast.error("Unable to fetch project details");
    });
};

const fetch_dataset = (datasetId) => {
  return api
    .get(`/datasets/${datasetId}`)
    .then((res) => {
      const dataset = res.data;
      // configuring dataset's workflows requires external logic that is overkill to include here.
      // When the Dataset component mounts, the dataset fetches and sets its workflows, if
      // they aren't already set.
      delete dataset.workflows;
      datasetStore.setDataset(dataset);
      return dataset;
    })
    .catch((e) => {
      console.error(e);
      toast.error("Unable to fetch dataset details");
    });
};

const fetch_file_list = (datasetId) => {
  return api
    .get(`/datasets/${datasetId}/files`, {
      params: {
        basepath: "",
      },
    })
    .then((res) => {
      const fileList = res.data;
      fileBrowserStore.setFileList(fileList);
      return fileList;
    })
    .catch((e) => {
      console.error(e);
      toast.error("Unable to fetch file list");
    });
};

const fetchResourcesForBreadcrumbs = () => {
  const routeProjectId = route.params.projectId;
  const routeDatasetId = parseInt(route.params.datasetId);
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
  promises.push(
    !route.path.includes("/filebrowser")
      ? Promise.resolve(fileList.value)
      : fetch_file_list(routeDatasetId)
  );

  return Promise.all(promises).then((values) => {
    return {
      dataset: values[0],
      project: values[1],
      fileList: values[2],
    };
  });
};

onMounted(() => {
  configureAppBreadcrumbs();
});

watch(
  () => route.path,
  () => {
    configureAppBreadcrumbs();
  }
);

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
    Object.values(DATASET_BREADCRUMBS).find((path) => {
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

const configureAppBreadcrumbs = () => {
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
    Object.values(BREADCRUMBS).find((path) => {
      return route.path.includes(path.to);
    }),
    1
  );

  // fetch any resources needed to setup further breadcrumb items
  ui.setIsLoadingResource(true);
  fetchResourcesForBreadcrumbs().then(({ project, dataset }) => {
    if (route.params.projectId && project.slug) {
      configureProjectBreadcrumb(project);
    }
    if (route.params.datasetId && dataset.name) {
      configureDatasetBreadcrumbs(dataset);
    }
    if (route.path.includes("/filebrowser")) {
      configureFileBrowserBreadcrumbs();
    }
    ui.setIsLoadingResource(false);

    VISIBILITY.isBreadcrumbNavVisible = true;
  });
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
  DATASET: { label: "Dataset" },
  FILES: { label: "Files" },
};

const DATASET_BREADCRUMBS = {
  RAW_DATA: BREADCRUMBS.RAW_DATA,
  DATA_PRODUCTS: BREADCRUMBS.DATA_PRODUCTS,
  DATASET: BREADCRUMBS.DATASET,
};
</script>

<style>
@media all and (max-width: 639px) {
  .breadcrumbs {
    padding-top: 0.25rem;
  }
}
</style>
