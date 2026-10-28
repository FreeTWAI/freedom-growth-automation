# Growth Workflow Automation Architecture & Scheduling Guide

This repository (`freedom-growth-automation`) implements the source-preserving campaign client templates and preview logic for the Marketing Guild. **Currently, there are no actual background workers, scheduling tasks, or media asset generation implemented in this codebase.**

The current architecture is composed of the following modules and their maturity levels:

## Current Worker Components

*   **`services/campaign-worker/`**:
    *   **State:** Pure function draft preparation.
    *   **Capability:** It validates and prepares a campaign draft payload locally.
    *   **Missing:** There is no queue consumer, and no jobs are claimed, saved, or published by this worker directly.

*   **`services/publication-worker/`**:
    *   **State:** Local preview generation.
    *   **Capability:** It renders a plain text or LINE message preview based on a saved campaign snapshot from Platform.
    *   **Missing:** It does not invoke actual provider SDKs. There is no sending logic or provider interaction taking place.

*   **`services/media-worker/`**:
    *   **State:** Explicitly planned, non-executable capability.
    *   **Capability:** It merely acts as a planned boundary to route future work.
    *   **Missing:** There is no executable media worker, render service, FFmpeg process, provider integration, or queue consumer.

## Future Requirements for Scheduling & Execution

In order to enable actual scheduled tasks and media generation, the following components must be built and integrated according to the canonical Platform standards:

1.  **Canonical Job API & Registry:** A versioned media job registry must be implemented using the main specification.
2.  **Job Execution Guarantees:**
    *   Exact requested job claim matching.
    *   Lease proof and fencing validation.
    *   Heartbeat mechanisms.
    *   Success/failure reporting and reconciliation.
3.  **Dedicated Queue Consumers:** Each worker type must have its own unique queue consumer.
4.  **Scoped Credential Broker:** A named broker capability must be set up so that workers do not connect directly to the Platform DB or store long-lived provider secrets.
5.  **Provider Adapters:** Real provider integrations with quota/cost limits and failure testing must be built.

No media jobs should be routed to the `media-worker` component in its current state. The existing draft API is separate from the planned, but not yet active, job protocol.
