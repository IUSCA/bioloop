<template>
  <main class="px-4 py-10 mt-10 text-center text-sky-700">
    <div>
      <p class="text-4xl">
        <i-mdi-alert-circle-outline class="inline-block" />
      </p>
    </div>
    <router-view />
    <div>
      <div class="m-3 text-sm mt-8">
        <va-button @click="router.back()"> Go Back </va-button>
      </div>
    </div>
  </main>
</template>

<script setup>
const router = useRouter();
</script>
