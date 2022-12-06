<template>
  <div class="flex flex-row h-screen">
    <nav
      aria-label="menu nav"
      class="relative h-full content-center flex-none w-64"
    >
      <Sidebar></Sidebar>
    </nav>
    <main class="grow overflow-y-scroll">
      <div class="p-10 min-h-screen">
        <router-view></router-view>
      </div>
      <Footer></Footer>
    </main>
  </div>
</template>

<script setup></script>
