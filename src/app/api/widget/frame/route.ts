import { apiError } from "@/lib/integrations/http";
import { createWidgetSession, resolveWidget } from "@/lib/integrations/widget";
import { nonce, safeOrigin } from "@/lib/integrations/security";
function html(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      widgetId = url.searchParams.get("widget") || "",
      origin = safeOrigin(url.searchParams.get("parent") || ""),
      { widget } = await resolveWidget(widgetId),
      session = await createWidgetSession(
        widgetId,
        origin,
        request.headers.get("x-forwarded-for") || "local",
      ),
      scriptNonce = nonce();
    const config = JSON.stringify({
      widgetId,
      origin,
      token: session.token,
      sessionId: session.sessionId,
    }).replace(/</g, "\\u003c");
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(session.title)}</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#faf9f5;color:#1e342b;font:15px/1.55 system-ui,sans-serif;display:flex;flex-direction:column;height:100dvh}header{padding:18px 20px;border-bottom:1px solid #dce4dd}h1{font-size:18px;margin:0}header p{font-size:12px;margin:4px 0 0;color:#52645a}#messages{flex:1;overflow:auto;padding:16px;scroll-behavior:smooth}.message{padding:12px 14px;border-radius:14px;background:white;border:1px solid #e4e6df;white-space:pre-wrap;margin:0 0 10px}.customer{background:#e3eee6;margin-left:30px}.label{font-size:11px;font-weight:700;color:#52645a;display:block;margin-bottom:4px}form{padding:12px;border-top:1px solid #dce4dd;display:flex;gap:8px}textarea{font:inherit;resize:none;border:1px solid #aabbaf;border-radius:10px;padding:10px;min-width:0;flex:1}button{font:600 14px system-ui;background:#0e493b;color:white;border:0;border-radius:10px;padding:10px 16px;cursor:pointer}button:disabled{opacity:.5}button:focus-visible,textarea:focus-visible{outline:3px solid #2d8863;outline-offset:2px}#status{font-size:12px;min-height:20px;padding:0 14px;color:#6d4534}footer{padding:0 14px 10px;font-size:11px;color:#52645a} @media(prefers-reduced-motion:reduce){#messages{scroll-behavior:auto}}</style></head><body><header><h1>${html(session.title)}</h1><p>${html(session.businessName)} · Business assistant${session.simulated ? " · Simulated demo" : ""}</p></header><main id="messages" aria-live="polite" aria-label="Conversation"><p class="message">Hello! I can help with approved products and policies. Ask for a person whenever you need our team. Please do not share payment details or private account information.</p></main><div id="status" role="status"></div><form id="chat"><label for="question" hidden>Your message</label><textarea id="question" rows="2" maxlength="2000" placeholder="Write your message…" required></textarea><button id="send" type="submit">Send</button></form><footer>Private order or account questions require staff verification.</footer><script nonce="${scriptNonce}">const config=${config};const form=document.getElementById('chat'),question=document.getElementById('question'),status=document.getElementById('status'),send=document.getElementById('send'),messages=document.getElementById('messages');const seen=new Set();function add(text,role,id){if(id&&seen.has(id))return;if(id)seen.add(id);const p=document.createElement('p');p.className='message '+(role==='customer'?'customer':'');const label=document.createElement('span');label.className='label';label.textContent=role==='customer'?'You':role==='staff'?'Team member':'Business assistant';p.append(label,document.createTextNode(text));messages.append(p);messages.scrollTop=messages.scrollHeight;}async function call(body){const response=await fetch('/api/widget/chat',{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({...config,...body})});const value=await response.json();if(!response.ok)throw new Error(value.error||'Chat is temporarily unavailable.');return value;}form.addEventListener('submit',async event=>{event.preventDefault();const message=question.value.trim();if(!message)return;send.disabled=true;question.value='';status.textContent='Checking our approved information…';add(message,'customer');try{const reply=await call({message,requestId:crypto.randomUUID()});add(reply.text,'assistant',reply.responseId+'-answer');status.textContent=reply.handover?'Our team has been notified in the inbox.':'';}catch(error){status.textContent=error.message;}finally{send.disabled=false;question.focus();}});let poll;function pollMessages(){if(document.hidden)return;call({action:'messages'}).then(value=>{value.messages.forEach(item=>add(item.text,item.role,item.id));}).catch(()=>{});}poll=setInterval(pollMessages,10000);window.addEventListener('pagehide',()=>clearInterval(poll));</script></body></html>`;
    return new Response(page, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-security-policy": `default-src 'none'; script-src 'nonce-${scriptNonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${widget.allowedOrigins.join(" ")}; base-uri 'none'; form-action 'none'`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
