import { useEffect, useMemo, useRef, useState } from 'react';

export function SafeReportFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(480);
  const document = useMemo(() => `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'">
    <style>body{margin:0;padding:12px;color:#f4f4f5;font:14px/1.6 system-ui;background:transparent}*{box-sizing:border-box}img{max-width:100%}</style>
    </head><body>${html}<script>
    const reportHeight = () => parent.postMessage({type:'bgm-report-height',height:document.body.scrollHeight}, '*');
    new ResizeObserver(reportHeight).observe(document.body); reportHeight();
    </script></body></html>`, [html]);
  useEffect(() => {
    const resize = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || event.data?.type !== 'bgm-report-height') return;
      const next = Number(event.data.height);
      if (Number.isFinite(next)) setHeight(Math.max(120, Math.min(12000, next + 8)));
    };
    window.addEventListener('message', resize);
    return () => window.removeEventListener('message', resize);
  }, []);
  return <iframe ref={ref} data-testid="html-viz-sandbox" title="AI 报告可视化" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={document} style={{ height }} className="my-5 w-full border-0 rounded-xl" />;
}
