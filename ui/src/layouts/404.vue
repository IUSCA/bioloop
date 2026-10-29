<template>
  <div class="flex flex-row h-screen">
    <main class="grow shrink-0 overflow-y-scroll flex flex-col justify-between">
      <div class="text-center p-40">
        <env-alert icon="warning" class="w-2/4" />
        <router-view></router-view>
        <div class="m-3 text-sm mt-8">
          <va-button size="large" round @click="router.back()">
            Go Back
          </va-button>
        </div>
      </div>
      <Footer class="flex-grow-0"></Footer>
    </main>
  </div>
</template>

<script setup>
const router = useRouter();
</script>
