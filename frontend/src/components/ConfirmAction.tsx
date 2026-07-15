"use client";

import { useEffect, useState } from "react";

interface Props {
  label: string;
  confirmLabel?: string;
  className: string;
  confirmClassName?: string;
  disabled?: boolean;
  onConfirm: () => void;
}

// A button that swaps to an in-place Confirm/Cancel pair instead of using the
// browser's native confirm() dialog. Auto-disarms after a few seconds.
export default function ConfirmAction({
  label,
  confirmLabel = "Confirm?",
  className,
  confirmClassName,
  disabled,
  onConfirm,
}: Props) {
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const timer = setTimeout(() => setArming(false), 5000);
    return () => clearTimeout(timer);
  }, [arming]);

  if (!arming) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setArming(true);
        }}
        disabled={disabled}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setArming(false);
          onConfirm();
        }}
        className={confirmClassName || className}
      >
        {confirmLabel}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setArming(false);
        }}
        className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs"
      >
        Cancel
      </button>
    </span>
  );
}
