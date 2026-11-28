const path = require('node:path');
const { setUnion } = require('../utils');

class FileGraph {
  add_edges(p) {
    const parent_path = path.parse(p).dir;
    if (Object.hasOwn(this.graph, parent_path)) {
      this.graph[parent_path].add(p);
    } else {
      this.graph[parent_path] = new Set([p]);
      this.add_edges(parent_path);
    }
  }

  constructor(filepaths) {
  // const _filepaths = filepaths.map((p) => `/${p}`);
    this.graph = { '': new Set() };

    filepaths.forEach((p) => {
      this.add_edges(p);
    });
  }

  nodes() {
    return Object.values(this.graph).reduce((acc, curr) => setUnion(acc, curr), new Set());
  }

  non_leaf_nodes() {
    return Object.keys(this.graph);
  }

  edges() {
    return Object.entries(this.graph)
      .flatMap(([src, destinations]) => [...destinations].map((dst) => ([src, dst])));
  }
}

module.exports = FileGraph;
