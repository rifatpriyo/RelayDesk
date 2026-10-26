import { WorkspaceSection } from "@/components/workspace/sections";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "overview",
      "inbox",
      "catalog",
      "knowledge",
      "sources",
      "assistant",
      "playground",
      "rules",
      "channels",
      "billing",
      "settings",
      "onboarding",
    ].includes(section)
  )
    notFound();
  return <WorkspaceSection section={section} />;
}
