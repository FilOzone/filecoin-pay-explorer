"use client";

import { Button } from "@filecoin-foundation/ui-filecoin/Button";
import { driver } from "driver.js";
import { CircleHelp } from "lucide-react";
import { useEffect } from "react";
import "driver.js/dist/driver.css";

const TOUR_SEEN_KEY = "warm-storage-poc-tour-seen";

/**
 * Guided walkthrough of the POC so a shared link explains itself. Steps anchor
 * to [data-tour] attributes; a step whose element is missing (e.g. the stale
 * queue after every dataset is kept or released) is skipped by driver.js.
 */
const buildTour = () =>
  driver({
    showProgress: true,
    overlayOpacity: 0.6,
    steps: [
      {
        element: "[data-tour='page-title']",
        popover: {
          title: "Warm Storage service page",
          description:
            "A per-service management page: every dataset this wallet stores on Warm Storage, what each one costs, whether it is healthy, and which ones you are paying for without using. Everything here is mock data.",
        },
      },
      {
        element: "[data-tour='metrics']",
        popover: {
          title: "The service at a glance",
          description:
            "Total spend, spend going to inactive datasets, locked deposits, and the next expiry. 'Locked' is a refundable buffer, not a charge: releasing a dataset returns its lockup. 'Inactive spend' is the money currently paying for data nobody touches.",
        },
      },
      {
        element: "[data-tour='stale-queue']",
        popover: {
          title: "Inactive datasets: the triage queue",
          description:
            "The inbox an inactivity email would link into. Datasets with no activity for 90+ days, ranked by money spent since. Each row names its signal honestly: retrieval recency where FilBeam serves the dataset, last write otherwise.",
        },
      },
      {
        element: "[data-tour='dispositions']",
        popover: {
          title: "Three ways to close a row",
          description:
            "Keep affirms the data is intentionally stored and mutes its inactivity alerts. Export pulls a copy out (inert in this POC). Release stops paying: it ends the dataset's payment rails and returns the locked deposit. Every row resolves with exactly one of these.",
        },
      },
      {
        element: "[data-tour='datasets-table']",
        popover: {
          title: "The full inventory",
          description:
            "All datasets, active or not: size, last write, health, funding, and monthly spend. Funded-until turns amber under 30 days of runway and red under 14.",
        },
      },
      {
        element: "[data-tour='retrieval-badge']",
        popover: {
          title: "Retrieval: only FilBeam can see it",
          description:
            "Active and Idle come from FilBeam retrieval logs. The dashed 'No signal' state means this dataset is not served through FilBeam, so retrieval activity is unknowable — the page says so instead of implying the data was never accessed.",
        },
      },
      {
        element: "[data-tour='proving-badge']",
        popover: {
          title: "Proving: is the data really there?",
          description:
            "Storage providers must submit on-chain possession proofs. Proving means proofs arrive on schedule; Degraded means some periods were missed; Faulted means providers are failing proofs and your data may be at risk.",
        },
      },
      {
        popover: {
          title: "Try it",
          description:
            "Click Keep on a queue row (it leaves the queue but stays in the table), then Release a dataset and watch the metric cards recalculate. Feedback goes to the epic doc this POC belongs to.",
        },
      },
    ],
  });

export const startWarmStorageTour = () => buildTour().drive();

/** Auto-runs the tour on first visit; mount inside the section so anchors exist. */
export const WarmStorageTourAutoStart = () => {
  useEffect(() => {
    try {
      if (localStorage.getItem(TOUR_SEEN_KEY)) return;
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      return; // storage unavailable: skip auto-start rather than loop on every load
    }
    const id = requestAnimationFrame(() => startWarmStorageTour());
    return () => cancelAnimationFrame(id);
  }, []);

  return null;
};

export const WarmStorageTourButton = () => (
  <Button variant='ghost' onClick={startWarmStorageTour} className='inline-flex items-center gap-1.5'>
    <CircleHelp className='size-4' />
    Walkthrough
  </Button>
);
