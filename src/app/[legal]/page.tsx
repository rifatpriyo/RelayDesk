import Link from "next/link";
import { notFound } from "next/navigation";
const content: Record<string, { title: string; sections: [string, string][] }> =
  {
    privacy: {
      title: "Privacy notice",
      sections: [
        [
          "Owner details to complete",
          "Before public use, the operator must add their legal business name, contact email, postal address, and applicable jurisdiction. This scaffold has not received legal review.",
        ],
        [
          "What this application processes",
          "Business profiles, catalog and knowledge uploads, channel credentials, customer conversations, staff actions, simulated subscription events, and model usage are processed to operate the assistant. Merchant credentials are encrypted server-side.",
        ],
        [
          "Providers and purposes",
          "Supabase provides identity, database and file storage. Vercel hosts the application and jobs. If explicitly enabled, relevant bounded information is sent to DeepSeek. Connected messaging platforms process communications under their own terms. Raw chat history is not used to train a shared model.",
        ],
        [
          "Control and retention",
          "Owners can disconnect channels, export workspace data, select conversation retention, and request deletion in Business & team settings. Provider records and backups may remain under their separate retention schedules. The operator must document actual backup and processor retention before launch.",
        ],
      ],
    },
    terms: {
      title: "Terms of use",
      sections: [
        [
          "Owner-supplied terms required",
          "This is a product scaffold, not legal advice or a reviewed contract. The operator must complete business identity, jurisdiction, service levels, contact details, and dispute terms before public use.",
        ],
        [
          "Assistant scope",
          "RelayDesk provides information from reviewed business knowledge. It does not autonomously place orders, book services, issue refunds, or collect payments. Businesses are responsible for accurate policies and appropriate customer authorization.",
        ],
        [
          "Simulated billing",
          "Every checkout in this release is a simulation. No money is charged and receipts are not tax invoices. Demo plan prices are illustrative. A simulated plan does not override independent limits on actual model spending.",
        ],
        [
          "Channel eligibility",
          "Connecting a channel requires appropriate ownership, platform approval, and compliance with each provider’s messaging windows and rules. Availability depends on authorized provider access.",
        ],
      ],
    },
    deletion: {
      title: "Data deletion",
      sections: [
        [
          "Delete your business",
          "Sign in as the business owner, open Business & team, and use Delete business. The application asks you to confirm the exact business name. This removes active workspace data and disables future use of stored credentials.",
        ],
        [
          "Disconnect first when appropriate",
          "A channel can be disconnected independently from Channels. This stops future sends and removes local credentials, with provider revocation where supported.",
        ],
        [
          "Backups and third parties",
          "Database backups and provider-held message records are controlled separately. The operator must publish the actual backup expiry period and a contact address for verified deletion requests before launch.",
        ],
        [
          "Meta deletion requests",
          "The operator must register the application’s verified Meta data-deletion callback and supply a public status/contact process in their provider configuration. This public page explains the owner-accessible path.",
        ],
      ],
    },
  };
export default async function Legal({
  params,
}: {
  params: Promise<{ legal: string }>;
}) {
  const { legal } = await params,
    item = content[legal];
  if (!item) notFound();
  return (
    <main className="legal-page">
      <Link href="/" className="brand">
        RelayDesk
      </Link>
      <h1>{item.title}</h1>
      <div className="notice warning">
        Owner-supplied legal details are required before public use.
      </div>
      {item.sections.map(([heading, text]) => (
        <section key={heading}>
          <h2>{heading}</h2>
          <p>{text}</p>
        </section>
      ))}
      <Link className="text-link" href="/">
        Return to RelayDesk
      </Link>
    </main>
  );
}
