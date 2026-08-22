import { useEffect, useRef } from "react";

export function usePolling(fn, ms = 15000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms]);
}
