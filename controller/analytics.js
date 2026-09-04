import { ControllerAnalytics } from './analytics-service.js';

// PostHog project tokens are public ingestion identifiers, not account secrets.
const projectToken = 'phc_AiB3VZMCS3jcgL4ZHuMXUpeHjnGw7PNwa65u9JS67yd8';
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const test = local && new URLSearchParams(location.search).get('analytics_test') === '1';
const enabled = location.protocol.startsWith('http') && (!local || test);
const pending = [];
let client;

export const analytics = new ControllerAnalytics((event, properties) => {
  if (!enabled) return;
  if (client) client.capture(event, properties);
  else if (pending.length < 100) pending.push([event, properties]);
});

if (enabled) {
  const script = document.createElement('script');
  script.src = 'https://us-assets.i.posthog.com/static/array.js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.addEventListener('load', () => {
    try {
      window.posthog.init(projectToken, {
        api_host: 'https://us.i.posthog.com',
        ui_host: 'https://us.posthog.com',
        defaults: '2026-05-30',
        debug: test,
        cookieless_mode: 'always',
        person_profiles: 'never',
        internal_or_test_user_hostname: null,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        enable_heatmaps: false,
        capture_dead_clicks: false,
        capture_performance: false,
        disable_surveys: true,
        respect_dnt: true,
        loaded(posthog) {
          client = posthog;
          client.register({ app: 'dualsense-controller', environment: test ? 'development' : 'production' });
          client.capture('$pageview');
          for (const [event, properties] of pending.splice(0)) client.capture(event, properties);
        },
      });
    } catch (error) { pending.length = 0; if (test) console.warn('Analytics setup failed:', error); }
  });
  script.addEventListener('error', () => { pending.length = 0; });
  document.head.append(script);
  const timer = setInterval(() => analytics.flush(), 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) analytics.pause(); });
  window.addEventListener('blur', () => analytics.pause());
  window.addEventListener('pagehide', () => { analytics.pause(); clearInterval(timer); });
}
