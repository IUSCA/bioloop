<template>
  <feature-flags />
</template>

<script setup>
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
import FeatureFlags from "@/components/settings/featureFlags.vue";
</script>

<style scoped></style>

<route lang="yaml">
meta:
  title: Settings
  nav: [{ label: "Settings" }]
</route>
