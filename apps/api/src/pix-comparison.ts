import type { IncomingMessage } from 'node:http';
import type { PixSpikeSettings } from './pix-spike.js';
import type { PixWebhookHandler } from './pix-webhook-spike.js';

interface ComparisonStep {
 name: 'orders_minimal_fresh' | 'orders_automatic_fresh' | 'payments_app_usr_fresh';
 resourceId: () => string | null;
 session: { connect(settings: PixSpikeSettings): void; wait(): Promise<void>; close(): Promise<void>; webhook: PixWebhookHandler;
  snapshot(): { phase: string; failure: string | null } };
}
// Deliberate separate sandbox cases, never a retry with a mutated body/key.
export function createPixComparison(steps: ComparisonStep[], save: (value: object) => Promise<void>) {
 if (steps.map(x => x.name).join(',') !== 'orders_minimal_fresh,orders_automatic_fresh,payments_app_usr_fresh') throw new Error('PIX_COMPARISON_PLAN');
 let connected = false; let closed = false; let task = Promise.resolve();
 const outcomes: { scenario: string; phase: string; failure: string | null }[] = [];
 const persist = () => save({ version: 1, purpose: 'fresh-oauth-diagnostic-comparison', outcomes: [...outcomes], closed });
 return {
  connect(input: PixSpikeSettings) {
   if (connected || closed || !input.accessToken.startsWith('APP_USR-')) throw new Error('PIX_COMPARISON_SESSION');
   connected = true;
   const settings = { ...input };
   task = (async () => {
    try {
     for (const step of steps) {
      if (closed) break;
      step.session.connect(settings); await step.session.wait();
      const result = step.session.snapshot();
      outcomes.push({ scenario: step.name, phase: result.phase, failure: result.failure });
      await persist();
      // Only deterministic rejection without an obtained resource permits the next case.
      // Unknown network/5xx/persistence/resource-validation results stop the comparison.
      if (step.resourceId() || !/^PROVIDER_HTTP_(400|401|403|422)$/.test(result.failure ?? '')) break;
     }
    } finally { settings.accessToken = ''; }
   })();
   void task.catch(() => {});
  },
  wait: () => task,
  webhook(req: IncomingMessage) {
   if (closed) return Promise.resolve({ status: 503, body: { result: 'COMPARISON_CLOSED' } });
   const id = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('data.id');
   const step = id ? steps.find(s => s.resourceId() === id) : undefined;
   return step ? step.session.webhook(req) : Promise.resolve({ status: 503, body: { result: 'COMPARISON_RESOURCE_NOT_READY' } });
  },
  async close() {
   if (closed) return;
   closed = true; await Promise.all(steps.map(s => s.session.close()));
   await task.catch(() => {}); await persist();
  },
 };
}
