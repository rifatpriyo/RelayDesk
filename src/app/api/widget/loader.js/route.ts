export async function GET() {
  const script = `(()=>{const tag=document.currentScript;if(!tag)return;const key=tag.dataset.widget;if(!/^widget_[A-Za-z0-9_-]{40,60}$/.test(key||''))return;const base=new URL(tag.src).origin;const host=document.createElement('div');host.style.cssText='position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,sans-serif';const button=document.createElement('button');button.type='button';button.textContent='Chat with us';button.setAttribute('aria-expanded','false');button.style.cssText='border:0;background:#0e493b;color:white;padding:15px 22px;border-radius:28px;font:600 15px system-ui;cursor:pointer;box-shadow:0 5px 20px #0003';const frame=document.createElement('iframe');frame.title='Business assistant chat';frame.src=base+'/api/widget/frame?widget='+encodeURIComponent(key)+'&parent='+encodeURIComponent(location.origin);frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.setAttribute('referrerpolicy','no-referrer');frame.style.cssText='display:none;width:min(380px,calc(100vw - 32px));height:min(580px,calc(100dvh - 110px));border:1px solid #dce4dd;border-radius:20px;box-shadow:0 15px 60px #0003;margin-bottom:12px;background:#faf9f5';button.onclick=()=>{const open=frame.style.display==='none';frame.style.display=open?'block':'none';button.textContent=open?'Close chat':'Chat with us';button.setAttribute('aria-expanded',String(open));};host.append(frame,button);document.body.append(host);})();`;
  return new Response(script, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
