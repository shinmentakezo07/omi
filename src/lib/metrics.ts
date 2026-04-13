import { Counter, Gauge, Histogram, Registry } from "prom-client";

const globalRegistry = globalThis as typeof globalThis & {
  __omnirouteMetricsRegistry?: Registry;
  __omnirouteRequestCounter?: Counter<string>;
  __omnirouteRequestDuration?: Histogram<string>;
  __omnirouteTelemetryPhaseDuration?: Histogram<string>;
  __omnirouteCircuitBreakerState?: Gauge<string>;
};

export const metricsRegistry = globalRegistry.__omnirouteMetricsRegistry || new Registry();
globalRegistry.__omnirouteMetricsRegistry = metricsRegistry;

export const requestCounter =
  globalRegistry.__omnirouteRequestCounter ||
  new Counter({
    name: "omniroute_requests_total",
    help: "Total OmniRoute requests recorded by telemetry",
    labelNames: ["phase"],
    registers: [metricsRegistry],
  });

globalRegistry.__omnirouteRequestCounter = requestCounter;

export const requestDurationHistogram =
  globalRegistry.__omnirouteRequestDuration ||
  new Histogram({
    name: "omniroute_request_duration_ms",
    help: "Overall OmniRoute request duration in milliseconds",
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000],
    registers: [metricsRegistry],
  });

globalRegistry.__omnirouteRequestDuration = requestDurationHistogram;

export const telemetryPhaseHistogram =
  globalRegistry.__omnirouteTelemetryPhaseDuration ||
  new Histogram({
    name: "omniroute_request_phase_duration_ms",
    help: "Phase-level OmniRoute request duration in milliseconds",
    labelNames: ["phase"],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000],
    registers: [metricsRegistry],
  });

globalRegistry.__omnirouteTelemetryPhaseDuration = telemetryPhaseHistogram;

export const circuitBreakerStateGauge =
  globalRegistry.__omnirouteCircuitBreakerState ||
  new Gauge({
    name: "omniroute_circuit_breaker_state",
    help: "Circuit breaker state by provider (OPEN=1, HALF_OPEN=0.5, CLOSED=0)",
    labelNames: ["name"],
    registers: [metricsRegistry],
  });

globalRegistry.__omnirouteCircuitBreakerState = circuitBreakerStateGauge;
