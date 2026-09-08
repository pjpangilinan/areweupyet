import React from 'react';

export const TermsOfService: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="max-w-4xl mx-auto p-6 space-y-6 text-[#e4e1e6]">
    <button
      onClick={onBack}
      className="text-sm font-mono text-secondary hover:underline"
    >
      ← Back to Dashboard
    </button>
    <h1 className="font-display font-semibold text-2xl text-[#e4e1e6]">Terms of Service</h1>
    <p className="text-sm text-[#c7c4d7]">Last updated: September 2026</p>

    <section className="space-y-3 text-sm text-[#c7c4d7]">
      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">1. Acceptance of Terms</h2>
      <p>By registering or using AreWeUpYet, you agree to these Terms. If you do not agree, do not use the service.</p>

      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">2. Permitted Use & Fair Use Policy</h2>
      <p>
        AreWeUpYet provides automated uptime telemetry and incident notifications. You may only monitor endpoints
        that you own or are authorized to monitor. Each tenant account is limited to a maximum of 20 endpoints
        with a minimum polling frequency of 5 minutes.
      </p>

      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">3. Prohibited Conduct</h2>
      <p>
        You agree not to use AreWeUpYet for denial-of-service attacks, port scanning, monitoring private internal IP addresses
        (RFC 1918, link-local, or cloud metadata ranges), or any unlawful activity.
      </p>

      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">4. Disclaimer of Warranties</h2>
      <p>
        The service is provided &quot;as is&quot; without warranty of any kind. While we strive for 100% telemetry availability,
        we do not guarantee uninterrupted or error-free monitoring.
      </p>
    </section>
  </div>
);

export const PrivacyPolicy: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="max-w-4xl mx-auto p-6 space-y-6 text-[#e4e1e6]">
    <button
      onClick={onBack}
      className="text-sm font-mono text-secondary hover:underline"
    >
      ← Back to Dashboard
    </button>
    <h1 className="font-display font-semibold text-2xl text-[#e4e1e6]">Privacy Policy</h1>
    <p className="text-sm text-[#c7c4d7]">Last updated: September 2026</p>

    <section className="space-y-3 text-sm text-[#c7c4d7]">
      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">1. Information We Collect</h2>
      <p>
        We collect your email address when creating an account via AWS Cognito. We also store endpoint URLs,
        ping telemetry results (response latency, status codes), and downtime incident histories.
      </p>

      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">2. Data Retention & Cleanup</h2>
      <p>
        Raw ping results are automatically deleted after 90 days via DynamoDB Time-To-Live (TTL).
        Aggregated incident timeline history is retained for tenant reporting.
      </p>

      <h2 className="font-display font-medium text-lg text-[#e4e1e6]">3. Account & Data Deletion</h2>
      <p>
        When you delete an endpoint or close your account, all associated ping records and incidents
        are permanently deleted via cascade delete.
      </p>
    </section>
  </div>
);
