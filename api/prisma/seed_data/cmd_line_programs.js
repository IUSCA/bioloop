const cmdLinePrograms = [
  {
    name: 'bcl2fastq',
    executable_path: '/opt/sca/data/conversion/bcl2fastq/scripts/bcl2fastq.sh',
    executable_directory: '/opt/sca/data/conversion/bcl2fastq/execute',
    allow_additional_args: true,
  },
  {
    name: 'bcl-convert',
    executable_path: '/opt/sca/data/conversion/bcl-convert/scripts/bcl-convert.sh',
    executable_directory: '/opt/sca/data/conversion/bcl-convert/execute',
    allow_additional_args: true,
  },
  {
    name: 'cellranger-v8.0.1',
    executable_path: '/opt/sca/data/conversion/cellranger-v8.0.1/cellranger-v8.0.1.sh',
    executable_directory: '/opt/sca/data/conversion/cellranger-v8.0.1/execute',
    allow_additional_args: true,
  },
  {
    name: 'cellranger-v6.1.2',
    executable_path: '/opt/sca/data/conversion/cellranger-v6.1.2/cellranger-v6.1.2.sh',
    executable_directory: '/opt/sca/data/conversion/cellranger-v6.1.2/execute',
    allow_additional_args: true,
  },
  {
    name: 'cellranger-v4.0.0',
    executable_path: '/opt/sca/data/conversion/cellranger-v4.0.0/cellranger-v4.0.0.sh',
    executable_directory: '/opt/sca/data/conversion/cellranger-v4.0.0/execute',
    allow_additional_args: true,
  },
  {
    name: 'cellranger-arc',
    executable_path: '/opt/sca/data/conversion/cellranger-arc/cellranger-arc.sh',
    executable_directory: '/opt/sca/data/conversion/cellranger-arc/execute',
    allow_additional_args: true,
  },
  {
    name: 'cellranger-arc-v2',
    executable_path: '/opt/sca/data/conversion/cellranger-arc-v2/cellranger-arc-v2.sh',
    executable_directory: '/opt/sca/data/conversion/cellranger-arc-v2/execute',
    allow_additional_args: true,
  },
  {
    name: 'cellranger-atac',
    executable_path: '/opt/sca/data/conversion/cellranger-atac/cellranger-atac.sh',
    executable_directory: '/opt/sca/data/conversion/cellranger-atac/execute',
    allow_additional_args: true,
  },
  {
    name: 'spaceranger-v3.0.1',
    executable_path: '/opt/sca/data/conversion/spaceranger-v3.0.1/spaceranger-v3.0.1.sh',
    executable_directory: '/opt/sca/data/conversion/spaceranger-v3.0.1/execute',
    allow_additional_args: true,
  },
  {
    name: 'spaceranger-v1.3.1',
    executable_path: '/opt/sca/data/conversion/spaceranger-v1.3.1/spaceranger-v1.3.1.sh',
    executable_directory: '/opt/sca/data/conversion/spaceranger-v1.3.1/execute',
    allow_additional_args: true,
  },
  {
    name: 'spaceranger-v1.1.0',
    executable_path: '/opt/sca/data/conversion/spaceranger-v1.1.0/spaceranger-v1.1.0.sh',
    executable_directory: '/opt/sca/data/conversion/spaceranger-v1.1.0/execute',
    allow_additional_args: true,
  },
];

module.exports = {
  cmdLinePrograms,
};
