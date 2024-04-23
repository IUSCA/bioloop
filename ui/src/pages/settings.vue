<template>
  <va-card>
    <va-card-title>
      <div class="flex flex-nowrap items-center w-full">
        <span class="flex-auto text-lg"> Features </span>
      </div>
    </va-card-title>
    <va-card-content>
      <va-switch
        v-for="(feature, i) in features"
        :key="i"
        v-model="features[i].enabled"
        :label="feature.label"
      ></va-switch>
    </va-card-content>
  </va-card>
</template>

<script setup>
import { useFeatureFlagStore } from "@/stores/featureFlag";
//
const { features } = useFeatureFlagStore();
// const features = ref([
//   {
//     feature: "feature1",
//     label: "Feature 1",
//     enabled: false,
//     last_updated_by_id: 7,
//   },
//   {
//     feature: "feature2",
//     enabled: true,
//     label: "Feature 2",
//     last_updated_by_id: 7,
//   },
// ]);

// const enabled = ref(true);
// const enabled = ref([true, true]);
// const enabled = computed(() => features.value.map((f) => f.enabled));
// const test_arrayValue = ref([true, true]);

// watch(
//   [
//     enabled,
//     // , test_arrayValue
//   ],
//   () => {
//     console.log("---");
//     console.log("enabled");
//     console.log(enabled.value);
//     // console.log("test_arrayValue");
//     // console.log(test_arrayValue.value);
//   },
// );
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Settings
  nav: [{ label: "Settings" }]
</route>
