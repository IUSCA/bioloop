#!/usr/bin/env node

const { main } = require('../src/scripts/insert_mock_tracks');

main()
  .then(() => {
    console.log('✅ Mock tracks data insertion completed successfully!');
    console.log('\n📊 Created test data:');
    console.log('   • 5 research projects');
    console.log('   • 6 datasets (Data Products)');
    console.log('   • Multiple dataset files per dataset');
    console.log('   • Tracks for visualizable file types (bam, vcf, bigwig, bed, gtf)');
    console.log('   • Project assignments for datasets and tracks');
    console.log('   • e2eUser assigned to all projects');
    console.log('\n🎯 You can now test the tracks feature with this comprehensive test data!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Mock tracks data insertion failed:', error);
    process.exit(1);
  });
