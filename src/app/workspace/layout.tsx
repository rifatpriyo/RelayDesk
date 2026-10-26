import { WorkspaceProvider } from "@/components/workspace/provider";
import { WorkspaceShell } from "@/components/workspace/shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
