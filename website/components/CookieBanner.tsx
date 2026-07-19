"use client";

import { useEffect, useState } from "react";

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.localStorage.getItem("oddsdex-cookies-ok")) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="anim-rise fixed bottom-5 left-5 z-50 flex max-w-sm items-center gap-4 rounded-2xl bg-chip/95 px-5 py-4 shadow-2xl backdrop-blur">
      <p className="text-[13px] leading-snug text-fg/90">
        By continuing to browse, you agree to our{" "}
        <a href="#" className="underline decoration-fg/40 hover:text-fg">
          Cookie Policy
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem("oddsdex-cookies-ok", "1");
          setVisible(false);
        }}
        className="shrink-0 rounded-xl bg-surface px-4 py-2 text-sm font-semibold transition-colors duration-200 hover:bg-bg"
      >
        Ok
      </button>
    </div>
  );
}
