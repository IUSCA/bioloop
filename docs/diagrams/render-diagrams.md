# Diagram rendering

## Graphviz

```
sudo apt update
sudo apt install -y graphviz
```

```
cd docs/diagrams/
dot -Tsvg bioloop_architecture.dot -o bioloop_architecture.svg
dot -Tsvg dataflow_pipeline.dot -o dataflow_pipeline.svg

```
