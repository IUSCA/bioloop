<template>
  <div class="flex flex-row h-screen">
    <main class="grow shrink-0 overflow-y-scroll flex flex-col justify-between">
      <div class="flex-auto pb-10">
        <router-view />
      </div>
      <Footer class="flex-grow-0"></Footer>
    </main>
  </div>
</template>
