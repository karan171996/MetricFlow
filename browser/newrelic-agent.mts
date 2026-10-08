// The only file that names @newrelic/browser-agent. newrelic.mts loads it lazily, after its own checks.
// The agent is composed from only the features the dashboard reads, instead of the full BrowserAgent:
// session replay, session trace, logging and soft navigation are never bundled.
// Static imports on purpose: one lazy chunk group. Six separate dynamic imports made the consumer's
// bundler repeat shared code and download more than the full agent.
import { Agent } from '@newrelic/browser-agent/loaders/agent';
import { Ajax } from '@newrelic/browser-agent/features/ajax';
import { GenericEvents } from '@newrelic/browser-agent/features/generic_events'; // recordCustomEvent
import { JSErrors } from '@newrelic/browser-agent/features/jserrors';
import { PageViewEvent } from '@newrelic/browser-agent/features/page_view_event';
import { PageViewTiming } from '@newrelic/browser-agent/features/page_view_timing'; // web vitals

export interface Started { recordCustomEvent(type: string, attributes: Record<string, unknown>): unknown }

export function start(browserKey: string, applicationId: string, accountId: string, beacon: string): Started {
  return new Agent({
    features: [Ajax, GenericEvents, JSErrors, PageViewEvent, PageViewTiming],
    init: {
      distributed_tracing: { enabled: true },
      session_replay: { enabled: false }, // also absent from the bundle; stated for the day the feature list changes
      privacy: { cookies_enabled: false },
    },
    info: { beacon, errorBeacon: beacon, licenseKey: browserKey, applicationID: applicationId, sa: 1 },
    loader_config: { accountID: accountId, trustKey: accountId, agentID: applicationId, licenseKey: browserKey, applicationID: applicationId },
  });
}
