export class NonceStore {
    ttlMs;
    values = new Map();
    constructor(ttlSec) {
        this.ttlMs = ttlSec * 1000;
    }
    has(nonce) {
        this.pruneExpired();
        return this.values.has(nonce);
    }
    add(nonce) {
        this.pruneExpired();
        this.values.set(nonce, Date.now() + this.ttlMs);
    }
    pruneExpired() {
        const now = Date.now();
        for (const [nonce, expiresAt] of this.values.entries()) {
            if (expiresAt <= now) {
                this.values.delete(nonce);
            }
        }
    }
}
