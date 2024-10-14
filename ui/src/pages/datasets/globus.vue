<!--<template></template>-->

<!--<script setup>-->
<!--import { lxor } from "@/services/utils";-->

<!--const route = useRoute();-->
<!--const router = useRouter();-->

<!--const globusAuthStoredState = ref(useLocalStorage("globus.auth.state", ""));-->
<!--const globusAuthCode = ref(useLocalStorage("globus.auth.code", ""));-->

<!--onMounted(() => {-->
<!--  // reset code if already exists in local storage-->
<!--  globusAuthCode.value = "";-->

<!--  // If neither code nor state is present in the route query, redirect to-->
<!--  // Globus Auth-->
<!--  if (!route.query.code && !route.query.state) {-->
<!--    redirectToGlobusAuth();-->
<!--    return;-->
<!--  }-->
<!--  // if only one of code or state is present, redirect to error page-->
<!--  if (lxor(route.query.code, route.query.state)) {-->
<!--    console.log("Code or State not present");-->
<!--    // Todo - redirect to error page if code or state is missing-->
<!--  } else {-->
<!--    // if both code and state are present, verify if state sent in the Globus-->
<!--    // auth request matches the state returned by Globus auth-->
<!--    if (route.query.state === globusAuthStoredState.value) {-->
<!--      console.log("State matches");-->
<!--      globusAuthCode.value = route.query.code;-->
<!--      // console.log("Post-auth code", globusAuthCode.value);-->
<!--      router.push("/globus/transfer");-->
<!--    } else {-->
<!--      console.log("State does not match");-->
<!--      // Todo - redirect to error page if state does not match-->
<!--    }-->
<!--  }-->
<!--});-->
<!--</script>-->

<!--<style scoped></style>-->
