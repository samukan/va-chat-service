const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2000, 5000];
export class InMemoryMetrics {
    requestCount = 0;
    requestByRoute = new Map();
    latencyBuckets = new Map();
    latencyOverflow = 0;
    constructor() {
        for (const bucket of BUCKETS) {
            this.latencyBuckets.set(bucket, 0);
        }
    }
    record(input) {
        this.requestCount += 1;
        const routeKey = `${input.method} ${input.route} ${input.statusCode}`;
        this.requestByRoute.set(routeKey, (this.requestByRoute.get(routeKey) ?? 0) + 1);
        const bucket = BUCKETS.find((b) => input.durationMs <= b);
        if (bucket !== undefined) {
            this.latencyBuckets.set(bucket, (this.latencyBuckets.get(bucket) ?? 0) + 1);
            return;
        }
        this.latencyOverflow += 1;
    }
    snapshot() {
        return {
            requests_total: this.requestCount,
            requests_by_route: Object.fromEntries(this.requestByRoute.entries()),
            latency_ms_histogram: {
                buckets: Object.fromEntries(Array.from(this.latencyBuckets.entries()).map(([k, v]) => [`le_${k}`, v])),
                gt_5000: this.latencyOverflow
            }
        };
    }
}
