import { useEffect, useMemo, useState } from "react";

import {
  formatEventDateTime,
  shouldShowLocalEventTime,
  SOLARIS_TIME_ZONE,
} from "@/lib/public-time";
import { cn } from "@/lib/utils";

export function EventTime({
  value,
  label,
  timeZone = SOLARIS_TIME_ZONE,
  className,
  showLocalTime = true,
}: {
  value: string;
  label?: string;
  timeZone?: string;
  className?: string;
  showLocalTime?: boolean;
}) {
  const [localTimeZone, setLocalTimeZone] = useState<string | null>(null);

  useEffect(() => {
    setLocalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);

  const canonical = useMemo(
    () => formatEventDateTime(value, { timeZone }),
    [timeZone, value],
  );

  const local =
    showLocalTime &&
    localTimeZone &&
    shouldShowLocalEventTime(value, timeZone, localTimeZone)
      ? formatEventDateTime(value, { timeZone: localTimeZone })
      : null;

  return (
    <span className={cn("block min-w-0", className)}>
      {label ? (
        <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      ) : null}
      <time dateTime={value} className="block text-sm font-semibold">
        {canonical}
      </time>
      {local ? (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {local} your time
        </span>
      ) : null}
    </span>
  );
}
