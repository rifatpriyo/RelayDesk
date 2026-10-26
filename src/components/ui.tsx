"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  X,
  Leaf,
  ChatCircle,
  InstagramLogo,
  WhatsappLogo,
  MessengerLogo,
  Globe,
  Tray,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ChannelKind } from "@/lib/core/types";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="RelayDesk home">
      <span className="brand-mark">
        <Leaf weight="duotone" />
      </span>
      RelayDesk
    </Link>
  );
}
export function ChannelIcon({
  kind,
  size = 18,
}: {
  kind: ChannelKind;
  size?: number;
}) {
  const Icon =
    {
      messenger: MessengerLogo,
      instagram: InstagramLogo,
      whatsapp: WhatsappLogo,
      website: Globe,
    }[kind] || ChatCircle;
  return <Icon size={size} />;
}
export function ChannelLabel({ kind }: { kind: ChannelKind }) {
  return (
    <span className="channel-label">
      <ChannelIcon kind={kind} />
      {kind === "website"
        ? "Website"
        : kind.charAt(0).toUpperCase() + kind.slice(1)}
    </span>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar ${["", "rose", "blue"][index % 3]}`}>
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog">
          <DialogPrimitive.Title asChild>
            <h2>{title}</h2>
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="dialog-description">
            {description || "Review the details below before saving."}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close
            className="icon-button dialog-close"
            aria-label="Close dialog"
          >
            <X size={19} />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Tray size={35} weight="duotone" />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function money(value: number, currency = "BDT") {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: value % 100 ? 2 : 0,
  }).format(value / 100);
}
export function dateTime(value: string, timezone = "Asia/Dhaka") {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Invalid date";
  }
}
