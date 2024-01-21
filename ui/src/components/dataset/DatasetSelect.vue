<template>
  <AdvancedSearch
    placeholder="Search Datasets by name"
    selected-label="Datasets to assign"
    :selected-results="props.selectedResults"
    :query="query"
    :search-result-columns="retrievedDatasetColumns"
    :selected-result-columns="selectedDatasetColumns"
    :fetch-fn="datasetService.getAll"
    search-field="name"
    results-by="datasets"
    count-by="metadata.count"
    @reset="
      () => {
        checkboxes.rawData = false;
        checkboxes.dataProduct = false;
      }
    "
  >
    <template #filters>
      <va-button-dropdown
        :label="`Filters${activeCountText}`"
        :close-on-content-click="false"
      >
        <div class="flex flex-col gap-1">
          <va-checkbox v-model="checkboxes.rawData" label="Raw Data" />
          <va-checkbox v-model="checkboxes.dataProduct" label="Data Products" />
        </div>
      </va-button-dropdown>
    </template>

    <template #type="slotProps">
      <DatasetType
        :type="slotProps['value']"
        :show-icon="!(breakpoint.sm || breakpoint.xs)"
      />
    </template>
  </AdvancedSearch>
</template>

<script setup>
import datasetService from "@/services/dataset";
import { date } from "@/services/datetime";
import { formatBytes, lxor } from "@/services/utils";
import { useBreakpoint } from "vuestic-ui";

const NAME_TRIM_THRESHOLD = 15;

const props = defineProps({
  selectedResults: {
    type: Array,
    default: () => [],
  },
});

const breakpoint = useBreakpoint();

const columnWidths = computed(() => {
  return {
    name: breakpoint.xs || breakpoint.sm ? "165px" : "175px",
    type: "120px",
    size: "100px",
    created_at: "105px",
  };
});

const trimName = (val) =>
  val.length > NAME_TRIM_THRESHOLD
    ? val.substring(0, NAME_TRIM_THRESHOLD) + "..."
    : val;

const mobileViewColumns = computed(() => {
  return [
    {
      key: "name",
      label: "Name",
      width: columnWidths.value.name,
      formatFn: trimName,
    },
    {
      key: "type",
      label: "Type",
      slotted: true,
      width: columnWidths.value.type,
    },
  ];
});

const desktopViewColumns = computed(() => {
  return [
    {
      key: "size",
      label: "Size",
      formatFn: (val) => formatBytes(val),
      width: columnWidths.value.size,
    },
    {
      key: "created_at",
      label: "Registered On",
      formatFn: (val) => date(val),
      width: columnWidths.value.created_at,
    },
  ];
});

const retrievedDatasetColumns = computed(() => {
  return breakpoint.sm || breakpoint.xs
    ? mobileViewColumns.value
    : mobileViewColumns.value.concat(desktopViewColumns.value);
});

const selectedDatasetColumns = computed(() =>
  mobileViewColumns.value.filter((col) => col.key === "name"),
);

const checkboxes = ref({
  rawData: false,
  dataProduct: false,
});

const activeCountText = computed(() => {
  const activeCount = Object.values(checkboxes.value).filter(
    (val) => !!val,
  ).length;
  return activeCount > 0 ? ` (${activeCount})` : "";
});

const query = computed(() => {
  const selectedDatasetType = checkboxes.value.rawData
    ? "RAW_DATA"
    : checkboxes.value.dataProduct && "DATA_PRODUCT";

  return {
    type: lxor(checkboxes.value.rawData, checkboxes.value.dataProduct)
      ? selectedDatasetType
      : undefined,
  };
});
</script>
