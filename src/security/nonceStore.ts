export class NonceStore {
  private readonly ttlMs: number;
  private readonly values = new Map<string, number>();

  constructor(ttlSec: number) {
    this.ttlMs = ttlSec * 1000;
  }

  has(nonce: string): boolean {
    this.pruneExpired();
    return this.values.has(nonce);
  }

  add(nonce: string): void {
    this.pruneExpired();
    this.values.set(nonce, Date.now() + this.ttlMs);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.values.entries()) {
      if (expiresAt <= now) {
        this.values.delete(nonce);
      }
    }
  }
}
