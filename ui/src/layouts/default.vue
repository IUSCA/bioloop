<template>
  <div class="flex flex-row h-screen">
    <nav
      aria-label="menu nav"
      class="relative h-full content-center flex-none w-64 shadow-xl"
    >
      <Sidebar></Sidebar>
    </nav>
    <main class="grow overflow-y-scroll max-w-[calc(100vw-16rem)]">
      <div class="px-4 pb-10 pt-3 min-h-screen">
        <router-view></router-view>
      </div>
      <Footer></Footer>
    </main>
  </div>
</template>

<script setup></script>
