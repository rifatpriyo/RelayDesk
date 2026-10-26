"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  SquaresFour,
  ChatsCircle,
  Tag,
  BookOpen,
  Database,
  SlidersHorizontal,
  Flask,
  CalendarBlank,
  Plugs,
  Wallet,
  Gear,
  ArrowRight,
  SignOut,
  List,
  Leaf,
  CheckCircle,
  CaretDown,
} from "@phosphor-icons/react";
import { Brand, Avatar } from "@/components/ui";
import { useWorkspace } from "./provider";
import { dictionary } from "@/lib/i18n";

export const navItems = [
  ["overview", SquaresFour],
  ["inbox", ChatsCircle],
  ["catalog", Tag],
  ["knowledge", BookOpen],
  ["sources", Database],
  ["assistant", SlidersHorizontal],
  ["playground", Flask],
  ["rules", CalendarBlank],
  ["channels", Plugs],
  ["billing", Wallet],
  ["settings", Gear],
] as const;
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { workspace: s, actor, request } = useWorkspace(),
    path = usePathname(),
    [open, setOpen] = useState(false);
  const t = dictionary[s.business.dashboardLanguage];
  const section = path.split("/")[2] as keyof typeof t;
  const logout = async () => {
    try {
      await request("/api/auth/logout", {});
      location.href = "/login";
    } catch {}
  };
  return (
    <div
      className="workspace"
      lang={s.business.dashboardLanguage === "bn" ? "bn" : "en"}
    >
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Brand />
        <Link
          href="/workspace/settings"
          className="business-chip"
          onClick={() => setOpen(false)}
        >
          <Avatar name={s.business.name} />
          <span>
            {s.business.name}
            <small>
              {s.business.kind === "retail"
                ? "Retail workspace"
                : "Service workspace"}
            </small>
          </span>
          <CaretDown size={12} style={{ marginLeft: "auto" }} />
        </Link>
        <nav aria-label="Workspace navigation">
          {navItems.map(([id, Icon], i) => (
            <div key={id}>
              {[0, 5, 9].includes(i) && (
                <div className="nav-label">
                  {i === 0
                    ? t.workspace
                    : i === 5
                      ? t.assistantGroup
                      : t.manage}
                </div>
              )}
              <Link
                className={`nav-link ${section === id ? "active" : ""}`}
                href={`/workspace/${id}`}
                aria-current={section === id ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon weight={section === id ? "duotone" : "regular"} />
                {t[id]}
                {id === "inbox" && s.conversations.some((c) => c.unread) && (
                  <span className="nav-count">
                    {s.conversations.filter((c) => c.unread).length}
                  </span>
                )}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="nav-link" href="/workspace/onboarding">
            <CheckCircle size={18} />
            {t.onboarding}
          </Link>
          <div className="profile">
            <Avatar
              name={
                s.members.find((m) => m.userId === actor.userId)?.name ||
                "Business owner"
              }
            />
            <span>
              {s.members.find((m) => m.userId === actor.userId)?.name ||
                "Business owner"}
              <small>
                {actor.role.charAt(0).toUpperCase() + actor.role.slice(1)}
              </small>
            </span>
            <button
              onClick={logout}
              className="icon-button"
              aria-label="Sign out"
            >
              <SignOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <List size={21} />
            </button>
            <span>{t.workspace}</span>
            <span>/</span>
            <strong>{t[section] || "Workspace"}</strong>
          </div>
          <div className="topbar-actions">
            {actor.demo && (
              <Link href="/demo" className="demo-label">
                Demo workspace
              </Link>
            )}
            <Link className="button ghost small" href="/workspace/playground">
              <Leaf size={15} />
              Test your assistant
              <ArrowRight size={13} />
            </Link>
            <Avatar name={s.business.name} />
          </div>
        </header>
        <main className="content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
