<template>
  <va-select
    v-model="model"
    :options="definitions"
    text-by="name"
    placeholder="Select a conversion definition"
    label="Conversion Definition"
    searchable
    inner-label
    :highlight-matched-text="false"
    id="conversion-definition-select"
    :loading="loading"
  >
  </va-select>
</template>

<script setup>
import conversionService from "@/services/conversions";
// const props = defineProps({})

const model = defineModel();

const definitions = ref([]);
const loading = ref(false);

onMounted(() => {
  loading.value = true;
  conversionService
    .getAllDefinitions()
    .then((response) => {
      definitions.value = response.data;
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>

<style lang="scss">
#conversion-definition-select .va-input-wrapper__field {
  --va-input-wrapper-min-height: 45px;
}
</style>
