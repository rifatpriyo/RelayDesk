"use client";
import { useState } from "react";
import { Brand } from "@/components/ui";
import { Storefront, Wrench, ArrowRight } from "@phosphor-icons/react";
export default function Demo() {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  async function start(business: string) {
    setBusy(business);
    setError("");
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      location.href = "/workspace/overview";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start demo");
      setBusy("");
    }
  }
  return (
    <main className="demo-page">
      <Brand />
      <h1>
        A little business.
        <br />A lot to explore.
      </h1>
      <p>
        Choose a sample workspace. Explore the inbox, add your knowledge, and
        test an assistant in English, Bangla, or Banglish.
      </p>
      <div className="notice warning">
        Synthetic businesses, simulated conversations, and mock payments. No
        messages reach real customers. Changes persist in this local demo.
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="equal-col">
        {[
          {
            id: "retail",
            name: "Dhaka Thread",
            description:
              "A clothing shop with panjabis, kurtis, and everyday essentials. Explore product questions, delivery policies, and exchanges.",
            Icon: Storefront,
          },
          {
            id: "service",
            name: "Care & Repair",
            description:
              "A neighbourhood service business. Explore service pricing, appointment requests, and helpful staff handovers.",
            Icon: Wrench,
          },
        ].map(({ id, name, description, Icon }) => (
          <section key={id} className="panel demo-choice">
            <div className="channel-icon">
              <Icon size={29} weight="duotone" />
            </div>
            <h2>{name}</h2>
            <p>{description}</p>
            <button
              className="button"
              disabled={!!busy}
              onClick={() => start(id)}
            >
              {busy === id ? "Opening workspace…" : "Explore workspace"}
              <ArrowRight size={16} />
            </button>
          </section>
        ))}
      </div>
      <p className="small-text" style={{ marginTop: 25 }}>
        Each business has its own catalog, knowledge, conversations, and billing
        history. You can return here to switch between them.
      </p>
    </main>
  );
}
