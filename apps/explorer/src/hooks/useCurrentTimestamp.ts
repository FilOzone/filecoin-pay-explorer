import { useEffect, useState } from "react";
import { EPOCH_DURATION } from "@/utils/constants";

const nowInSeconds = () => BigInt(Math.floor(Date.now() / 1_000));

/** Unix seconds, refreshed once per Filecoin epoch. */
export const useCurrentTimestamp = (): bigint => {
  const [currentTimestamp, setCurrentTimestamp] = useState(nowInSeconds);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTimestamp(nowInSeconds()), EPOCH_DURATION * 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return currentTimestamp;
};
