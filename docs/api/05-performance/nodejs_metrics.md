# Node.js Metrics Documentation

This document provides an overview of the performance metrics collected by the application.

## `nodejs_gc_duration_seconds`
**Type**: Histogram  
**Source**: Derived from `perf_hooks.PerformanceObserver` ([Node.js Documentation](https://nodejs.org/api/perf_hooks.html#garbage-collection-gc-details))  

**Description**:  
Measures the duration of garbage collection (GC) events, categorized by type: `major`, `minor`, `incremental`, or `weakcb`.

---

## `nodejs_active_resources`
**Type**: Gauge  
**Source**: Derived from `process.getActiveResourcesInfo()`  

**Description**:  
Tracks the number of active resources currently keeping the event loop alive.  
- `nodejs_active_resources`: Count of unique active resources.  
- `nodejs_active_resources_total`: Total count of all active resources.

**Usage**:  
- Monitor the number of active resources to identify potential event loop bottlenecks.  
- Set thresholds to alert when the number of active resources exceeds a defined limit.

---

### Deprecated Metrics: `nodejs_active_requests` and `nodejs_active_handles`
**Status**: Deprecated in Node.js v23 ([Deprecation Notice](https://nodejs.org/api/deprecations.html#DEP0161))  
**Replacement**: Use `nodejs_active_resources` and `nodejs_active_resources_total`.

---

## `process_start_time_seconds`
**Type**: Gauge  
**Source**: Derived from `process.uptime()`  

**Description**:  
Tracks the number of seconds since the Node.js process started.

---

## `process_open_fds`
**Type**: Gauge  
**Source**: Derived from `fs.readdirSync('/proc/self/fd').length - 1`  

**Description**:  
Monitors the number of open file descriptors used by the Node.js process.

**Usage**:  
- Identify potential file descriptor leaks or excessive file usage.  
- Compare with `process_max_fds` to ensure the process is not nearing the OS limit.

**Caveats**:  
- `readdirSync` is a synchronous operation and may block the event loop if there are many file descriptors.  
- `/proc/self/fd` is in-memory (procfs), so it is faster than disk I/O but still incurs system call overhead.

---

## `process_max_fds`
**Type**: Gauge  
**Source**: Derived from `/proc/self/limits`  

**Description**:  
Represents the maximum number of file descriptors the process can open, as configured by the OS.

**Usage**:  
- Compare `process_open_fds` with `process_max_fds` to detect if the process is nearing the limit.  
- Helps identify potential file descriptor management issues.

---

## `process_cpu_seconds_total`
**Type**: Counter  
**Source**: Derived from `@opentelemetry/api`  

**Description**:  
Tracks the total CPU time (user + system) consumed by the process.  
**TODO**: Add implementation details.

---

## `osMemoryHeapLinux`
**Type**: Gauge  
**Source**: Derived from `/proc/self/status`  

**Metrics**:  
- `process_resident_memory_bytes` (VmRSS): Physical memory in use. (real footprint in RAM).
- `process_virtual_memory_bytes` (VmSize): Total virtual memory allocated (includes swapped-out and unused portions).  
- `nodejs_heap_size_total_bytes` (VmData): Heap memory size.

**Usage**:  
- Monitor memory usage to detect potential memory leaks or excessive memory consumption.

---

## `heapSpacesSizeAndUsed`
**Type**: Gauge  
**Source**: Derived from `v8.getHeapSpaceStatistics()`  

**Metrics**:  
- `nodejs_heap_space_size_total_bytes`: Total size of each heap space.  
- `nodejs_heap_space_size_used_bytes`: Used size of each heap space.  
- `nodejs_heap_space_size_available_bytes`: Available size in each heap space.

**Heap Spaces**:  
- `new_space`: The new space is where new objects are allocated. It is a semi-space garbage collector.
- `old_space`: The old space is where long-lived objects are allocated. It is a mark-sweep garbage collector.
- `code_space`: The code space is where compiled code is stored.
- `map_space`: The map space is where object property maps are stored.
- `large_object_space`: The large object space is where large objects are allocated.


**Usage**:  
- Monitor memory usage per heap space to identify memory bottlenecks or leaks.  
- Focus on `new_space` for early detection of memory issues.

---

## `heapSizeAndUsed`
**Type**: Gauge  
**Source**: Derived from `process.memoryUsage()`  

**Metrics**:  
- `nodejs_heap_size_total_bytes`: The total heap size allocated for the Node.js (V8) process.
- `nodejs_heap_size_used_bytes`: The amount of heap memory used by the Node.js (V8) process.
- `nodejs_external_memory_bytes`: refers to the memory usage of C++ objects bound to JavaScript objects managed by V8.


**Usage**:  
- Monitor overall heap usage to detect memory leaks or excessive memory consumption.  
- Compare with `heapSpacesSizeAndUsed` for detailed heap space analysis.

**Caveats**:  
- `process.memoryUsage()` iterates over memory pages, which may block the event loop for large heaps.

---

Here's a refined and professional version of your documentation:  

---

## `eventLoopLag`  

**Type:** Gauge  

#### Metrics  
- `nodejs_eventloop_lag_seconds`  
- `nodejs_eventloop_lag_min_seconds`  
- `nodejs_eventloop_lag_max_seconds`  
- `nodejs_eventloop_lag_mean_seconds`  
- `nodejs_eventloop_lag_stddev_seconds`  
- `nodejs_eventloop_lag_p50_seconds`  
- `nodejs_eventloop_lag_p90_seconds`  
- `nodejs_eventloop_lag_p95_seconds`  

#### Description  
`eventLoopLag` measures the delay between scheduling a timer (`setImmediate`) and its corresponding callback execution. This provides insight into how long the event loop is blocked by other operations, serving as an indicator of potential performance bottlenecks in a Node.js application.  

#### Computation of `nodejs_eventloop_lag_seconds`  
The `nodejs_eventloop_lag_seconds` metric is computed as follows [(reference)](https://github.com/siimon/prom-client/issues/561):  
1. A `Gauge` is created in `eventLoopLag.js` with a custom `collect` method.  
2. When metrics are requested, the `collect` method is invoked, capturing a high-resolution timestamp. This occurs at the start of the metrics collection process.  
3. The method then schedules another measurement using `setImmediate`. Since this executes in the next event loop iteration, it occurs after metrics collection and reporting have completed.  
4. As the `collect` method does not return a promise, the computed value is only recorded in the subsequent metrics collection cycle.  

This means the metric measures the delay from the start of metrics collection until the next event loop iteration. However, it is not updated in real time and only reflects values from the previous collection cycle.  

#### Computation of Other Metrics  
Other event loop lag metrics (e.g., min, max, mean, percentiles) are derived from `perf_hooks.monitorEventLoopDelay()`.  
- The minimum measurable delay depends on the timer resolution, which defaults to **10ms** but can be adjusted using the `eventLoopMonitoringPrecision` configuration option.  

#### Use Cases  
- **Performance Monitoring**: Helps detect high event loop lag, which may indicate that the application is being blocked by long-running operations.  
- **Bottleneck Identification**: A consistently high event loop lag suggests potential issues such as synchronous operations blocking the event loop.  

#### Limitations  
- **Delayed Updates**:  
  - `nodejs_eventloop_lag_seconds` is only updated during metrics collection. The reported value reflects the lag from the previous cycle, not the current one.  
  - In high-throughput applications (e.g., Express-based servers), event loop lag typically increases in short bursts (e.g., during sudden spikes in requests). If metrics are collected every **30 seconds**, the reported value may not accurately represent real-time lag.  
- **Resolution Constraints**:  
  - Metrics derived from `perf_hooks.monitorEventLoopDelay()` have a **10ms resolution** by default. While this provides continuous monitoring, it may not capture sub-millisecond variations in event loop lag.  



