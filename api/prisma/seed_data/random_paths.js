/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
// cspell:ignore Mersenne
const { Random, MersenneTwister19937 } = require('random-js');
// eslint-disable-next-line lodash-fp/use-fp
const _ = require('lodash');

function convertEpochToDateString(epoch) {
  const date = new Date(epoch * 1000); // Convert seconds to milliseconds
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Month starts from 0
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function random_filename(rng) {
  const names = ['document', 'image', 'report', 'backup', 'project', 'screenshot',
    'data_analysis', 'readme', 'video', 'presentation'];
  const extensions = ['txt', 'jpg', 'png', 'docx', 'zip', 'pdf', 'xlsx', 'mov',
    'pptx', 'bak', 'tar.gz', 'tar', 'fastq', 'fastq.gz', 'bam', 'vcf'];

  return () => {
    const random_date = convertEpochToDateString(rng.integer(993082044, 1687306012));
    const random_integer = rng.integer(0, 1000);
    const format_flag = rng.integer(0, 1);
    const random_name = rng.pick(names);
    const random_extension = rng.pick(extensions);
    if (format_flag === 0) {
      return `${random_date}_${random_name}.${random_extension}`;
    }
    if (format_flag === 1) {
      return `${random_name}${random_integer}.${random_extension}`;
    }
  };
}

function random_path(rng, depth) {
  return () => {
    // flags = [true, false, false, ...]
    const depth_flags = _.concat([true], _.range(depth - 1).map(() => rng.bool(0.75)));

    // folders = ['dir1', 'dir8', ...]
    const folders = _.range(depth).map(() => `dir${rng.integer(1, 9)}`);

    return _.takeWhile(_.zip(depth_flags, folders), _.head)
      .map((obj) => obj[1])
      .join('/');
  };
}

function random_size(rng) {
  return () => {
    // exponential transform of a uniform random variable
    const exp = rng.real(0, 40);
    return Math.floor(2 ** exp);
  };
}

function generate_paths(rng, num_paths, max_files, max_depth) {
  const _random_path = random_path(rng, max_depth);
  const _random_filename = random_filename(rng);

  return _.flatten(
    _.range(num_paths).map(_random_path).map((dir_path) => {
      const num_files = rng.integer(1, max_files);
      return _.range(num_files).map(_random_filename).map((name) => `${dir_path}/${name}`);
    }),
  );
}

function random_files(expected_num_files, max_depth = 5, seed = 0) {
  // E[num_files] = num_paths * E[max_files] = num_paths * max_files/2
  const num_paths = Math.floor(Math.sqrt(expected_num_files));
  const max_files = 2 * num_paths;
  const rng = new Random(MersenneTwister19937.seed(seed));
  const _random_size = random_size(rng);
  const paths = generate_paths(rng, num_paths, max_files, max_depth);

  const files = paths.map((path) => ({
    path,
    md5: rng.hex(32),
    size: _random_size(),
    filetype: rng.bool(0.999) ? 'file' : 'symbolic_link',
  }));

  return files;
}

module.exports = {
  random_files,
};

// const files = random_files(10000, 5, 0);
// console.log(files, files.length);
