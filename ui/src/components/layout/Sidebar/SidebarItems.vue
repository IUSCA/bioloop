<template>
  <va-accordion>
    <template v-for="item in props.items">
      <va-collapse
        v-model="collapsibleStates"
        v-if="item.children"
        :key="item.title + 'collapse'"
      >
        <template #header="{ value: isCollapsed }">
          <va-sidebar-item
            :active="
              props.isActive(item.path) ||
              item.children.some((child) => props.isActive(child.path))
            "
            :to="item.path"
          >
            <va-sidebar-item-content>
              <Icon :icon="item.icon" class="text-2xl" />
              <!-- User can hide item with css if they want -->
              <va-sidebar-item-title :data-testid="item.test_id">
                {{ item.title }}
              </va-sidebar-item-title>
              <!--            <va-spacer />-->
              <va-icon :name="isCollapsed ? 'va-arrow-up' : 'va-arrow-down'" />
            </va-sidebar-item-content>
          </va-sidebar-item>
        </template>

        <template #body>
          <va-sidebar-item
            class="ml-5"
            v-for="child in item.children"
            :key="child.title"
            :to="child.path"
            :active="props.isActive(child.path)"
          >
            <va-sidebar-item-content>
              <Icon :icon="child.icon" class="text-2xl" />

              <va-sidebar-item-title>{{ child.title }}</va-sidebar-item-title>
            </va-sidebar-item-content>
          </va-sidebar-item>
        </template>
      </va-collapse>

      <va-sidebar-item
        v-else
        :key="item.title"
        :to="item.path"
        :active="props.isActive(item.path)"
      >
        <va-sidebar-item-content>
          <Icon :icon="item.icon" class="text-2xl" />
          <!-- User can hide item with css if they want -->
          <va-sidebar-item-title :data-testid="item.test_id">
            {{ item.title }}
          </va-sidebar-item-title>
        </va-sidebar-item-content>
      </va-sidebar-item>
    </template>
  </va-accordion>
</template>

<script setup>
const props = defineProps({
  items: { type: Array, required: true },
  isActive: { type: Function, required: true },
});

const route = useRoute();

const collapsibleStates = computed({
  get() {
    return props.items.some((item) => {
      return (item.children || []).some((child) => {
        return route.path.startsWith(child.path);
      });
    });
  },
  set(value) {},
});
</script>

<style scoped></style>
