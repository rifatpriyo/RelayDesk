"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChatCircle,
  ArrowUpRight,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/primitives/button";

const samples = {
  en: {
    product: [
      "How much is the Everyday Tote?",
      "The Everyday Tote is ৳490. There are 24 available in this sample catalog. Would you like help choosing a colour?",
    ],
    shipping: [
      "Can you send my order during Eid?",
      "You can place an order during our shipping pause, 5–8 June 2027. Dispatch resumes on 9 June. These are this sample shop’s dates, in Asia/Dhaka.",
    ],
    staff: [
      "Can you make a custom bag for my wedding?",
      "I don’t have approved information about custom wedding orders. I’ll pass your request to the shop team so they can help.",
    ],
  },
  bn: {
    product: [
      "Everyday Tote-এর দাম কত?",
      "Everyday Tote-এর দাম ৳৪৯০। নমুনা ক্যাটালগে ২৪টি আছে। রং বেছে নিতে সাহায্য করতে পারি?",
    ],
    shipping: [
      "ঈদের ছুটিতে অর্ডার পাঠাবেন?",
      "৫–৮ জুন ২০২৭ আমাদের নমুনা দোকানে অর্ডার পাঠানো বন্ধ থাকবে। অর্ডার করতে পারবেন; ৯ জুন থেকে পাঠানো শুরু হবে। সময়: এশিয়া/ঢাকা।",
    ],
    staff: [
      "আমার বিয়ের জন্য কাস্টম ব্যাগ বানাবেন?",
      "কাস্টম বিয়ের অর্ডার সম্পর্কে অনুমোদিত তথ্য নেই। সাহায্যের জন্য আপনার অনুরোধটি দোকানের টিমের কাছে পাঠাব।",
    ],
  },
  banglish: {
    product: [
      "Everyday Tote er dam koto?",
      "Everyday Tote er dam ৳490. Ei sample catalog-e 24 ta ache. Colour beche nite help korte pari?",
    ],
    shipping: [
      "Eid er chhutite order pathaben?",
      "Ei sample shop-e 5–8 June 2027 shipping bondho. Order korte parben; 9 June dispatch abar shuru hobe. Shomoy: Asia/Dhaka.",
    ],
    staff: [
      "Amar biyer jonno custom bag banaben?",
      "Custom wedding order niye approved tothyo nei. Apnar request shop team-er kache pathiye debo, tara help korbe.",
    ],
  },
};
type Topic = "product" | "shipping" | "staff";

export function InteractiveDemo() {
  const [language, setLanguage] = useState<keyof typeof samples>("en");
  const [topic, setTopic] = useState<Topic>("product");
  const [tone, setTone] = useState("warm");
  const pair = samples[language][topic];
  const response =
    tone === "concise" && topic === "product"
      ? {
          en: "Everyday Tote: ৳490. Sample stock: 24.",
          bn: "Everyday Tote: ৳৪৯০। নমুনা স্টক: ২৪টি।",
          banglish: "Everyday Tote: ৳490. Sample stock: 24 ta.",
        }[language]
      : pair[1];
  return (
    <div className="m-demo-grid">
      <div className="m-demo-controls">
        <h2>
          A little knowledge.
          <br />A much better reply.
        </h2>
        <p>
          Change the language, choose a question, and see how approved
          information becomes a useful answer.
        </p>
        <div className="m-demo-fields">
          <label>
            Conversation language
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as keyof typeof samples)
              }
            >
              <option value="en">English</option>
              <option value="bn">বাংলা</option>
              <option value="banglish">Banglish</option>
            </select>
          </label>
          <label>
            Reply style
            <select
              value={tone}
              onChange={(event) => setTone(event.target.value)}
            >
              <option value="warm">Warm & helpful</option>
              <option value="concise">Concise</option>
            </select>
          </label>
        </div>
        <div className="m-question-list" aria-label="Choose a sample question">
          {(["product", "shipping", "staff"] as const).map((value, index) => (
            <button
              key={value}
              aria-pressed={topic === value}
              onClick={() => setTopic(value)}
            >
              <span>0{index + 1}</span>
              {
                [
                  "A product question",
                  "A change to shipping",
                  "A request for the team",
                ][index]
              }
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
        <p className="m-fine">
          Illustrative sample responses. No live AI call or customer message is
          sent here.
        </p>
      </div>
      <div className="m-demo-chat">
        <header>
          <span className="m-shop-avatar">N</span>
          <span>
            Noor Studio<small>Business assistant · sample shop</small>
          </span>
          <span className="m-online">
            <i />
            Sample
          </span>
        </header>
        <div
          className="m-chat-body"
          aria-live="polite"
          lang={language === "bn" ? "bn" : "en"}
        >
          <div className="m-bubble question">{pair[0]}</div>
          <div className="m-bubble answer">
            {topic === "product" && (
              <div className="m-demo-product">
                <img
                  src="/samples/tote.svg"
                  alt="Illustrated Everyday Tote sample product"
                  width="100"
                  height="100"
                />
                <span>
                  Everyday Tote<small>Approved catalog · ৳490</small>
                </span>
              </div>
            )}
            {response}
            <span className="m-answer-source">
              <Check size={14} />
              {topic === "product"
                ? "Approved sample catalog"
                : topic === "shipping"
                  ? "Owner-created temporary change"
                  : "Staff handover requested"}
            </span>
          </div>
          {topic === "staff" && (
            <p className="m-handover">
              <ChatCircle size={17} />
              The team can take over. The assistant pauses.
            </p>
          )}
        </div>
        <footer>
          <span>Bring your own questions to the workspace.</span>
          <Button asChild>
            <Link href="/demo">
              Try the demo <ArrowRight size={16} />
            </Link>
          </Button>
        </footer>
      </div>
    </div>
  );
}

export function StoryObserver() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const chapters = [
      ...document.querySelectorAll<HTMLElement>("[data-story-chapter]"),
    ];
    const intersections = new Map<Element, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => intersections.set(entry.target, entry));
        const visible = [...intersections.values()]
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const chapter = Number(
            (visible.target as HTMLElement).dataset.storyChapter,
          );
          setActive(chapter);
          document
            .querySelector<HTMLElement>(".marketing-narrative")
            ?.setAttribute("data-chapter", String(chapter));
        }
      },
      { rootMargin: "-20% 0px -30% 0px", threshold: [0, 0.1, 0.4] },
    );
    chapters.forEach((chapter) => observer.observe(chapter));
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="m-chapter-nav" aria-label="Story chapters">
      {["Connect", "Knowledge", "Style", "Changes", "Growth"].map(
        (name, index) => (
          <a
            key={name}
            href={`#chapter-${index + 1}`}
            aria-current={active === index ? "step" : undefined}
          >
            <span>0{index + 1}</span>
            <span>{name}</span>
          </a>
        ),
      )}
    </nav>
  );
}
