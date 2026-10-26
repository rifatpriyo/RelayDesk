import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  ChatCircle,
  Check,
  CheckCircle,
  Database,
  FileCsv,
  Globe,
  InstagramLogo,
  Leaf,
  MessengerLogo,
  ShieldCheck,
  Sparkle,
  UserCircle,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/primitives/button";
import {
  InteractiveDemo,
  StoryObserver,
} from "@/components/marketing/interactive-demo";
import { LivingScene } from "@/components/marketing/living-scene";
import "@/styles/marketing.css";

const channels = [
  { name: "Messenger", Icon: MessengerLogo },
  { name: "Instagram", Icon: InstagramLogo },
  { name: "WhatsApp", Icon: WhatsappLogo },
  { name: "Website", Icon: Globe },
];

function ChannelList({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`m-channels ${compact ? "compact" : ""}`}>
      {channels.map(({ name, Icon }) => (
        <span key={name}>
          <Icon size={22} weight="regular" aria-hidden="true" />
          {name}
        </span>
      ))}
    </div>
  );
}

function ProductAnswer({ hero = false }: { hero?: boolean }) {
  return (
    <article
      className={`m-example m-product-answer ${hero ? "hero-answer" : ""}`}
      aria-label="Sample product conversation"
    >
      <div className="m-example-heading">
        <span>
          <MessengerLogo size={18} /> Product question
        </span>
        <small>Sample conversation</small>
      </div>
      <p className="m-customer-question">“Everyday Tote er dam koto?”</p>
      <div className="m-product-detail">
        <img
          src="/samples/tote.svg"
          alt="Illustrated Everyday Tote"
          width="115"
          height="120"
        />
        <div>
          <strong>Everyday Tote</strong>
          <p>Soft cotton. Room for your day.</p>
          <span className="m-product-price">৳490</span>
        </div>
      </div>
      <p className="m-example-reply">
        Everyday Tote er dam ৳490. Ei sample catalog-e 24 ta ache.
      </p>
      <div className="m-source">
        <CheckCircle size={15} /> From the approved sample catalog
      </div>
    </article>
  );
}

function ShippingAnswer({ small = false }: { small?: boolean }) {
  return (
    <article
      className={`m-example m-shipping-answer ${small ? "small" : ""}`}
      aria-label="Sample holiday conversation"
    >
      <div className="m-example-heading">
        <span>
          <WhatsappLogo size={18} /> Shipping update
        </span>
        <small>Sample conversation</small>
      </div>
      <p className="m-customer-question">
        “Will you ship my order during Eid?”
      </p>
      <p className="m-example-reply">
        You can still place an order. Our sample shop pauses dispatch on{" "}
        <strong>5–8 June 2027</strong> and resumes on <strong>9 June</strong>.
      </p>
      <div className="m-source">
        <CalendarBlank size={15} /> Shop policy · Asia/Dhaka
      </div>
    </article>
  );
}

export default function MarketingPage() {
  return (
    <main className="marketing">
      <a className="skip-link" href="#interactive-demo">
        Skip animation
      </a>
      <header className="m-header">
        <Link href="/" className="m-brand" aria-label="RelayDesk home">
          <Leaf size={25} weight="duotone" />
          RelayDesk
        </Link>
        <nav aria-label="Main navigation">
          <a href="#chapter-1">How it works</a>
          <a href="#plans">Plans</a>
          <a href="#questions">Questions</a>
        </nav>
        <div className="m-header-actions">
          <Link href="/login" className="m-sign-in">
            Sign in
          </Link>
          <Button asChild size="small">
            <Link href="/demo">
              Try the demo <ArrowUpRight size={16} />
            </Link>
          </Button>
        </div>
      </header>

      <div className="marketing-narrative" data-chapter="0">
        <div className="m-scene-stage">
          <LivingScene />
        </div>
        <div className="m-narrative-content">
          <section className="m-hero" aria-labelledby="hero-title">
            <div className="m-hero-copy">
              <span className="m-eyebrow">A little more room to grow</span>
              <h1 id="hero-title">
                Your business,
                <br /> ready to reply.
              </h1>
              <p>
                Turn your products, policies, and business knowledge into
                helpful conversations on Messenger, Instagram, WhatsApp, and
                your website.
              </p>
              <div className="m-hero-actions">
                <Button asChild>
                  <Link href="/demo">
                    Try the demo <ArrowRight size={18} />
                  </Link>
                </Button>
                <a className="m-text-action" href="#chapter-1">
                  See how it works <ArrowDown size={17} />
                </a>
              </div>
            </div>
            <div className="m-hero-examples">
              <ProductAnswer hero />
              <ShippingAnswer small />
            </div>
            <div className="m-hero-bottom">
              <ChannelList compact />
              <a href="#chapter-1" className="m-scroll-cue">
                <ArrowDown size={17} /> Follow the conversation
              </a>
            </div>
          </section>

          <div className="m-story" aria-label="How RelayDesk works">
            <StoryObserver />
            <section
              className="m-chapter"
              id="chapter-1"
              data-story-chapter="0"
              aria-labelledby="connect-title"
            >
              <div className="m-chapter-copy">
                <span className="m-chapter-kicker">One place to begin</span>
                <h2 id="connect-title">
                  Connect your
                  <br /> conversations.
                </h2>
                <p>
                  Meet customers where they already talk. Bring your social
                  messages and website chat into one shared inbox.
                </p>
                <p className="m-detail">
                  Choose your Page or business account and approve the official
                  connection. Your team never needs to share a social account
                  password.
                </p>
                <div className="m-proof">
                  <ShieldCheck size={21} />
                  <span>You choose when live replies turn on.</span>
                </div>
              </div>
              <div className="m-example m-connect-example">
                <ChannelList />
                <div className="m-connection-lines" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div className="m-inbox-heading">
                  <ChatCircle size={23} />
                  <strong>Your shared inbox</strong>
                  <span>Sample</span>
                </div>
                <div className="m-inbox-row">
                  <MessengerLogo size={21} />
                  <span>
                    <strong>Rafi</strong>
                    <small>Is the olive shirt available?</small>
                  </span>
                  <span className="m-status">Assistant</span>
                </div>
                <div className="m-inbox-row">
                  <InstagramLogo size={21} />
                  <span>
                    <strong>Maliha</strong>
                    <small>Can I collect my order?</small>
                  </span>
                  <span className="m-status">Assistant</span>
                </div>
                <div className="m-inbox-row">
                  <WhatsappLogo size={21} />
                  <span>
                    <strong>Sadman</strong>
                    <small>I need help with a custom order.</small>
                  </span>
                  <span className="m-status staff">Team</span>
                </div>
                <div className="m-inbox-row">
                  <Globe size={21} />
                  <span>
                    <strong>Website visitor</strong>
                    <small>What are your opening hours?</small>
                  </span>
                  <span className="m-status">Assistant</span>
                </div>
              </div>
            </section>

            <section
              className="m-chapter"
              id="chapter-2"
              data-story-chapter="1"
              aria-labelledby="knowledge-title"
            >
              <div className="m-chapter-copy">
                <h2 id="knowledge-title">
                  Give it your
                  <br /> business knowledge.
                </h2>
                <p>
                  Start with the information you already have. Review the
                  details once, then give every conversation a dependable
                  starting point.
                </p>
                <p className="m-detail">
                  Upload CSV, Excel, text, Markdown, or text-based PDFs. Connect
                  Google Sheets or selected read-only MySQL and PostgreSQL
                  tables with the required credentials.
                </p>
                <a className="m-text-action" href="/demo">
                  Explore the sample catalog <ArrowUpRight size={18} />
                </a>
              </div>
              <div className="m-example m-knowledge-example">
                <div className="m-example-heading">
                  <span>
                    <FileCsv size={21} /> everyday-catalog.csv
                  </span>
                  <small>Sample import</small>
                </div>
                <div className="m-sheet">
                  <div>
                    <strong>Product</strong>
                    <strong>Price · BDT</strong>
                    <strong>Stock</strong>
                  </div>
                  <div>
                    <span>Everyday Tote</span>
                    <span>490</span>
                    <span>24</span>
                  </div>
                  <div>
                    <span>Olive Linen Shirt</span>
                    <span>1,290</span>
                    <span>12</span>
                  </div>
                  <div>
                    <span>Soft Cotton Scarf</span>
                    <span>650</span>
                    <span>Unknown</span>
                  </div>
                </div>
                <div className="m-review-arrow">
                  <ArrowDown size={20} />
                  <span>Review fields and confirm</span>
                </div>
                <div className="m-approved">
                  <CheckCircle size={25} />
                  <div>
                    <strong>Ready for useful answers</strong>
                    <p>
                      Approved products, prices, and FAQs.
                      <br /> Unknown stock stays unknown.
                    </p>
                  </div>
                </div>
                <div className="m-knowledge-footer">
                  <Database size={17} /> Source details and last update stay
                  attached.
                </div>
              </div>
            </section>

            <section
              className="m-chapter"
              id="chapter-3"
              data-story-chapter="2"
              aria-labelledby="style-title"
            >
              <div className="m-chapter-copy">
                <h2 id="style-title">
                  Your knowledge.
                  <br /> Your way of replying.
                </h2>
                <p>
                  Warm or concise. Bangla, English, or Banglish. Set the voice,
                  then test it with the questions customers actually ask.
                </p>
                <p className="m-detail">
                  Prices and stock come from approved information. Review a
                  draft before publishing changes to your assistant.
                </p>
                <details className="m-advanced">
                  <summary>Need a little more control?</summary>
                  <p>
                    You can add extra guidance in Assistant style. For example:
                    “Ask which size the customer wants before checking
                    availability.” Your published policies and prices still take
                    priority.
                  </p>
                </details>
                <a className="m-text-action" href="#interactive-demo">
                  Try the language controls <ArrowDown size={18} />
                </a>
              </div>
              <div className="m-style-example">
                <div className="m-style-labels">
                  <span>
                    <Sparkle size={16} /> Warm & helpful
                  </span>
                  <span>Banglish</span>
                </div>
                <ProductAnswer />
              </div>
            </section>

            <section
              className="m-chapter"
              id="chapter-4"
              data-story-chapter="3"
              aria-labelledby="changes-title"
            >
              <div className="m-chapter-copy">
                <h2 id="changes-title">
                  Plans change.
                  <br /> Keep customers informed.
                </h2>
                <p>
                  A holiday break, new opening hours, or a short shipping pause.
                  Set the dates once so your assistant can explain what changes.
                </p>
                <p className="m-detail">
                  Temporary changes follow your business timezone and expire
                  automatically. The sample dates describe this shop’s policy,
                  not every courier.
                </p>
              </div>
              <div className="m-change-example">
                <div className="m-change-rule">
                  <CalendarBlank size={26} />
                  <div>
                    <strong>Eid dispatch pause</strong>
                    <span>5 June, 00:00 → 9 June 2027, 00:00</span>
                    <small>Asia/Dhaka · Orders accepted · Expires 9 June</small>
                  </div>
                </div>
                <ShippingAnswer />
              </div>
            </section>

            <section
              className="m-chapter"
              id="chapter-5"
              data-story-chapter="4"
              aria-labelledby="growth-title"
            >
              <div className="m-chapter-copy">
                <h2 id="growth-title">
                  Make room
                  <br /> for the human part.
                </h2>
                <p>
                  Less repetitive typing. More consistent information. More
                  attention for the conversations that need your team.
                </p>
                <p className="m-detail">
                  When approved information is missing, the assistant asks for
                  help. Your staff can take over, reply, and resume the
                  assistant when they are ready.
                </p>
                <div className="m-proof">
                  <UserCircle size={23} />
                  <span>Your team stays in control.</span>
                </div>
              </div>
              <div className="m-example m-handover-example">
                <div className="m-example-heading">
                  <span>
                    <InstagramLogo size={19} /> Custom request
                  </span>
                  <small>Sample conversation</small>
                </div>
                <p className="m-customer-question">
                  “Can you make 50 custom totes for our event?”
                </p>
                <p className="m-example-reply">
                  I don’t have approved details for custom event orders. I’ll
                  pass this to our team so they can help.
                </p>
                <div className="m-handover-state">
                  <UserCircle size={30} />
                  <div>
                    <strong>Handed to the team</strong>
                    <span>Assistant paused. A person takes it from here.</span>
                  </div>
                  <CheckCircle size={20} />
                </div>
                <div className="m-staff-reply">
                  <span className="m-shop-avatar">N</span>
                  <div>
                    <strong>Noor · Shop team</strong>
                    <p>Happy to help. What date is your event?</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <section
        className="m-demo-section m-content"
        id="interactive-demo"
        aria-label="Interactive sample conversation"
      >
        <InteractiveDemo />
      </section>

      <section
        className="m-plans-section m-content"
        id="plans"
        aria-labelledby="plans-title"
      >
        <div className="m-section-heading">
          <span className="m-eyebrow">Start small. Find your rhythm.</span>
          <h2 id="plans-title">A plan for your next chapter.</h2>
          <p>
            Provisional monthly plans in BDT. Explore plan changes in the demo
            with a clearly labeled mock checkout. No card, no charge.
          </p>
        </div>
        <div className="m-plans">
          <article className="m-plan">
            <h3>Free</h3>
            <p>Get a feel for the workflow.</p>
            <div className="m-plan-price">
              ৳0<span> / month</span>
            </div>
            <ul>
              <li>
                <Check size={17} />
                200 AI replies per month
              </li>
              <li>
                <Check size={17} />
                100 catalog items
              </li>
              <li>
                <Check size={17} />2 team seats · 2 data sources
              </li>
            </ul>
            <Button asChild variant="secondary">
              <Link href="/demo">
                Explore Free <ArrowUpRight size={17} />
              </Link>
            </Button>
          </article>
          <article className="m-plan m-plan-featured">
            <span className="m-plan-label">A little more space</span>
            <h3>Starter</h3>
            <p>For a growing daily conversation.</p>
            <div className="m-plan-price">
              ৳990<span> / month</span>
            </div>
            <ul>
              <li>
                <Check size={17} />
                2,000 AI replies per month
              </li>
              <li>
                <Check size={17} />
                1,000 catalog items
              </li>
              <li>
                <Check size={17} />5 team seats · 5 data sources
              </li>
            </ul>
            <Button asChild>
              <Link href="/demo">
                Try a simulated upgrade <ArrowUpRight size={17} />
              </Link>
            </Button>
          </article>
          <article className="m-plan">
            <h3>Growth</h3>
            <p>Room for a busier team.</p>
            <div className="m-plan-price">
              ৳2,990<span> / month</span>
            </div>
            <ul>
              <li>
                <Check size={17} />
                10,000 AI replies per month
              </li>
              <li>
                <Check size={17} />
                10,000 catalog items
              </li>
              <li>
                <Check size={17} />
                15 team seats · 20 data sources
              </li>
            </ul>
            <Button asChild variant="secondary">
              <Link href="/demo">
                Explore Growth <ArrowUpRight size={17} />
              </Link>
            </Button>
          </article>
        </div>
        <p className="m-plan-footnote">
          Simulated plan allowances are separate from real AI spending limits.
          Social channels require your own eligible accounts and provider
          approval.
        </p>
      </section>

      <section
        className="m-faq-section m-content"
        id="questions"
        aria-labelledby="faq-title"
      >
        <div>
          <h2 id="faq-title">
            A few things
            <br /> you might be wondering.
          </h2>
          <p>
            Try the whole workflow with sample businesses before connecting an
            account.
          </p>
        </div>
        <div className="m-faq-list">
          <details>
            <summary>Can I try it without connecting my shop?</summary>
            <p>
              Yes. The demo uses isolated, persistent sample businesses. Explore
              the inbox, change the catalog, test replies, and run a simulated
              checkout. It does not send messages to real customers.
            </p>
          </details>
          <details>
            <summary>Will it make up prices or stock?</summary>
            <p>
              The assistant uses your approved catalog and checks freshness
              before quoting availability. Unknown or outdated information
              triggers clarification or staff help. You can inspect the sources
              in Test your assistant.
            </p>
          </details>
          <details>
            <summary>What can I use as business knowledge?</summary>
            <p>
              Use CSV or Excel for a catalog, text and Markdown for FAQs, and
              text-based PDFs for policies. Google Sheets, MySQL, and PostgreSQL
              connectors require setup. Scanned PDFs need OCR before importing;
              private-network database tunnels are not included.
            </p>
          </details>
          <details>
            <summary>Can my team take over a conversation?</summary>
            <p>
              Yes. A staff member can take over, send a reply, and resume the
              assistant. Handover pauses automatic replies so a conversation has
              a clear owner.
            </p>
          </details>
          <details>
            <summary>Are Messenger, Instagram, and WhatsApp automatic?</summary>
            <p>
              Each uses its official business connection flow. You select an
              eligible account, approve access, test the connection, and
              explicitly activate replies. Provider permissions, account
              eligibility, and messaging rules still apply.
            </p>
          </details>
          <details>
            <summary>Will the demo charge me?</summary>
            <p>
              No. Checkout, receipts, subscriptions, and plan changes are
              simulated and labeled. Real payments are not connected.
            </p>
          </details>
        </div>
      </section>

      <section className="m-final m-content">
        <Leaf size={35} weight="duotone" />
        <h2>
          Let your knowledge
          <br /> start the conversation.
        </h2>
        <p>A calmer way to help customers, one reply at a time.</p>
        <Button asChild>
          <Link href="/login?mode=signup">
            Create your workspace <ArrowUpRight size={18} />
          </Link>
        </Button>
      </section>
      <footer className="m-footer m-content">
        <Link className="m-brand" href="/">
          <Leaf size={23} weight="duotone" />
          RelayDesk
        </Link>
        <p>Built around your business.</p>
        <nav aria-label="Footer navigation">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/deletion">Data deletion</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </footer>
    </main>
  );
}
