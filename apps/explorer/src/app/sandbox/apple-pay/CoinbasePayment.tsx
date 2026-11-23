"use client";

import { useEffect, useRef, useState } from "react";
import { isRecord } from "@/app/api/coinbase/quote/quote";
import { coinbaseOrigin } from "./session";

export default function CoinbasePayment({
  paymentUrl,
  processing,
  onApproved,
  onComplete,
}: {
  paymentUrl: string;
  processing: boolean;
  onApproved: () => void;
  onComplete: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("Opening Coinbase’s test payment sheet…");
  const [error, setError] = useState("");
  useEffect(() => {
    function receive(event: MessageEvent<unknown>) {
      if (!frame.current || event.source !== frame.current.contentWindow || event.origin !== coinbaseOrigin) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!isRecord(payload)) return;
      switch (payload.eventName) {
        case "onramp_api.load_success":
          setMessage("Choose Apple Pay inside the simulator to approve the test.");
          break;
        case "onramp_api.commit_success":
        case "onramp_api.polling_start":
          setError("");
          onApproved();
          break;
        case "onramp_api.polling_success":
          onComplete();
          break;
        case "onramp_api.cancel":
          setMessage("Payment canceled. You can reopen Apple Pay on the same order.");
          break;
        case "onramp_api.load_error":
          if (isRecord(payload.data) && payload.data.errorCode === "ERROR_CODE_GUEST_APPLE_PAY_NOT_SUPPORTED") {
            setMessage("If Coinbase displays a QR code, continue on your phone.");
            break;
          }
          setError("Coinbase couldn’t load this test payment sheet.");
          break;
        case "onramp_api.validate_merchant_error":
          setError("Coinbase couldn’t verify the Apple Pay merchant for this test.");
          break;
        case "onramp_api.commit_error":
          setError("Coinbase couldn’t start this sandbox payment.");
          break;
        case "onramp_api.polling_error":
        case "onramp_api.session_error":
          setError("Coinbase couldn’t confirm this sandbox payment. Keep the order ID for reference.");
          break;
      }
    }
    window.addEventListener("message", receive);
    setListening(true);
    return () => window.removeEventListener("message", receive);
  }, [onApproved, onComplete]);

  return (
    <section className='grid gap-3' aria-label='Test payment'>
      <p role='status' className='text-sm leading-5'>
        {processing ? "Payment approved. Waiting for Coinbase to confirm the sandbox order…" : message}
      </p>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {listening && (
        <iframe
          ref={frame}
          allow='payment'
          className='h-[min(29rem,72dvh)] w-full rounded-xl border bg-white'
          referrerPolicy='no-referrer'
          sandbox='allow-scripts allow-same-origin'
          src={paymentUrl}
          title='Coinbase sandbox Apple Pay'
        />
      )}
    </section>
  );
}
