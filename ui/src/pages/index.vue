<template>
  <div></div>
</template>

<script setup>
// import { useAuthStore } from "@/stores/auth";

// const auth = useAuthStore();
const router = useRouter();

router.push("/v2/home");
// if (auth.canOperate) {
//   router.push("/v2/groups");
// } else {
//   router.push("/projects");
// }
</script>
