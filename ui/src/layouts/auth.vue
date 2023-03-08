<template>
  <div class="flex flex-row h-screen">
    <main class="grow overflow-y-scroll flex flex-col justify-between">
      <div class="pb-10">
        <router-view />
      </div>
      <Footer class="flex-grow-0"></Footer>
    </main>
  </div>
</template>
