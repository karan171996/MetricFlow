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
      // Off: it adds newrelic/traceparent headers to the site's own requests, and the dashboard reads no traces.
      // AJAX events are recorded either way; only their trace and span IDs go.
      distributed_tracing: { enabled: false },
      session_replay: { enabled: false }, // also absent from the bundle; stated for the day the feature list changes
      privacy: { cookies_enabled: false },
      // GenericEvents is here for recordCustomEvent only. Its two automatic sources are on by default
      // and the dashboard reads neither, so both are turned off:
      user_actions: { enabled: false }, // clicks, key presses, copy/paste, focus, with the target's selector, id and class
      feature_flags: ['no_spv'], // Content-Security-Policy violation events (blocked and document URLs)
      // Must stay on: with every source off the agent never loads the code behind recordCustomEvent.
      // On its own it collects nothing; it only enables the addPageAction call.
      page_action: { enabled: true },
    },
    info: { beacon, errorBeacon: beacon, licenseKey: browserKey, applicationID: applicationId, sa: 1 },
    loader_config: { accountID: accountId, trustKey: accountId, agentID: applicationId, licenseKey: browserKey, applicationID: applicationId },
  });
}
