import React from "react";

type IconName =
  | "house"
  | "list"
  | "calendar"
  | "more"
  | "plus"
  | "chevron-down"
  | "eye"
  | "eye-off"
  | "wallet"
  | "credit-card"
  | "arrow-up"
  | "arrow-down"
  | "arrow-left"
  | "arrow-right"
  | "transfer";

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
};

export function AppIcon({ name, size = 20, color = "currentColor", stroke = 1.8 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "house":
      return (
        <svg {...common}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "more":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...common}>
          <path d="M3 6l18 12" />
          <path d="M4.5 7.5C3 9.2 2 12 2 12s4 6 10 6c2.2 0 4.1-.7 5.7-1.6" />
          <path d="M9.5 9.5a3.5 3.5 0 004.9 4.9" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 7h14a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
          <path d="M4 7V6a2 2 0 012-2h10" />
          <path d="M16 12h4" />
        </svg>
      );
    case "credit-card":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18M7 15h4" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12l7 7 7-7" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="M12 5l7 7-7 7" />
        </svg>
      );
    case "transfer":
      return (
        <svg {...common}>
          <path d="M7 7h13M14 4l3 3-3 3" />
          <path d="M17 17H4M10 20l-3-3 3-3" />
        </svg>
      );
    default:
      return null;
  }
}
