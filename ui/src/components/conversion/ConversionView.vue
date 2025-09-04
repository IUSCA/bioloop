<template>
  <va-inner-loading :loading="loading">
    <!-- Content -->
    <div class="flex flex-col gap-3">
      <!-- Conversion Info Card -->
      <div class="grid gird-cols-1 lg:grid-cols-2 gap-3">
        <!-- Conversion Info -->
        <div class="">
          <va-card>
            <va-card-title>
              <div class="flex flex-nowrap items-center w-full">
                <span class="flex-auto text-lg"> Conversion Info </span>
              </div>
            </va-card-title>
            <va-card-content>
              <ConversionDetails :conversion="conversion"></ConversionDetails>
            </va-card-content>
          </va-card>
        </div>
      </div>

      <!-- Derived Datasets Card -->
      <va-card>
        <va-card-title>
          <div class="flex flex-nowrap items-center w-full">
            <span class="flex-auto text-lg"> Derived Datasets </span>
          </div>
        </va-card-title>
        <va-card-content>
          <ConversionDerivedDatasets :conversion-id="conversion.id" />
        </va-card-content>
      </va-card>
  </div>
  </va-inner-loading>
</template>

<script setup>
import ConversionService from "@/services/conversions";

const props = defineProps({ conversionId: String });

const conversion = ref({});
const loading = ref(false);

function fetch_conversion(show_loading = false) {
  loading.value = show_loading;
  ConversionService.get(props.conversionId, 
    {
      include_dataset: true,
      include_derived_datasets: true,
    })
  .then((res) => {
      conversion.value = res.data;
      console.log('conversion.value', conversion.value);
    })
    .catch((err) => {
      console.error(err);
      if (err?.response?.status == 404)
        toast.error("Could not find the conversion");
      else toast.error("Could not fetch conversion");
    })
    .finally(() => {
      loading.value = false;
    });
}

onMounted(() => {
  fetch_conversion(true);
});

</script>
