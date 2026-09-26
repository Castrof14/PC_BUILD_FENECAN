export interface PollerOptions {
  intervalMs: number;
  run: (signal: AbortSignal) => Promise<void>;
  onError?: (error: unknown) => void;
}

export class Poller {
  private timer: NodeJS.Timeout | null = null;
  private controller: AbortController | null = null;
  private running = false;
  private stopped = true;

  constructor(private readonly options: PollerOptions) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.controller?.abort();
    this.controller = null;
  }

  async runOnce(): Promise<void> {
    await this.tick(true);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(force = false): Promise<void> {
    if (this.stopped) {
      return;
    }
    if (this.running && !force) {
      this.schedule();
      return;
    }
    if (force && this.running) {
      return;
    }
    this.running = true;
    this.controller = new AbortController();
    try {
      await this.options.run(this.controller.signal);
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
      this.controller = null;
    }
    this.schedule();
  }

  private schedule(): void {
    if (this.stopped) {
      return;
    }
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.options.intervalMs);
    this.timer.unref?.();
  }
}
