<template>
  <div data-testid="data-products-list">
    <dataset-list dtype="DATA_PRODUCT" label="Data Product"></dataset-list>
  </div>
</template>

<route lang="yaml">
meta:
  title: Data Products
  requiresFeature: dataProducts
  nav: [{ label: "Data Products" }]
</route>
