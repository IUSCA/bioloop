<template>
  <div class="flex flex-col gap-4">
    <div class="page-header">
      <h1 class="text-2xl font-bold mb-2">Conversions</h1>
      <p class="text-muted">Manage data conversion definitions and monitor conversion workflows</p>
    </div>

    <div class="conversions-content">
      <va-card>
        <va-card-content>
          <h2 class="text-xl font-bold mb-3">Conversion Definitions</h2>
          <ConversionDefinitionSelect />
        </va-card-content>
      </va-card>

      <va-card>
        <va-card-content>
          <h2 class="text-xl font-bold mb-3">Create New Conversion</h2>
          <ConversionForm />
        </va-card-content>
      </va-card>

      <va-card>
        <va-card-content>
          <h2 class="text-xl font-bold mb-3">Recent Conversions</h2>
          <Conversion />
        </va-card-content>
      </va-card>
    </div>
  </div>
</template>

<script setup>
import Conversion from '@/components/conversions/Conversion.vue';
import ConversionDefinitionSelect from '@/components/conversions/ConversionDefinitionSelect.vue';
import ConversionForm from '@/components/conversions/ConversionForm.vue';
</script>

<style scoped>
.page-header {
  margin-bottom: 1rem;
}

.text-muted {
  color: #6c757d;
  font-size: 1.1rem;
}

.conversions-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
