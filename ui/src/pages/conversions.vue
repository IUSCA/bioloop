<template>
  <div class="conversions-page">
    <div class="page-header">
      <h1>Conversions</h1>
      <p class="text-muted">Manage data conversion definitions and monitor conversion workflows</p>
    </div>

    <div class="conversions-content">
      <div class="conversion-definitions-section">
        <h2>Conversion Definitions</h2>
        <ConversionDefinitionSelect />
      </div>

      <div class="conversion-form-section">
        <h2>Create New Conversion</h2>
        <ConversionForm />
      </div>

      <div class="conversion-list-section">
        <h2>Recent Conversions</h2>
        <Conversion />
      </div>
    </div>
  </div>
</template>

<script setup>
import Conversion from '@/components/conversions/Conversion.vue';
import ConversionDefinitionSelect from '@/components/conversions/ConversionDefinitionSelect.vue';
import ConversionForm from '@/components/conversions/ConversionForm.vue';
</script>

<style scoped>
.conversions-page {
  padding: 2rem;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  margin-bottom: 0.5rem;
  font-size: 2rem;
  font-weight: 600;
}

.text-muted {
  color: #6c757d;
  font-size: 1.1rem;
}

.conversions-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.conversion-definitions-section,
.conversion-form-section,
.conversion-list-section {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.conversion-definitions-section h2,
.conversion-form-section h2,
.conversion-list-section h2 {
  margin-bottom: 1rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
}
</style>
