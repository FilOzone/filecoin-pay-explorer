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
 * queue after every inactive dataset is terminated) is skipped by driver.js.
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
            "A per-service management page: every dataset this wallet stores on this service, what each one costs, and which ones deserve a look. The name, description, and homepage come from the service contract's onchain metadata; the datasets are mock data.",
        },
      },
      {
        element: "[data-tour='metrics']",
        popover: {
          title: "The service at a glance",
          description:
            "REAL money from your payment rails: monthly spend on this service (streaming rate across active rails, plus all-time one-time fees) and the deposit locked for its rails — returned when datasets are terminated, not spendable while locked. The runway banner above is account-level: funds are shared across services.",
        },
      },
      {
        element: "[data-tour='datasets-table']",
        popover: {
          title: "The full inventory",
          description:
            "The datasets are mock data (real rows need the FWSS subgraph): size, last write, monthly spend, and a link to the PDP Explorer for proving detail. Terminate permanently stops payment for a dataset. Below the queue, Spending limits shows the real operator approval for this service.",
        },
      },
      {
        element: "[data-tour='stale-queue']",
        popover: {
          title: "Inactive datasets: the review queue",
          description:
            "The inbox an inactivity email links into: datasets with no writes for 90+ days, longest-quiet first. Inactivity is normal for archival data — a row resolves by terminating the dataset or simply leaving it stored.",
        },
      },
      {
        element: "[data-tour='alerts-link']",
        popover: {
          title: "How you find out",
          description:
            "The queue is the landing page for an inactivity email. Alerts ride the console's existing Email Alerts subscription (one verified email per wallet); this page adds dataset-level alert categories there.",
        },
      },
      {
        popover: {
          title: "Try it",
          description:
            "Terminate a dataset and watch the metric cards recalculate — the dialog spells out that termination is not recoverable. Feedback goes to the epic doc this POC belongs to.",
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
