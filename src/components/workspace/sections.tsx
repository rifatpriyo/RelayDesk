"use client";
import { Overview, Inbox } from "./overview-inbox";
import {
  Catalog,
  Knowledge,
  Rules,
  Assistant,
  Onboarding,
} from "./business-panels";
import { Sources, Playground, Channels } from "./integration-panels";
import { Billing, Settings } from "./management-panels";
export function WorkspaceSection({ section }: { section: string }) {
  const panels: Record<string, React.ComponentType> = {
    overview: Overview,
    inbox: Inbox,
    catalog: Catalog,
    knowledge: Knowledge,
    rules: Rules,
    assistant: Assistant,
    onboarding: Onboarding,
    sources: Sources,
    playground: Playground,
    channels: Channels,
    billing: Billing,
    settings: Settings,
  };
  const Component = panels[section];
  return Component ? <Component /> : null;
}
