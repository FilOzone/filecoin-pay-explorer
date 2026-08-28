"use client";

import { Card } from "@filecoin-pay/ui/components/card";
import { useEffect, useState } from "react";
import { PocChip } from "@/components/UserConsole/PocChip";

/**
 * POC-only alert categories, from the service-pages epic: dataset-level alerts
 * ride the existing one-email-per-wallet subscription instead of a second
 * sign-up. Preferences persist to localStorage per wallet; the real version
 * stores them in the notification service and the alert scheduler reads them.
 */

type AlertPreferences = {
  runwayLow: boolean;
  datasetInactive: boolean;
  inactiveAfterDays: number;
  provingUnhealthy: boolean;
  datasetExpiring: boolean;
  monthlyDigest: boolean;
};

const DEFAULT_PREFERENCES: AlertPreferences = {
  runwayLow: true,
  datasetInactive: true,
  inactiveAfterDays: 90,
  provingUnhealthy: true,
  datasetExpiring: true,
  monthlyDigest: false,
};

const storageKey = (wallet: string) => `poc-alert-preferences:${wallet.toLowerCase()}`;

const readPreferences = (wallet: string): AlertPreferences => {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    return raw ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<AlertPreferences>) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const writePreferences = (wallet: string, prefs: AlertPreferences): void => {
  try {
    localStorage.setItem(storageKey(wallet), JSON.stringify(prefs));
  } catch {}
};

const PreferenceRow = ({
  title,
  description,
  checked,
  onChange,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) => (
  <li className='flex items-start justify-between gap-4 py-3'>
    <label className='flex cursor-pointer items-start gap-3'>
      <input
        type='checkbox'
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className='mt-1 size-4 accent-primary'
      />
      <span className='flex flex-col'>
        <span className='font-medium'>{title}</span>
        <span className='text-sm text-muted-foreground'>{description}</span>
      </span>
    </label>
    {children}
  </li>
);

const INACTIVITY_OPTIONS = [30, 60, 90, 180];

export const AlertPreferencesCard = ({ wallet }: { wallet: string }) => {
  const [prefs, setPrefs] = useState<AlertPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(readPreferences(wallet));
  }, [wallet]);

  const update = (patch: Partial<AlertPreferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      writePreferences(wallet, next);
      return next;
    });
  };

  return (
    <Card className='mt-4 flex flex-col gap-2 p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-medium'>Alert preferences</h3>
        <PocChip label='mock — saved in this browser only, no backend' />
      </div>
      <p className='text-sm text-muted-foreground'>All alerts go to your verified email.</p>
      <ul className='flex flex-col divide-y'>
        <PreferenceRow
          title='Account runway low'
          description='Your balance covers less than 30 days of service.'
          checked={prefs.runwayLow}
          onChange={(runwayLow) => update({ runwayLow })}
        />
        <PreferenceRow
          title='Dataset inactive'
          description='A dataset has had no writes (or retrievals, where FilBeam serves it) for the period below.'
          checked={prefs.datasetInactive}
          onChange={(datasetInactive) => update({ datasetInactive })}
        >
          <select
            aria-label='Days without activity before a dataset counts as inactive'
            value={prefs.inactiveAfterDays}
            onChange={(e) => update({ inactiveAfterDays: Number(e.target.value) })}
            disabled={!prefs.datasetInactive}
            className='rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-50'
          >
            {INACTIVITY_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </PreferenceRow>
        <PreferenceRow
          title='Proving degraded or faulted'
          description='Providers are missing or failing possession proofs for one of your datasets.'
          checked={prefs.provingUnhealthy}
          onChange={(provingUnhealthy) => update({ provingUnhealthy })}
        />
        <PreferenceRow
          title='Dataset expiry approaching'
          description='A dataset is within 30 days of its funded-until date.'
          checked={prefs.datasetExpiring}
          onChange={(datasetExpiring) => update({ datasetExpiring })}
        />
        <PreferenceRow
          title='Monthly digest'
          description='One monthly email: spend, churn events, and datasets at risk.'
          checked={prefs.monthlyDigest}
          onChange={(monthlyDigest) => update({ monthlyDigest })}
        />
      </ul>
    </Card>
  );
};
