<template>
  <div class="flex flex-row h-screen">
    <main class="grow overflow-y-scroll flex flex-col justify-between">
      <div class="py-10 flex justify-center">
        <router-view />
      </div>
      <Footer class="flex-grow-0"></Footer>
    </main>
  </div>
</template>
