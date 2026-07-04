'use client';
import React, { useState, useEffect, useRef, useMemo, Fragment } from 'react';

import FeaturesJourney from "@/components/FeaturesJourney";

export default function QueryWiseLanding() {
  const [theme, setTheme] = useState('dark');
  const [exIdx, setExIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | typing | pipeline
  const [stepIdx, setStepIdx] = useState(-1);
  const [showSql, setShowSql] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [grown, setGrown] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [shot, setShot] = useState(0);
  const [featIdx, setFeatIdx] = useState(0);
  
  const runTokenRef = useRef(0);
  const featIntRef = useRef<any>(null);
  const ioRef = useRef<any>(null);

  const FEATS = [
    { icon: '💬', title: 'Chat, not query', tag: 'natural language', crumb: 'querywise.app/chats', headline: 'Ask in plain English.', line: 'Follow-ups keep their context.' },
    { icon: '⚡', title: 'See the SQL', tag: 'never a black box', crumb: 'generated query · explained', headline: 'Generated, explained, read-only.', line: 'Nothing runs you can’t inspect.' },
    { icon: '📊', title: 'Charts, automatic', tag: 'zero config', crumb: 'visualization · auto-selected', headline: 'The right chart, picked for you.', line: 'From the shape of your data.' },
    { icon: '📈', title: 'Live dashboards', tag: 'pin & refresh', crumb: 'dashboards/company-kpis', headline: 'Pin answers as widgets.', line: 'They refresh themselves.' },
    { icon: '🔗', title: 'Public sharing', tag: 'secure links', crumb: 'shared/x7f2 · public', headline: 'Share a link, live data.', line: 'Password optional. SQL never exposed.' },
    { icon: '🔒', title: 'Safe by default', tag: 'passes review', crumb: 'security', headline: 'Encrypted, read-only, audited.', line: 'Credentials never touch the browser.' },
    { icon: '🗂', title: 'Every database', tag: 'one workspace', crumb: 'connections', headline: 'Dev, staging, prod.', line: 'All in one place, always synced.' }
  ];

  const EXAMPLES = [
    {
      q: 'Show monthly revenue for the last 12 months',
      sql: "SELECT date_trunc('month', o.created_at) AS month,\n       SUM(o.total_amount) AS revenue\nFROM orders o\nWHERE o.created_at >= now() - interval '12 months'\nGROUP BY 1 ORDER BY 1;",
      chartTitle: 'Monthly revenue',
      chartMeta: '12 rows · bar chart (auto)',
      labels: ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'],
      values: [34,41,38,52,47,58,55,63,60,72,69,84],
      widget: "Saved as widget to 'Company KPIs' dashboard"
    },
    {
      q: 'Which products sold the most last quarter?',
      sql: "SELECT p.name, SUM(oi.quantity) AS units_sold\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nWHERE oi.created_at >= now() - interval '3 months'\nGROUP BY p.name\nORDER BY units_sold DESC LIMIT 5;",
      chartTitle: 'Top products by units sold',
      chartMeta: '5 rows · bar chart (auto)',
      labels: ['Trail Pack','Aero Bottle','Flux Mat','Core Tee','Ridge Cap'],
      values: [88,71,64,52,40],
      widget: "Saved as widget to 'Sales' dashboard"
    },
    {
      q: 'How many new customers signed up each week?',
      sql: "SELECT date_trunc('week', created_at) AS week,\n       COUNT(*) AS signups\nFROM customers\nWHERE created_at >= now() - interval '8 weeks'\nGROUP BY 1 ORDER BY 1;",
      chartTitle: 'Weekly customer signups',
      chartMeta: '8 rows · bar chart (auto)',
      labels: ['W1','W2','W3','W4','W5','W6','W7','W8'],
      values: [30,42,38,55,61,58,74,82],
      widget: "Saved as widget to 'Growth' dashboard"
    }
  ];

  const STEP_LABELS = ['understand', 'generate sql', 'validate read-only', 'execute', 'chart'];
  const KEYWORDS = ['SELECT','FROM','WHERE','GROUP','ORDER','BY','JOIN','ON','AS','DESC','ASC','LIMIT','AND','OR','INTERVAL'];
  const FUNCS = ['date_trunc','sum','count','now','avg','min','max'];

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const highlight = (sql: string) => {
    const lines = sql.split('\n');
    return lines.map(line => {
      const toks = [];
      const re = /('[^']*'|\b\d+(?:\.\d+)?\b|\w+|[^\w\s]+|\s+)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        const t = m[0];
        let c = '#C9D6CC';
        if (t.startsWith("'")) c = '#E5C07B';
        else if (/^\d/.test(t)) c = '#D19A66';
        else if (KEYWORDS.includes(t.toUpperCase())) c = '#5EE08A';
        else if (FUNCS.includes(t.toLowerCase())) c = '#63B3ED';
        else if (/^[^\w\s]+$/.test(t)) c = '#7C8B80';
        toks.push({ t, c });
      }
      return { toks };
    });
  };

  const playExample = async (i: number, thenLoop: boolean) => {
    const token = ++runTokenRef.current;
    const ex = EXAMPLES[i];
    setExIdx(i);
    setTyped('');
    setPhase('typing');
    setStepIdx(-1);
    setShowSql(false);
    setShowChart(false);
    setGrown(false);
    setShowWidget(false);
    
    await delay(500); if (token !== runTokenRef.current) return;
    for (let c = 1; c <= ex.q.length; c++) {
      setTyped(ex.q.slice(0, c));
      await delay(26); if (token !== runTokenRef.current) return;
    }
    await delay(300); if (token !== runTokenRef.current) return;
    setPhase('pipeline');
    setStepIdx(0);
    
    await delay(700); if (token !== runTokenRef.current) return;
    setStepIdx(1);
    
    await delay(750); if (token !== runTokenRef.current) return;
    setShowSql(true);
    setStepIdx(2);
    
    await delay(1000); if (token !== runTokenRef.current) return;
    setStepIdx(3);
    
    await delay(800); if (token !== runTokenRef.current) return;
    setShowChart(true);
    setStepIdx(4);
    
    await delay(80); if (token !== runTokenRef.current) return;
    setGrown(true);
    
    await delay(1100); if (token !== runTokenRef.current) return;
    setStepIdx(5);
    setShowWidget(true);
    
    if (!thenLoop) return;
    await delay(4200); if (token !== runTokenRef.current) return;
    playExample((i + 1) % EXAMPLES.length, true);
  };

  const setFeat = (i: number) => {
    setFeatIdx(i);
    if (featIntRef.current) clearInterval(featIntRef.current);
    featIntRef.current = setInterval(() => {
      setFeatIdx(prev => (prev + 1) % FEATS.length);
    }, 5000);
  };

  useEffect(() => {
    let t = 'dark';
    try { t = localStorage.getItem('querywise.theme') || 'dark'; } catch(e) {}
    setTheme(t);
    document.documentElement.classList.toggle('dark', t !== 'light');

    playExample(0, true);

    featIntRef.current = setInterval(() => {
      setFeatIdx(prev => (prev + 1) % FEATS.length);
    }, 5000);

    ioRef.current = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('rv');
          ioRef.current.unobserve(en.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('[data-reveal]').forEach(el => ioRef.current.observe(el));

    return () => {
      runTokenRef.current++;
      if (ioRef.current) ioRef.current.disconnect();
      if (featIntRef.current) clearInterval(featIntRef.current);
    };
  }, []);

  const toggleTheme = () => {
    const t = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', t !== 'light');
    try { localStorage.setItem('querywise.theme', t); } catch (e) {}
    setTheme(t);
  };

  const ex = EXAMPLES[exIdx];

  const steps = STEP_LABELS.map((label, i) => {
    const done = stepIdx > i;
    const active = stepIdx === i;
    return {
      label,
      color: done ? 'var(--accent)' : (active ? 'var(--text)' : 'var(--faint)'),
      dot: done || active ? 'var(--accent)' : 'var(--border2)',
      anim: active ? 'qw-pulse 1s ease-in-out infinite' : 'none'
    };
  });

  const bars = ex.labels.map((label, i) => ({
    label,
    h: grown ? ex.values[i] + '%' : '3%'
  }));

  const examples = EXAMPLES.map((e, i) => ({
    q: e.q,
    onClick: () => playExample(i, true),
    bg: i === exIdx ? 'var(--accent-soft)' : 'var(--surface)',
    border: i === exIdx ? 'var(--accent-line)' : 'var(--border)',
    color: i === exIdx ? 'var(--accent)' : 'var(--muted)'
  }));

  const shotLabels = ['Chat', 'SQL', 'Chart', 'Dashboard', 'Connections', 'Shared'];
  const crumbs = [
    'querywise.app/chats — acme_analytics',
    'querywise.app/chats — generated query',
    'querywise.app/chats — visualization',
    'querywise.app/dashboards/company-kpis',
    'querywise.app/connections',
    'querywise.app/shared/x7f2-kq91-mv30 — public view'
  ];
  const shotTabs = shotLabels.map((label, i) => ({
    label,
    onClick: () => setShot(i),
    bg: i === shot ? 'var(--accent)' : 'var(--surface)',
    border: i === shot ? 'var(--accent)' : 'var(--border)',
    color: i === shot ? 'var(--accent-ink)' : 'var(--muted)'
  }));

  const cur = FEATS[featIdx];
  const feats = FEATS.map((f, i) => {
    const on = i === featIdx;
    return {
      icon: f.icon, title: f.title, tag: f.tag,
      onClick: () => setFeat(i),
      bg: on ? 'var(--accent-soft)' : 'var(--surface)',
      border: on ? 'var(--accent-line)' : 'var(--border)',
      accent: on ? 'var(--accent)' : 'transparent',
      iconBg: on ? 'var(--accent)' : 'var(--surface2)',
      titleColor: on ? 'var(--text)' : 'var(--muted)'
    };
  });

  const featCrumb = cur.crumb;
  const featHeadline = cur.headline;
  const featLine = cur.line;
  const featIs0 = featIdx === 0;
  const featIs1 = featIdx === 1;
  const featIs2 = featIdx === 2;
  const featIs3 = featIdx === 3;
  const featIs4 = featIdx === 4;
  const featIs5 = featIdx === 5;
  const featIs6 = featIdx === 6;
  
  const shotCrumb = crumbs[shot];
  const shotIs0 = shot === 0;
  const shotIs1 = shot === 1;
  const shotIs2 = shot === 2;
  const shotIs3 = shot === 3;
  const shotIs4 = shot === 4;
  const shotIs5 = shot === 5;

  const themeGlyph = theme === 'dark' ? '☀' : '☾';
  const caretOn = phase === 'typing';
  const showStatus = stepIdx >= 0;
  const sqlLines = highlight(ex.sql);
  const chartTitle = ex.chartTitle;
  const chartMeta = ex.chartMeta;
  const widgetMsg = ex.widget;

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      



<nav data-screen-label="Nav" style={{"position": "fixed", "top": "0", "left": "0", "right": "0", "zIndex": "50", "background": "var(--nav-bg)", "backdropFilter": "blur(14px)", "WebkitBackdropFilter": "blur(14px)", "borderBottom": "1px solid var(--border)"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto", "padding": "0 28px", "height": "64px", "display": "flex", "alignItems": "center", "gap": "28px"}}>
    <a href="#top" style={{"display": "flex", "alignItems": "center", "gap": "10px", "textDecoration": "none", "color": "var(--text)"}}>
      <img src="assets/logo.png" alt="QueryWise" style={{"width": "32px", "height": "32px", "objectFit": "contain"}} />
      <span style={{"fontWeight": "700", "fontSize": "18px", "letterSpacing": "-0.01em"}}>QueryWise</span>
    </a>
    <div style={{"display": "flex", "gap": "4px", "marginLeft": "auto", "alignItems": "center"}}>
      <a href="#features" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14.5px", "padding": "8px 12px", "borderRadius": "8px"}} className="hover-style-0">Features</a>
      <a href="#how" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14.5px", "padding": "8px 12px", "borderRadius": "8px"}} className="hover-style-1">How it works</a>
      <a href="#pricing" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14.5px", "padding": "8px 12px", "borderRadius": "8px"}} className="hover-style-2">Pricing</a>
      <a href="#faq" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14.5px", "padding": "8px 12px", "borderRadius": "8px"}} className="hover-style-3">FAQ</a>
    </div>
    <div style={{"display": "flex", "alignItems": "center", "gap": "12px"}}>
      <button onClick={toggleTheme} title="Toggle theme" style={{"width": "38px", "height": "38px", "borderRadius": "10px", "border": "1px solid var(--border)", "background": "transparent", "color": "var(--muted)", "fontSize": "16px", "cursor": "pointer", "display": "flex", "alignItems": "center", "justifyContent": "center"}} className="hover-style-4">{themeGlyph}</button>
      <a href="/sign-in" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14.5px", "padding": "8px 6px"}} className="hover-style-5">Sign in</a>
      <a href="/sign-up" style={{"background": "var(--accent)", "color": "var(--accent-ink)", "textDecoration": "none", "fontSize": "14.5px", "fontWeight": "600", "padding": "9px 18px", "borderRadius": "10px", "transition": "transform 0.15s ease,box-shadow 0.15s ease"}} className="hover-style-6">Start free</a>
    </div>
  </div>
</nav>


<header id="top" data-screen-label="Hero" style={{"position": "relative", "overflow": "hidden", "background": "var(--glow),var(--bg)", "padding": "150px 28px 90px"}}>
  <div style={{"position": "absolute", "inset": "0", "backgroundImage": "linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px)", "backgroundSize": "56px 56px", "maskImage": "radial-gradient(ellipse 70% 55% at 50% 0%,black 20%,transparent 75%)", "WebkitMaskImage": "radial-gradient(ellipse 70% 55% at 50% 0%,black 20%,transparent 75%)", "pointerEvents": "none"}}></div>
  <div style={{"position": "absolute", "top": "-120px", "left": "50%", "transform": "translateX(-50%)", "width": "640px", "height": "340px", "background": "radial-gradient(closest-side,var(--accent-soft),transparent)", "filter": "blur(40px)", "animation": "qw-float 9s ease-in-out infinite", "pointerEvents": "none"}}></div>
  <div style={{"position": "relative", "maxWidth": "1180px", "margin": "0 auto", "display": "flex", "flexDirection": "column", "alignItems": "center", "textAlign": "center"}}>
    <div style={{"display": "inline-flex", "alignItems": "center", "gap": "8px", "border": "1px solid var(--accent-line)", "background": "var(--accent-soft)", "color": "var(--accent)", "borderRadius": "999px", "padding": "6px 14px", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.06em"}}>
      <span style={{"width": "7px", "height": "7px", "borderRadius": "50%", "background": "var(--accent)", "animation": "qw-pulse 2.2s ease-in-out infinite"}}></span>
      NOW IN BETA · WORKS WITH POSTGRESQL
    </div>
    <h1 style={{"fontSize": "clamp(40px,5.6vw,74px)", "fontWeight": "700", "letterSpacing": "-0.03em", "lineHeight": "1.04", "margin": "26px 0 0", "maxWidth": "900px", "textWrap": "balance"}}>Your database speaks SQL.<br />You don't have to.</h1>
    <p style={{"fontSize": "clamp(16px,1.6vw,20px)", "lineHeight": "1.6", "color": "var(--muted)", "maxWidth": "640px", "margin": "22px 0 0", "textWrap": "pretty"}}>Ask questions in plain English. QueryWise writes safe, read-only SQL, picks the right chart, and turns answers into dashboards you can share with anyone.</p>
    <div style={{"display": "flex", "gap": "14px", "marginTop": "34px", "flexWrap": "wrap", "justifyContent": "center"}}>
      <a href="/sign-up" style={{"background": "var(--accent)", "color": "var(--accent-ink)", "textDecoration": "none", "fontSize": "16px", "fontWeight": "600", "padding": "14px 28px", "borderRadius": "12px", "transition": "transform 0.15s ease,box-shadow 0.15s ease"}} className="hover-style-7">Start free →</a>
      <a href="#how" style={{"border": "1px solid var(--border2)", "color": "var(--text)", "textDecoration": "none", "fontSize": "16px", "fontWeight": "500", "padding": "14px 28px", "borderRadius": "12px", "background": "var(--surface)", "transition": "transform 0.15s ease"}} className="hover-style-8">See how it works</a>
    </div>
    <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--faint)", "margin": "18px 0 0"}}>No credit card · Connect a demo database in 30 seconds</p>

    
    <div data-screen-label="Hero mockup" style={{"width": "100%", "maxWidth": "880px", "marginTop": "64px", "textAlign": "left"}}>
      <div style={{"display": "flex", "gap": "10px", "flexWrap": "wrap", "justifyContent": "center", "marginBottom": "18px"}}>
        {examples.map((ex, i) => (
<React.Fragment key={i}>

          <button onClick={ex.onClick} style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "padding": "8px 14px", "borderRadius": "999px", "cursor": "pointer", "background": "{ex.bg}", "border": "1px solid {ex.border}", "color": "{ex.color}", "transition": "all 0.2s ease"}} className="hover-style-9">{ex.q}</button>
        
</React.Fragment>
))}
      </div>
      <div style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "18px", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
        <div style={{"display": "flex", "alignItems": "center", "gap": "8px", "padding": "13px 18px", "borderBottom": "1px solid var(--border)", "background": "var(--surface2)"}}>
          <span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "#F26D6D"}}></span>
          <span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "#F2C36D"}}></span>
          <span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "#5FCB7E"}}></span>
          <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--faint)", "marginLeft": "10px"}}>querywise.app — acme_analytics (read-only)</span>
        </div>
        <div style={{"padding": "26px 26px 30px", "display": "flex", "flexDirection": "column", "gap": "18px", "height": "690px", "boxSizing": "border-box", "justifyContent": "flex-start"}}>
          
          <div style={{"display": "flex", "justifyContent": "flex-end"}}>
            <div style={{"background": "var(--accent-soft)", "border": "1px solid var(--accent-line)", "color": "var(--text)", "borderRadius": "14px 14px 4px 14px", "padding": "12px 18px", "fontSize": "15.5px", "maxWidth": "80%", "minHeight": "22px"}}>{typed}{caretOn && (
<React.Fragment>
<span style={{"display": "inline-block", "width": "2px", "height": "16px", "background": "var(--accent)", "marginLeft": "2px", "verticalAlign": "-2px", "animation": "qw-blink 0.9s step-end infinite"}}></span>
</React.Fragment>
)}</div>
          </div>
          
          {showStatus && (
<React.Fragment>

            <div style={{"display": "flex", "gap": "18px", "flexWrap": "wrap", "alignItems": "center", "animation": "qw-fadeup 0.4s ease both"}}>
              {steps.map((st, i) => (
<React.Fragment key={i}>

                <span style={{"display": "inline-flex", "alignItems": "center", "gap": "7px", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "letterSpacing": "0.03em", "color": "{st.color}", "transition": "color 0.3s ease"}}>
                  <span style={{"width": "7px", "height": "7px", "borderRadius": "50%", "background": "{st.dot}", "animation": "{st.anim}", "transition": "background 0.3s ease"}}></span>{st.label}
                </span>
              
</React.Fragment>
))}
            </div>
          
</React.Fragment>
)}
          
          {showSql && (
<React.Fragment>

            <div style={{"background": "var(--code-bg)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "18px 20px", "animation": "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both"}}>
              <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "12px"}}>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "letterSpacing": "0.14em", "color": "#5F6F63"}}>GENERATED SQL</span>
                <span style={{fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", color: "#5EE08A", border: "1px solid rgba(94,224,138,0.3)", borderRadius: "999px", padding: "3px 10px"}}>✓ read-only</span>
              </div>
              {sqlLines.map((ln, i) => (
<React.Fragment key={i}>

                <div style={{fontFamily: "'JetBrains Mono',monospace", fontSize: "13px", lineHeight: "1.75", whiteSpace: "pre-wrap"}}>{ln.toks.map((tok, i) => (
<React.Fragment key={i}>
<span style={{color: tok.c}}>{tok.t}</span>
</React.Fragment>
))}</div>
              
</React.Fragment>
))}
            </div>
          
</React.Fragment>
)}
          
          {showChart && (
<React.Fragment>

            <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "20px 22px", "animation": "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both"}}>
              <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "baseline", "marginBottom": "16px"}}>
                <span style={{"fontSize": "14px", "fontWeight": "600"}}>{chartTitle}</span>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--faint)"}}>{chartMeta}</span>
              </div>
              <div style={{"display": "flex", "alignItems": "flex-end", "gap": "8px", "height": "150px"}}>
                {bars.map((bar, i) => (
<React.Fragment key={i}>

                  <div style={{"flex": "1", "display": "flex", "flexDirection": "column", "justifyContent": "flex-end", "height": "100%", "gap": "6px"}}>
                    <div style={{"height": "{bar.h}", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "5px 5px 2px 2px", "transition": "height 0.9s cubic-bezier(0.2,0.7,0.2,1)", "minHeight": "3px"}}></div>
                    <div style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "9.5px", "color": "var(--faint)", "textAlign": "center", "overflow": "hidden", "textOverflow": "ellipsis", "whiteSpace": "nowrap"}}>{bar.label}</div>
                  </div>
                
</React.Fragment>
))}
              </div>
            </div>
          
</React.Fragment>
)}
          
          {showWidget && (
<React.Fragment>

            <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "background": "var(--accent-soft)", "border": "1px solid var(--accent-line)", "borderRadius": "12px", "padding": "13px 18px", "animation": "qw-pop 0.45s cubic-bezier(0.2,0.7,0.3,1) both"}}>
              <span style={{"width": "26px", "height": "26px", "borderRadius": "8px", "background": "var(--accent)", "color": "var(--accent-ink)", "display": "inline-flex", "alignItems": "center", "justifyContent": "center", "fontWeight": "700", "fontSize": "14px", "flexShrink": "0"}}>✓</span>
              <span style={{"fontSize": "14px", "color": "var(--text)"}}>{widgetMsg}</span>
              <span style={{"marginLeft": "auto", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--accent)", "whiteSpace": "nowrap"}}>↻ auto-refresh on</span>
            </div>
          
</React.Fragment>
)}
        </div>
      </div>
    </div>
  </div>
</header>


<section data-screen-label="Trusted by" style={{"borderTop": "1px solid var(--border)", "borderBottom": "1px solid var(--border)", "background": "var(--bg2)", "padding": "34px 0", "overflow": "hidden"}}>
  <p style={{"textAlign": "center", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "letterSpacing": "0.18em", "color": "var(--faint)", "margin": "0 0 22px"}}>TRUSTED BY DATA TEAMS AT</p>
  <div style={{"overflow": "hidden", "maskImage": "linear-gradient(90deg,transparent,black 12%,black 88%,transparent)", "WebkitMaskImage": "linear-gradient(90deg,transparent,black 12%,black 88%,transparent)"}}>
    <div style={{"display": "flex", "gap": "72px", "width": "max-content", "animation": "qw-marquee 30s linear infinite", "alignItems": "center"}}>
      <span style={{"fontWeight": "700", "fontSize": "19px", "color": "var(--muted)", "letterSpacing": "-0.01em"}}>Datacove</span>
      <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "17px", "color": "var(--muted)"}}>helios_labs</span>
      <span style={{"fontWeight": "600", "fontSize": "19px", "color": "var(--muted)", "letterSpacing": "0.12em"}}>LUMENLY</span>
      <span style={{"fontWeight": "700", "fontSize": "19px", "color": "var(--muted)", "fontStyle": "italic"}}>Quantia</span>
      <span style={{"fontWeight": "600", "fontSize": "19px", "color": "var(--muted)"}}>Marlowe &amp; Co</span>
      <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "17px", "color": "var(--muted)", "letterSpacing": "0.08em"}}>FERNBROOK</span>
      <span style={{"fontWeight": "700", "fontSize": "19px", "color": "var(--muted)"}}>Vantage Iron</span>
      <span style={{"fontWeight": "600", "fontSize": "19px", "color": "var(--muted)", "letterSpacing": "0.06em"}}>Ostrella</span>
      <span style={{"fontWeight": "700", "fontSize": "19px", "color": "var(--muted)", "letterSpacing": "-0.01em"}}>Datacove</span>
      <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "17px", "color": "var(--muted)"}}>helios_labs</span>
      <span style={{"fontWeight": "600", "fontSize": "19px", "color": "var(--muted)", "letterSpacing": "0.12em"}}>LUMENLY</span>
      <span style={{"fontWeight": "700", "fontSize": "19px", "color": "var(--muted)", "fontStyle": "italic"}}>Quantia</span>
      <span style={{"fontWeight": "600", "fontSize": "19px", "color": "var(--muted)"}}>Marlowe &amp; Co</span>
      <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "17px", "color": "var(--muted)", "letterSpacing": "0.08em"}}>FERNBROOK</span>
      <span style={{"fontWeight": "700", "fontSize": "19px", "color": "var(--muted)"}}>Vantage Iron</span>
      <span style={{"fontWeight": "600", "fontSize": "19px", "color": "var(--muted)", "letterSpacing": "0.06em"}}>Ostrella</span>
    </div>
  </div>
</section>


<FeaturesJourney />


<section id="how" data-screen-label="How it works" style={{"padding": "110px 28px", "background": "var(--bg2)", "borderTop": "1px solid var(--border)", "borderBottom": "1px solid var(--border)"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto"}}>
    <div data-reveal style={{"maxWidth": "640px"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>HOW IT WORKS</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>From connection string to shared dashboard</h2>
    </div>
    <div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(320px,1fr))", "gap": "0 60px", "marginTop": "56px"}}>
      <div style={{"display": "flex", "flexDirection": "column"}}>
        <div data-reveal style={{"display": "flex", "gap": "20px", "padding": "22px 0", "borderBottom": "1px dashed var(--border2)"}}>
          <div style={{"flexShrink": "0", "width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--surface)", "border": "1px solid var(--accent-line)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "15px"}}>01</div>
          <div><h3 style={{"fontSize": "18px", "fontWeight": "600", "margin": "0 0 6px"}}>Connect your database</h3><p style={{"fontSize": "14.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>Paste a read-only PostgreSQL connection string. Schema syncs automatically in the background.</p></div>
        </div>
        <div data-reveal style={{"display": "flex", "gap": "20px", "padding": "22px 0", "borderBottom": "1px dashed var(--border2)", "transitionDelay": "0.08s"}}>
          <div style={{"flexShrink": "0", "width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--surface)", "border": "1px solid var(--accent-line)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "15px"}}>02</div>
          <div><h3 style={{"fontSize": "18px", "fontWeight": "600", "margin": "0 0 6px"}}>Ask a question</h3><p style={{"fontSize": "14.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>Type it like you'd say it out loud. Follow-ups keep the context of the conversation.</p></div>
        </div>
        <div data-reveal style={{"display": "flex", "gap": "20px", "padding": "22px 0", "transitionDelay": "0.16s"}}>
          <div style={{"flexShrink": "0", "width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--surface)", "border": "1px solid var(--accent-line)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "15px"}}>03</div>
          <div><h3 style={{"fontSize": "18px", "fontWeight": "600", "margin": "0 0 6px"}}>AI generates the SQL</h3><p style={{"fontSize": "14.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>Relevant tables are retrieved, a query is planned and written — then shown and explained to you.</p></div>
        </div>
      </div>
      <div style={{"display": "flex", "flexDirection": "column"}}>
        <div data-reveal style={{"display": "flex", "gap": "20px", "padding": "22px 0", "borderBottom": "1px dashed var(--border2)", "transitionDelay": "0.24s"}}>
          <div style={{"flexShrink": "0", "width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--surface)", "border": "1px solid var(--accent-line)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "15px"}}>04</div>
          <div><h3 style={{"fontSize": "18px", "fontWeight": "600", "margin": "0 0 6px"}}>Execute safely</h3><p style={{"fontSize": "14.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>Single statement, read-only, bounded results — enforced before a single row is touched.</p></div>
        </div>
        <div data-reveal style={{"display": "flex", "gap": "20px", "padding": "22px 0", "borderBottom": "1px dashed var(--border2)", "transitionDelay": "0.32s"}}>
          <div style={{"flexShrink": "0", "width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--surface)", "border": "1px solid var(--accent-line)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "15px"}}>05</div>
          <div><h3 style={{"fontSize": "18px", "fontWeight": "600", "margin": "0 0 6px"}}>Charts appear</h3><p style={{"fontSize": "14.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>The right visualization is picked from the shape of your data. Override it anytime.</p></div>
        </div>
        <div data-reveal style={{"display": "flex", "gap": "20px", "padding": "22px 0", "transitionDelay": "0.4s"}}>
          <div style={{"flexShrink": "0", "width": "44px", "height": "44px", "borderRadius": "50%", "background": "var(--accent)", "border": "1px solid var(--accent)", "color": "var(--accent-ink)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontFamily": "'JetBrains Mono',monospace", "fontWeight": "600", "fontSize": "15px"}}>06</div>
          <div><h3 style={{"fontSize": "18px", "fontWeight": "600", "margin": "0 0 6px"}}>Save &amp; share</h3><p style={{"fontSize": "14.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>Pin results to dashboards, then share with a secure public link — password optional, data always live.</p></div>
        </div>
      </div>
    </div>
  </div>
</section>


<section data-screen-label="Demo" style={{"padding": "110px 28px", "background": "var(--bg)"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto"}}>
    <div data-reveal style={{"maxWidth": "640px", "margin": "0 auto", "textAlign": "center"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>PRODUCT DEMO</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>Watch a question become a dashboard</h2>
    </div>
    <div data-reveal style={{"maxWidth": "960px", "margin": "48px auto 0", "position": "relative", "borderRadius": "20px", "overflow": "hidden", "border": "1px solid var(--border)", "boxShadow": "var(--shadow)", "background": "var(--surface)"}}>
      <div style={{"display": "flex", "alignItems": "center", "gap": "8px", "padding": "13px 18px", "borderBottom": "1px solid var(--border)", "background": "var(--surface2)"}}>
        <span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "#F26D6D"}}></span>
        <span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "#F2C36D"}}></span>
        <span style={{"width": "11px", "height": "11px", "borderRadius": "50%", "background": "#5FCB7E"}}></span>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--faint)", "marginLeft": "10px"}}>Company KPIs — dashboard</span>
      </div>
      <div style={{"padding": "24px", "display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "16px", "aspectRatio": "16/8"}}>
        <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "18px", "display": "flex", "flexDirection": "column"}}>
          <span style={{"fontSize": "13px", "fontWeight": "600", "marginBottom": "4px"}}>Monthly revenue</span>
          <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--faint)", "marginBottom": "auto"}}>last 12 months</span>
          <div style={{"display": "flex", "alignItems": "flex-end", "gap": "4px", "height": "55%"}}>
            <div style={{"flex": "1", "height": "34%", "background": "var(--accent)", "opacity": "0.45", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out infinite"}}></div>
            <div style={{"flex": "1", "height": "44%", "background": "var(--accent)", "opacity": "0.5", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 0.15s infinite"}}></div>
            <div style={{"flex": "1", "height": "39%", "background": "var(--accent)", "opacity": "0.5", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 0.3s infinite"}}></div>
            <div style={{"flex": "1", "height": "55%", "background": "var(--accent)", "opacity": "0.6", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 0.45s infinite"}}></div>
            <div style={{"flex": "1", "height": "50%", "background": "var(--accent)", "opacity": "0.6", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 0.6s infinite"}}></div>
            <div style={{"flex": "1", "height": "62%", "background": "var(--accent)", "opacity": "0.7", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 0.75s infinite"}}></div>
            <div style={{"flex": "1", "height": "58%", "background": "var(--accent)", "opacity": "0.7", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 0.9s infinite"}}></div>
            <div style={{"flex": "1", "height": "68%", "background": "var(--accent)", "opacity": "0.8", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 1.05s infinite"}}></div>
            <div style={{"flex": "1", "height": "64%", "background": "var(--accent)", "opacity": "0.8", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 1.2s infinite"}}></div>
            <div style={{"flex": "1", "height": "76%", "background": "var(--accent)", "opacity": "0.9", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 1.35s infinite"}}></div>
            <div style={{"flex": "1", "height": "72%", "background": "var(--accent)", "opacity": "0.9", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 1.5s infinite"}}></div>
            <div style={{"flex": "1", "height": "88%", "background": "var(--accent)", "borderRadius": "3px", "animation": "qw-breathe 4s ease-in-out 1.65s infinite"}}></div>
          </div>
        </div>
        <div style={{"display": "grid", "gridTemplateRows": "1fr 1fr", "gap": "16px"}}>
          <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "18px", "display": "flex", "flexDirection": "column", "justifyContent": "space-between"}}>
            <span style={{"fontSize": "13px", "fontWeight": "600"}}>New customers this week</span>
            <div style={{"display": "flex", "alignItems": "baseline", "gap": "10px"}}><span style={{"fontSize": "32px", "fontWeight": "700", "letterSpacing": "-0.02em"}}>1,284</span><span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--accent)"}}>▲ 12.4%</span></div>
          </div>
          <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "18px", "display": "flex", "flexDirection": "column", "justifyContent": "space-between"}}>
            <span style={{"fontSize": "13px", "fontWeight": "600"}}>Top products</span>
            <div style={{"display": "flex", "flexDirection": "column", "gap": "6px"}}>
              <div style={{"height": "8px", "borderRadius": "4px", "background": "linear-gradient(90deg,var(--accent) 82%,var(--border) 82%)"}}></div>
              <div style={{"height": "8px", "borderRadius": "4px", "background": "linear-gradient(90deg,var(--accent) 64%,var(--border) 64%)", "opacity": "0.75"}}></div>
              <div style={{"height": "8px", "borderRadius": "4px", "background": "linear-gradient(90deg,var(--accent) 47%,var(--border) 47%)", "opacity": "0.5"}}></div>
            </div>
          </div>
        </div>
      </div>
      <div style={{"position": "absolute", "inset": "0", "display": "flex", "flexDirection": "column", "alignItems": "center", "justifyContent": "center", "gap": "16px", "background": "linear-gradient(180deg,transparent,rgba(6,14,8,0.45))", "cursor": "pointer", "transition": "background 0.3s ease"}} className="hover-style-11">
        <div style={{"width": "78px", "height": "78px", "borderRadius": "50%", "background": "var(--accent)", "color": "var(--accent-ink)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontSize": "26px", "boxShadow": "0 18px 44px -10px var(--accent-line)", "transition": "transform 0.2s ease"}} className="hover-style-12">▶</div>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.1em", "color": "#EAF2EB", "background": "rgba(6,14,8,0.55)", "padding": "6px 14px", "borderRadius": "999px", "backdropFilter": "blur(6px)"}}>45-SECOND TOUR · VIDEO COMING SOON</span>
      </div>
    </div>
  </div>
</section>


<section data-screen-label="Comparison" style={{"padding": "110px 28px", "background": "var(--bg2)", "borderTop": "1px solid var(--border)", "borderBottom": "1px solid var(--border)"}}>
  <div style={{"maxWidth": "880px", "margin": "0 auto"}}>
    <div data-reveal style={{"textAlign": "center", "maxWidth": "600px", "margin": "0 auto"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>WHY QUERYWISE</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>BI tools make you learn them. QueryWise doesn't.</h2>
    </div>
    <div data-reveal style={{"marginTop": "48px", "border": "1px solid var(--border)", "borderRadius": "18px", "overflow": "hidden", "background": "var(--surface)"}}>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "16px 26px", "borderBottom": "1px solid var(--border)", "background": "var(--surface2)"}}>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "letterSpacing": "0.14em", "color": "var(--faint)"}}>CAPABILITY</span>
        <span style={{"fontSize": "14px", "fontWeight": "600", "color": "var(--muted)"}}>Traditional BI</span>
        <span style={{"fontSize": "14px", "fontWeight": "700", "color": "var(--accent)"}}>QueryWise</span>
      </div>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "15px 26px", "borderBottom": "1px solid var(--border)", "alignItems": "center"}}>
        <span style={{"fontSize": "15px"}}>Learning SQL</span><span style={{"fontSize": "14px", "color": "var(--muted)"}}>Required</span><span style={{"fontSize": "14px", "fontWeight": "600", "color": "var(--accent)"}}>Optional</span>
      </div>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "15px 26px", "borderBottom": "1px solid var(--border)", "alignItems": "center"}}>
        <span style={{"fontSize": "15px"}}>Natural language</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "rgba(242,109,109,0.12)", "color": "#F26D6D", "alignItems": "center", "justifyContent": "center", "fontSize": "12px"}}>✕</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "alignItems": "center", "justifyContent": "center", "fontSize": "13px", "fontWeight": "700"}}>✓</span>
      </div>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "15px 26px", "borderBottom": "1px solid var(--border)", "alignItems": "center"}}>
        <span style={{"fontSize": "15px"}}>Automatic charts</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "rgba(242,109,109,0.12)", "color": "#F26D6D", "alignItems": "center", "justifyContent": "center", "fontSize": "12px"}}>✕</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "alignItems": "center", "justifyContent": "center", "fontSize": "13px", "fontWeight": "700"}}>✓</span>
      </div>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "15px 26px", "borderBottom": "1px solid var(--border)", "alignItems": "center"}}>
        <span style={{"fontSize": "15px"}}>AI explanations</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "rgba(242,109,109,0.12)", "color": "#F26D6D", "alignItems": "center", "justifyContent": "center", "fontSize": "12px"}}>✕</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "alignItems": "center", "justifyContent": "center", "fontSize": "13px", "fontWeight": "700"}}>✓</span>
      </div>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "15px 26px", "borderBottom": "1px solid var(--border)", "alignItems": "center"}}>
        <span style={{"fontSize": "15px"}}>Public sharing</span><span style={{"fontSize": "14px", "color": "var(--muted)"}}>Limited</span><span style={{"display": "inline-flex", "width": "24px", "height": "24px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "alignItems": "center", "justifyContent": "center", "fontSize": "13px", "fontWeight": "700"}}>✓</span>
      </div>
      <div style={{"display": "grid", "gridTemplateColumns": "1.4fr 1fr 1fr", "padding": "15px 26px", "alignItems": "center"}}>
        <span style={{"fontSize": "15px"}}>Setup time</span><span style={{"fontSize": "14px", "color": "var(--muted)"}}>Hours–days</span><span style={{"fontSize": "14px", "fontWeight": "600", "color": "var(--accent)"}}>Minutes</span>
      </div>
    </div>
  </div>
</section>


<section data-screen-label="Use cases" style={{"padding": "110px 28px", "background": "var(--bg)"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto"}}>
    <div data-reveal style={{"maxWidth": "640px"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>USE CASES</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>One question away, whatever the team</h2>
    </div>
    <div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(300px,1fr))", "gap": "18px", "marginTop": "52px"}}>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "26px", "transition": "transform 0.25s ease,border-color 0.25s ease"}} className="hover-style-13">
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginBottom": "10px"}}><span style={{"fontSize": "20px"}}>📈</span><h3 style={{"fontSize": "17px", "fontWeight": "600", "margin": "0"}}>Sales analytics</h3></div>
        <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>"How did each region perform against quota this quarter?"</p>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "26px", "transition": "transform 0.25s ease,border-color 0.25s ease", "transitionDelay": "0.06s"}} className="hover-style-14">
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginBottom": "10px"}}><span style={{"fontSize": "20px"}}>👥</span><h3 style={{"fontSize": "17px", "fontWeight": "600", "margin": "0"}}>Customer insights</h3></div>
        <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>"Which customers are at risk of churning this month?"</p>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "26px", "transition": "transform 0.25s ease,border-color 0.25s ease", "transitionDelay": "0.12s"}} className="hover-style-15">
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginBottom": "10px"}}><span style={{"fontSize": "20px"}}>📦</span><h3 style={{"fontSize": "17px", "fontWeight": "600", "margin": "0"}}>Inventory</h3></div>
        <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>"What's running low in the warehouse right now?"</p>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "26px", "transition": "transform 0.25s ease,border-color 0.25s ease"}} className="hover-style-16">
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginBottom": "10px"}}><span style={{"fontSize": "20px"}}>💰</span><h3 style={{"fontSize": "17px", "fontWeight": "600", "margin": "0"}}>Finance</h3></div>
        <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>"Show gross margin by product line, month over month."</p>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "26px", "transition": "transform 0.25s ease,border-color 0.25s ease", "transitionDelay": "0.06s"}} className="hover-style-17">
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginBottom": "10px"}}><span style={{"fontSize": "20px"}}>📊</span><h3 style={{"fontSize": "17px", "fontWeight": "600", "margin": "0"}}>Marketing</h3></div>
        <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>"Which campaign drove the most signups per dollar?"</p>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "26px", "transition": "transform 0.25s ease,border-color 0.25s ease", "transitionDelay": "0.12s"}} className="hover-style-18">
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginBottom": "10px"}}><span style={{"fontSize": "20px"}}>🚚</span><h3 style={{"fontSize": "17px", "fontWeight": "600", "margin": "0"}}>Operations</h3></div>
        <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "0"}}>"What's our average delivery time by city this week?"</p>
      </div>
    </div>
  </div>
</section>


<section data-screen-label="Screenshots" style={{"padding": "110px 28px", "background": "var(--bg2)", "borderTop": "1px solid var(--border)", "borderBottom": "1px solid var(--border)"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto"}}>
    <div data-reveal style={{"maxWidth": "640px", "margin": "0 auto", "textAlign": "center"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>INSIDE THE APP</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>A workspace built around answers</h2>
    </div>
    <div data-reveal style={{"display": "flex", "gap": "8px", "justifyContent": "center", "flexWrap": "wrap", "marginTop": "44px"}}>
      {shotTabs.map((tab, i) => (
<React.Fragment key={i}>

        <button onClick={tab.onClick} style={{"fontSize": "14px", "fontWeight": "500", "padding": "9px 18px", "borderRadius": "999px", "cursor": "pointer", "background": "{tab.bg}", "border": "1px solid {tab.border}", "color": "{tab.color}", "transition": "all 0.2s ease"}} className="hover-style-19">{tab.label}</button>
      
</React.Fragment>
))}
    </div>
    <div data-reveal style={{"maxWidth": "960px", "margin": "28px auto 0", "background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "18px", "boxShadow": "var(--shadow)", "overflow": "hidden"}}>
      <div style={{"display": "flex", "alignItems": "center", "gap": "8px", "padding": "12px 18px", "borderBottom": "1px solid var(--border)", "background": "var(--surface2)"}}>
        <span style={{"width": "10px", "height": "10px", "borderRadius": "50%", "background": "#F26D6D"}}></span>
        <span style={{"width": "10px", "height": "10px", "borderRadius": "50%", "background": "#F2C36D"}}></span>
        <span style={{"width": "10px", "height": "10px", "borderRadius": "50%", "background": "#5FCB7E"}}></span>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "color": "var(--faint)", "marginLeft": "10px"}}>{shotCrumb}</span>
      </div>
      <div style={{"minHeight": "400px", "padding": "26px"}}>
        
        {shotIs0 && (
<React.Fragment>

          <div style={{"display": "flex", "flexDirection": "column", "gap": "14px", "maxWidth": "680px", "margin": "0 auto", "animation": "qw-fadeup 0.4s ease both"}}>
            <div style={{"alignSelf": "flex-end", "background": "var(--accent-soft)", "border": "1px solid var(--accent-line)", "borderRadius": "12px 12px 4px 12px", "padding": "11px 16px", "fontSize": "14px"}}>Compare revenue this quarter vs last quarter</div>
            <div style={{"alignSelf": "flex-start", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px 12px 12px 4px", "padding": "14px 18px", "fontSize": "14px", "color": "var(--muted)", "maxWidth": "85%"}}>Revenue is up <span style={{"color": "var(--accent)", "fontWeight": "600"}}>18.2%</span> quarter over quarter — $2.41M vs $2.04M. Growth was strongest in March.</div>
            <div style={{"alignSelf": "flex-start", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px 18px", "width": "85%"}}>
              <div style={{"display": "flex", "alignItems": "flex-end", "gap": "10px", "height": "90px"}}>
                <div style={{"flex": "1", "height": "52%", "background": "var(--border2)", "borderRadius": "4px"}}></div>
                <div style={{"flex": "1", "height": "48%", "background": "var(--border2)", "borderRadius": "4px"}}></div>
                <div style={{"flex": "1", "height": "58%", "background": "var(--border2)", "borderRadius": "4px"}}></div>
                <div style={{"flex": "1", "height": "64%", "background": "var(--accent)", "opacity": "0.7", "borderRadius": "4px"}}></div>
                <div style={{"flex": "1", "height": "72%", "background": "var(--accent)", "opacity": "0.85", "borderRadius": "4px"}}></div>
                <div style={{"flex": "1", "height": "86%", "background": "var(--accent)", "borderRadius": "4px"}}></div>
              </div>
              <div style={{"display": "flex", "gap": "14px", "marginTop": "12px"}}>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "10.5px", "color": "var(--faint)"}}>■ last quarter</span>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "10.5px", "color": "var(--accent)"}}>■ this quarter</span>
              </div>
            </div>
            <div style={{"display": "flex", "gap": "8px"}}>
              <span style={{"fontSize": "12.5px", "color": "var(--muted)", "border": "1px solid var(--border)", "borderRadius": "999px", "padding": "6px 13px"}}>View SQL</span>
              <span style={{"fontSize": "12.5px", "color": "var(--accent)", "border": "1px solid var(--accent-line)", "background": "var(--accent-soft)", "borderRadius": "999px", "padding": "6px 13px"}}>＋ Save to dashboard</span>
            </div>
          </div>
        
</React.Fragment>
)}
        
        {shotIs1 && (
<React.Fragment>

          <div style={{"background": "var(--code-bg)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "20px 22px", "maxWidth": "680px", "margin": "0 auto", "animation": "qw-fadeup 0.4s ease both"}}>
            <div style={{"display": "flex", "justifyContent": "space-between", "marginBottom": "14px"}}>
              <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "letterSpacing": "0.14em", "color": "#5F6F63"}}>GENERATED SQL · EXPLAINED</span>
              <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "#5EE08A"}}>✓ read-only · 1 statement</span>
            </div>
            <div style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "13px", "lineHeight": "1.85"}}>
              <div><span style={{"color": "#5F6F63"}}>1  </span><span style={{"color": "#5EE08A"}}>SELECT</span><span style={{"color": "#C9D6CC"}}> </span><span style={{"color": "#63B3ED"}}>date_trunc</span><span style={{"color": "#C9D6CC"}}>(</span><span style={{"color": "#E5C07B"}}>'quarter'</span><span style={{"color": "#C9D6CC"}}>, created_at) </span><span style={{"color": "#5EE08A"}}>AS</span><span style={{"color": "#C9D6CC"}}> qtr,</span></div>
              <div><span style={{"color": "#5F6F63"}}>2  </span><span style={{"color": "#C9D6CC"}}>       </span><span style={{"color": "#63B3ED"}}>SUM</span><span style={{"color": "#C9D6CC"}}>(total_amount) </span><span style={{"color": "#5EE08A"}}>AS</span><span style={{"color": "#C9D6CC"}}> revenue</span></div>
              <div><span style={{"color": "#5F6F63"}}>3  </span><span style={{"color": "#5EE08A"}}>FROM</span><span style={{"color": "#C9D6CC"}}> orders</span></div>
              <div><span style={{"color": "#5F6F63"}}>4  </span><span style={{"color": "#5EE08A"}}>WHERE</span><span style={{"color": "#C9D6CC"}}> created_at &gt;= </span><span style={{"color": "#63B3ED"}}>now</span><span style={{"color": "#C9D6CC"}}>() - </span><span style={{"color": "#5EE08A"}}>interval</span><span style={{"color": "#C9D6CC"}}> </span><span style={{"color": "#E5C07B"}}>'6 months'</span></div>
              <div><span style={{"color": "#5F6F63"}}>5  </span><span style={{"color": "#5EE08A"}}>GROUP BY</span><span style={{"color": "#C9D6CC"}}> </span><span style={{"color": "#D19A66"}}>1</span><span style={{"color": "#C9D6CC"}}> </span><span style={{"color": "#5EE08A"}}>ORDER BY</span><span style={{"color": "#C9D6CC"}}> </span><span style={{"color": "#D19A66"}}>1</span><span style={{"color": "#C9D6CC"}}>;</span></div>
            </div>
            <div style={{"marginTop": "16px", "borderTop": "1px solid rgba(255,255,255,0.08)", "paddingTop": "14px", "fontSize": "13.5px", "lineHeight": "1.6", "color": "#9AAA9E"}}>💡 This groups all orders from the last six months into quarters and totals the revenue for each — so you can compare them directly.</div>
          </div>
        
</React.Fragment>
)}
        
        {shotIs2 && (
<React.Fragment>

          <div style={{"maxWidth": "680px", "margin": "0 auto", "animation": "qw-fadeup 0.4s ease both"}}>
            <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "18px"}}>
              <span style={{"fontSize": "15px", "fontWeight": "600"}}>Revenue by month</span>
              <div style={{"display": "flex", "gap": "6px"}}>
                <span style={{"fontSize": "12px", "fontWeight": "600", "color": "var(--accent-ink)", "background": "var(--accent)", "borderRadius": "7px", "padding": "5px 12px"}}>Bar</span>
                <span style={{"fontSize": "12px", "color": "var(--muted)", "border": "1px solid var(--border)", "borderRadius": "7px", "padding": "5px 12px"}}>Line</span>
                <span style={{"fontSize": "12px", "color": "var(--muted)", "border": "1px solid var(--border)", "borderRadius": "7px", "padding": "5px 12px"}}>Pie</span>
                <span style={{"fontSize": "12px", "color": "var(--muted)", "border": "1px solid var(--border)", "borderRadius": "7px", "padding": "5px 12px"}}>Table</span>
              </div>
            </div>
            <div style={{"border": "1px solid var(--border)", "borderRadius": "12px", "padding": "22px", "background": "var(--surface2)"}}>
              <div style={{"display": "flex", "alignItems": "flex-end", "gap": "9px", "height": "190px", "borderBottom": "1px solid var(--border)", "paddingBottom": "2px"}}>
                <div style={{"flex": "1", "height": "38%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "46%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "41%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "57%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "51%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "66%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "60%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "74%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "69%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
                <div style={{"flex": "1", "height": "88%", "background": "linear-gradient(180deg,var(--accent-strong),var(--accent))", "borderRadius": "4px 4px 0 0"}}></div>
              </div>
              <div style={{"display": "flex", "justifyContent": "space-between", "marginTop": "8px", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "10px", "color": "var(--faint)"}}><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span></div>
            </div>
          </div>
        
</React.Fragment>
)}
        
        {shotIs3 && (
<React.Fragment>

          <div style={{"maxWidth": "760px", "margin": "0 auto", "animation": "qw-fadeup 0.4s ease both"}}>
            <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "16px"}}>
              <span style={{"fontSize": "15px", "fontWeight": "600"}}>Company KPIs</span>
              <div style={{"display": "flex", "gap": "8px"}}>
                <span style={{"fontSize": "12px", "color": "var(--muted)", "border": "1px solid var(--border)", "borderRadius": "7px", "padding": "5px 12px"}}>↻ Refresh all</span>
                <span style={{"fontSize": "12px", "fontWeight": "600", "color": "var(--accent-ink)", "background": "var(--accent)", "borderRadius": "7px", "padding": "5px 12px"}}>Share</span>
              </div>
            </div>
            <div style={{"display": "grid", "gridTemplateColumns": "repeat(3,1fr)", "gap": "12px"}}>
              <div style={{"gridColumn": "span 2", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px", "height": "150px", "display": "flex", "flexDirection": "column"}}>
                <span style={{"fontSize": "12.5px", "fontWeight": "600", "marginBottom": "auto"}}>Monthly revenue</span>
                <div style={{"display": "flex", "alignItems": "flex-end", "gap": "5px", "height": "60%"}}>
                  <div style={{"flex": "1", "height": "40%", "background": "var(--accent)", "opacity": "0.5", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "52%", "background": "var(--accent)", "opacity": "0.6", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "47%", "background": "var(--accent)", "opacity": "0.6", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "62%", "background": "var(--accent)", "opacity": "0.7", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "58%", "background": "var(--accent)", "opacity": "0.8", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "76%", "background": "var(--accent)", "borderRadius": "3px"}}></div>
                </div>
              </div>
              <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px", "height": "150px", "display": "flex", "flexDirection": "column", "justifyContent": "space-between"}}>
                <span style={{"fontSize": "12.5px", "fontWeight": "600"}}>Active users</span>
                <span style={{"fontSize": "28px", "fontWeight": "700"}}>8,412</span>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--accent)"}}>▲ 6.1% this week</span>
              </div>
              <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px", "height": "130px", "display": "flex", "flexDirection": "column", "justifyContent": "space-between"}}>
                <span style={{"fontSize": "12.5px", "fontWeight": "600"}}>Churn rate</span>
                <span style={{"fontSize": "28px", "fontWeight": "700"}}>1.8%</span>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--accent)"}}>▼ 0.3 pts</span>
              </div>
              <div style={{"gridColumn": "span 2", "background": "var(--surface2)", "border": "1px dashed var(--border2)", "borderRadius": "12px", "height": "130px", "display": "flex", "alignItems": "center", "justifyContent": "center", "color": "var(--faint)", "fontSize": "13px"}}>＋ drag any answer here to add a widget</div>
            </div>
          </div>
        
</React.Fragment>
)}
        
        {shotIs4 && (
<React.Fragment>

          <div style={{"maxWidth": "640px", "margin": "0 auto", "display": "flex", "flexDirection": "column", "gap": "12px", "animation": "qw-fadeup 0.4s ease both"}}>
            <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center", "marginBottom": "6px"}}>
              <span style={{"fontSize": "15px", "fontWeight": "600"}}>Connections</span>
              <span style={{"fontSize": "12px", "fontWeight": "600", "color": "var(--accent-ink)", "background": "var(--accent)", "borderRadius": "7px", "padding": "5px 12px"}}>＋ Add connection</span>
            </div>
            <div style={{"display": "flex", "alignItems": "center", "gap": "14px", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px 18px"}}>
              <span style={{"width": "38px", "height": "38px", "borderRadius": "10px", "background": "var(--accent-soft)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontSize": "17px"}}>🐘</span>
              <div style={{"display": "flex", "flexDirection": "column", "gap": "3px"}}><span style={{"fontSize": "14px", "fontWeight": "600"}}>production_db</span><span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "color": "var(--faint)"}}>db.acme.internal:5432 · 42 tables</span></div>
              <span style={{"marginLeft": "auto", "display": "inline-flex", "alignItems": "center", "gap": "6px", "fontSize": "12px", "color": "var(--accent)", "background": "var(--accent-soft)", "borderRadius": "999px", "padding": "5px 12px"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "var(--accent)"}}></span>connected</span>
            </div>
            <div style={{"display": "flex", "alignItems": "center", "gap": "14px", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px 18px"}}>
              <span style={{"width": "38px", "height": "38px", "borderRadius": "10px", "background": "var(--accent-soft)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontSize": "17px"}}>🐘</span>
              <div style={{"display": "flex", "flexDirection": "column", "gap": "3px"}}><span style={{"fontSize": "14px", "fontWeight": "600"}}>staging_db</span><span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "color": "var(--faint)"}}>staging.acme.internal:5432 · 42 tables</span></div>
              <span style={{"marginLeft": "auto", "display": "inline-flex", "alignItems": "center", "gap": "6px", "fontSize": "12px", "color": "var(--accent)", "background": "var(--accent-soft)", "borderRadius": "999px", "padding": "5px 12px"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "var(--accent)"}}></span>connected</span>
            </div>
            <div style={{"display": "flex", "alignItems": "center", "gap": "14px", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px 18px"}}>
              <span style={{"width": "38px", "height": "38px", "borderRadius": "10px", "background": "var(--accent-soft)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontSize": "17px"}}>🐘</span>
              <div style={{"display": "flex", "flexDirection": "column", "gap": "3px"}}><span style={{"fontSize": "14px", "fontWeight": "600"}}>dev_local</span><span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "color": "var(--faint)"}}>localhost:5432 · syncing schema…</span></div>
              <span style={{"marginLeft": "auto", "display": "inline-flex", "alignItems": "center", "gap": "6px", "fontSize": "12px", "color": "#F2C36D", "background": "rgba(242,195,109,0.12)", "borderRadius": "999px", "padding": "5px 12px"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "#F2C36D", "animation": "qw-pulse 1.6s ease-in-out infinite"}}></span>syncing</span>
            </div>
            <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "color": "var(--faint)", "margin": "4px 0 0"}}>credentials encrypted · schema embeddings synced by background worker</p>
          </div>
        
</React.Fragment>
)}
        
        {shotIs5 && (
<React.Fragment>

          <div style={{"maxWidth": "720px", "margin": "0 auto", "animation": "qw-fadeup 0.4s ease both"}}>
            <div style={{"display": "flex", "alignItems": "center", "gap": "10px", "background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "10px", "padding": "9px 16px", "marginBottom": "16px"}}>
              <span style={{"fontSize": "13px"}}>🔒</span>
              <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12.5px", "color": "var(--muted)"}}>querywise.app/shared/x7f2-kq91-mv30</span>
              <span style={{"marginLeft": "auto", "display": "inline-flex", "alignItems": "center", "gap": "6px", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--accent)"}}><span style={{"width": "6px", "height": "6px", "borderRadius": "50%", "background": "var(--accent)", "animation": "qw-pulse 1.8s ease-in-out infinite"}}></span>LIVE DATA</span>
            </div>
            <div style={{"display": "grid", "gridTemplateColumns": "1fr 1fr", "gap": "12px"}}>
              <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px", "height": "140px", "display": "flex", "flexDirection": "column"}}>
                <span style={{"fontSize": "12.5px", "fontWeight": "600", "marginBottom": "auto"}}>Weekly signups</span>
                <div style={{"display": "flex", "alignItems": "flex-end", "gap": "5px", "height": "60%"}}>
                  <div style={{"flex": "1", "height": "35%", "background": "var(--accent)", "opacity": "0.5", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "48%", "background": "var(--accent)", "opacity": "0.6", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "44%", "background": "var(--accent)", "opacity": "0.6", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "63%", "background": "var(--accent)", "opacity": "0.8", "borderRadius": "3px"}}></div>
                  <div style={{"flex": "1", "height": "78%", "background": "var(--accent)", "borderRadius": "3px"}}></div>
                </div>
              </div>
              <div style={{"background": "var(--surface2)", "border": "1px solid var(--border)", "borderRadius": "12px", "padding": "16px", "height": "140px", "display": "flex", "flexDirection": "column", "justifyContent": "space-between"}}>
                <span style={{"fontSize": "12.5px", "fontWeight": "600"}}>MRR</span>
                <span style={{"fontSize": "30px", "fontWeight": "700"}}>$84.2k</span>
                <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "color": "var(--accent)"}}>▲ 9.7% MoM</span>
              </div>
            </div>
            <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11.5px", "color": "var(--faint)", "margin": "14px 0 0", "textAlign": "center"}}>viewers see live results — never SQL, credentials, or internal IDs</p>
          </div>
        
</React.Fragment>
)}
      </div>
    </div>
    <p data-reveal style={{"textAlign": "center", "fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--faint)", "margin": "20px 0 0"}}>· illustrative mockups — real screenshots drop in here ·</p>
  </div>
</section>


<section data-screen-label="Testimonials" style={{"padding": "110px 28px", "background": "var(--bg)"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto"}}>
    <div data-reveal style={{"maxWidth": "640px"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>FROM THE BETA</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>Data teams ship answers, not tickets</h2>
    </div>
    <div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(300px,1fr))", "gap": "18px", "marginTop": "52px"}}>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "28px", "display": "flex", "flexDirection": "column", "gap": "20px"}}>
        <p style={{"fontSize": "16px", "lineHeight": "1.65", "margin": "0", "textWrap": "pretty"}}>"I stopped writing SQL for stakeholders. They ask QueryWise, I glance at the generated query, done. My backlog of 'quick data pulls' is gone."</p>
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginTop": "auto"}}>
          <span style={{"width": "40px", "height": "40px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontWeight": "700", "fontSize": "14px"}}>MC</span>
          <div><div style={{"fontSize": "14px", "fontWeight": "600"}}>Maya Chen</div><div style={{"fontSize": "12.5px", "color": "var(--faint)"}}>Head of Data · Datacove</div></div>
        </div>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "28px", "display": "flex", "flexDirection": "column", "gap": "20px", "transitionDelay": "0.08s"}}>
        <p style={{"fontSize": "16px", "lineHeight": "1.65", "margin": "0", "textWrap": "pretty"}}>"We shipped a customer-facing metrics page in one afternoon using public share links. Live data, password-protected, zero backend work."</p>
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginTop": "auto"}}>
          <span style={{"width": "40px", "height": "40px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontWeight": "700", "fontSize": "14px"}}>JF</span>
          <div><div style={{"fontSize": "14px", "fontWeight": "600"}}>Jonas Feld</div><div style={{"fontSize": "12.5px", "color": "var(--faint)"}}>CTO · Lumenly</div></div>
        </div>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "16px", "padding": "28px", "display": "flex", "flexDirection": "column", "gap": "20px", "transitionDelay": "0.16s"}}>
        <p style={{"fontSize": "16px", "lineHeight": "1.65", "margin": "0", "textWrap": "pretty"}}>"The read-only validation and encrypted credentials are what got it past our security review. The auto-charts are what got it past everyone else."</p>
        <div style={{"display": "flex", "alignItems": "center", "gap": "12px", "marginTop": "auto"}}>
          <span style={{"width": "40px", "height": "40px", "borderRadius": "50%", "background": "var(--accent-soft)", "color": "var(--accent)", "display": "flex", "alignItems": "center", "justifyContent": "center", "fontWeight": "700", "fontSize": "14px"}}>PN</span>
          <div><div style={{"fontSize": "14px", "fontWeight": "600"}}>Priya Nair</div><div style={{"fontSize": "12.5px", "color": "var(--faint)"}}>Platform Engineering · Helios Labs</div></div>
        </div>
      </div>
    </div>
  </div>
</section>


<section id="pricing" data-screen-label="Pricing" style={{"padding": "110px 28px", "background": "var(--bg2)", "borderTop": "1px solid var(--border)", "borderBottom": "1px solid var(--border)"}}>
  <div style={{"maxWidth": "1080px", "margin": "0 auto"}}>
    <div data-reveal style={{"maxWidth": "600px", "margin": "0 auto", "textAlign": "center"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>PRICING</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>Free while in beta</h2>
    </div>
    <div style={{"display": "grid", "gridTemplateColumns": "repeat(auto-fit,minmax(280px,1fr))", "gap": "18px", "marginTop": "52px", "alignItems": "stretch"}}>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--accent-line)", "borderRadius": "18px", "padding": "32px", "display": "flex", "flexDirection": "column", "boxShadow": "0 0 0 4px var(--accent-soft)"}}>
        <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center"}}><span style={{"fontSize": "17px", "fontWeight": "600"}}>Starter</span><span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "10.5px", "letterSpacing": "0.1em", "color": "var(--accent)", "border": "1px solid var(--accent-line)", "borderRadius": "999px", "padding": "4px 10px"}}>CURRENT</span></div>
        <div style={{"fontSize": "44px", "fontWeight": "700", "letterSpacing": "-0.03em", "margin": "18px 0 4px"}}>$0</div>
        <p style={{"fontSize": "13.5px", "color": "var(--faint)", "margin": "0 0 24px"}}>everything, free during beta</p>
        <div style={{"display": "flex", "flexDirection": "column", "gap": "11px", "marginBottom": "28px"}}>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--accent)", "fontWeight": "700"}}>✓</span>&nbsp; Multiple database connections</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--accent)", "fontWeight": "700"}}>✓</span>&nbsp; Unlimited questions &amp; conversations</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--accent)", "fontWeight": "700"}}>✓</span>&nbsp; Dashboards &amp; auto-refreshing widgets</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--accent)", "fontWeight": "700"}}>✓</span>&nbsp; Public share links with passwords</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--accent)", "fontWeight": "700"}}>✓</span>&nbsp; CSV / JSON / XLSX export</span>
        </div>
        <a href="/sign-up" style={{"marginTop": "auto", "textAlign": "center", "background": "var(--accent)", "color": "var(--accent-ink)", "textDecoration": "none", "fontSize": "15px", "fontWeight": "600", "padding": "13px 0", "borderRadius": "11px", "transition": "transform 0.15s ease"}} className="hover-style-20">Start free →</a>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "18px", "padding": "32px", "display": "flex", "flexDirection": "column", "transitionDelay": "0.08s"}}>
        <div style={{"display": "flex", "justifyContent": "space-between", "alignItems": "center"}}><span style={{"fontSize": "17px", "fontWeight": "600"}}>Professional</span><span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "10.5px", "letterSpacing": "0.1em", "color": "var(--faint)", "border": "1px solid var(--border)", "borderRadius": "999px", "padding": "4px 10px"}}>COMING SOON</span></div>
        <div style={{"fontSize": "44px", "fontWeight": "700", "letterSpacing": "-0.03em", "margin": "18px 0 4px", "color": "var(--muted)"}}>$—</div>
        <p style={{"fontSize": "13.5px", "color": "var(--faint)", "margin": "0 0 24px"}}>for teams that live in their data</p>
        <div style={{"display": "flex", "flexDirection": "column", "gap": "11px", "marginBottom": "28px"}}>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; Team workspaces &amp; roles</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; Scheduled dashboard refresh</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; Bring your own LLM API key</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; Priority support</span>
        </div>
        <a href="#faq" style={{"marginTop": "auto", "textAlign": "center", "border": "1px solid var(--border2)", "color": "var(--muted)", "textDecoration": "none", "fontSize": "15px", "fontWeight": "500", "padding": "13px 0", "borderRadius": "11px"}} className="hover-style-21">Join the waitlist</a>
      </div>
      <div data-reveal style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "18px", "padding": "32px", "display": "flex", "flexDirection": "column", "transitionDelay": "0.16s"}}>
        <span style={{"fontSize": "17px", "fontWeight": "600"}}>Enterprise</span>
        <div style={{"fontSize": "44px", "fontWeight": "700", "letterSpacing": "-0.03em", "margin": "18px 0 4px", "color": "var(--muted)"}}>Custom</div>
        <p style={{"fontSize": "13.5px", "color": "var(--faint)", "margin": "0 0 24px"}}>security &amp; scale, on your terms</p>
        <div style={{"display": "flex", "flexDirection": "column", "gap": "11px", "marginBottom": "28px"}}>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; SSO / SAML</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; Self-hosted deployment</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; Audit log exports &amp; retention</span>
          <span style={{"fontSize": "14.5px", "color": "var(--muted)"}}><span style={{"color": "var(--faint)"}}>＋</span>&nbsp; SLAs &amp; dedicated support</span>
        </div>
        <a href="mailto:hello@querywise.app" style={{"marginTop": "auto", "textAlign": "center", "border": "1px solid var(--border2)", "color": "var(--muted)", "textDecoration": "none", "fontSize": "15px", "fontWeight": "500", "padding": "13px 0", "borderRadius": "11px"}} className="hover-style-22">Contact sales</a>
      </div>
    </div>
  </div>
</section>


<section id="faq" data-screen-label="FAQ" style={{"padding": "110px 28px", "background": "var(--bg)"}}>
  <div style={{"maxWidth": "760px", "margin": "0 auto"}}>
    <div data-reveal style={{"textAlign": "center"}}>
      <p style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "letterSpacing": "0.18em", "color": "var(--accent)", "margin": "0 0 14px"}}>FAQ</p>
      <h2 style={{"fontSize": "clamp(30px,3.6vw,46px)", "fontWeight": "700", "letterSpacing": "-0.025em", "lineHeight": "1.1", "margin": "0"}}>Fair questions</h2>
    </div>
    <div data-reveal style={{"marginTop": "44px", "display": "flex", "flexDirection": "column", "gap": "12px"}}>
      <details style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "14px", "padding": "0 24px"}}>
        <summary style={{"cursor": "pointer", "fontSize": "16px", "fontWeight": "600", "padding": "19px 0", "display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "16px"}}>Does it modify my database?<span style={{"color": "var(--accent)", "fontSize": "18px", "flexShrink": "0"}}>＋</span></summary>
        <p style={{"fontSize": "15px", "lineHeight": "1.65", "color": "var(--muted)", "margin": "0", "padding": "0 0 20px"}}>Never. Every query is validated as a single read-only statement before it runs — writes, deletes, and schema changes are rejected outright. We also recommend connecting with a read-only database role for defense in depth.</p>
      </details>
      <details style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "14px", "padding": "0 24px"}}>
        <summary style={{"cursor": "pointer", "fontSize": "16px", "fontWeight": "600", "padding": "19px 0", "display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "16px"}}>Which databases are supported?<span style={{"color": "var(--accent)", "fontSize": "18px", "flexShrink": "0"}}>＋</span></summary>
        <p style={{"fontSize": "15px", "lineHeight": "1.65", "color": "var(--muted)", "margin": "0", "padding": "0 0 20px"}}>PostgreSQL today — including hosted providers like Neon, Supabase, RDS, and Cloud SQL. The adapter architecture is built for more engines; MySQL and SQL Server are on the roadmap.</p>
      </details>
      <details style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "14px", "padding": "0 24px"}}>
        <summary style={{"cursor": "pointer", "fontSize": "16px", "fontWeight": "600", "padding": "19px 0", "display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "16px"}}>Can I see the SQL it runs?<span style={{"color": "var(--accent)", "fontSize": "18px", "flexShrink": "0"}}>＋</span></summary>
        <p style={{"fontSize": "15px", "lineHeight": "1.65", "color": "var(--muted)", "margin": "0", "padding": "0 0 20px"}}>Always. Every answer includes the exact generated SQL plus a plain-English explanation of what it does. Nothing runs that you can't inspect.</p>
      </details>
      <details style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "14px", "padding": "0 24px"}}>
        <summary style={{"cursor": "pointer", "fontSize": "16px", "fontWeight": "600", "padding": "19px 0", "display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "16px"}}>Can I use my own AI API key?<span style={{"color": "var(--accent)", "fontSize": "18px", "flexShrink": "0"}}>＋</span></summary>
        <p style={{"fontSize": "15px", "lineHeight": "1.65", "color": "var(--muted)", "margin": "0", "padding": "0 0 20px"}}>Yes — choose your provider and model in settings. Groq, Google Gemini, and Anthropic are supported today.</p>
      </details>
      <details style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "14px", "padding": "0 24px"}}>
        <summary style={{"cursor": "pointer", "fontSize": "16px", "fontWeight": "600", "padding": "19px 0", "display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "16px"}}>Is my data sent to the AI?<span style={{"color": "var(--accent)", "fontSize": "18px", "flexShrink": "0"}}>＋</span></summary>
        <p style={{"fontSize": "15px", "lineHeight": "1.65", "color": "var(--muted)", "margin": "0", "padding": "0 0 20px"}}>Only your question and relevant schema metadata (table and column names, types, descriptions) are sent to generate SQL. Query results stay in your workspace, and your credentials never leave our servers — encrypted at rest.</p>
      </details>
      <details style={{"background": "var(--surface)", "border": "1px solid var(--border)", "borderRadius": "14px", "padding": "0 24px"}}>
        <summary style={{"cursor": "pointer", "fontSize": "16px", "fontWeight": "600", "padding": "19px 0", "display": "flex", "justifyContent": "space-between", "alignItems": "center", "gap": "16px"}}>How secure is QueryWise?<span style={{"color": "var(--accent)", "fontSize": "18px", "flexShrink": "0"}}>＋</span></summary>
        <p style={{"fontSize": "15px", "lineHeight": "1.65", "color": "var(--muted)", "margin": "0", "padding": "0 0 20px"}}>Credentials are encrypted server-side and never sent to the browser. Queries pass a strict read-only validation gate. Public shares run on a separate trust path with bounded results and never expose SQL, credentials, or internal IDs. Every sensitive action lands in an append-only audit log.</p>
      </details>
    </div>
  </div>
</section>


<section data-screen-label="Final CTA" style={{"position": "relative", "overflow": "hidden", "padding": "130px 28px", "background": "var(--bg2)", "borderTop": "1px solid var(--border)", "textAlign": "center"}}>
  <div style={{"position": "absolute", "bottom": "-160px", "left": "50%", "transform": "translateX(-50%)", "width": "700px", "height": "380px", "background": "radial-gradient(closest-side,var(--accent-soft),transparent)", "filter": "blur(40px)", "pointerEvents": "none"}}></div>
  <div data-reveal style={{"position": "relative", "maxWidth": "680px", "margin": "0 auto", "display": "flex", "flexDirection": "column", "alignItems": "center"}}>
    <img src="assets/logo.png" alt="" style={{"width": "56px", "height": "56px", "objectFit": "contain", "marginBottom": "24px"}} />
    <h2 style={{"fontSize": "clamp(32px,4.4vw,54px)", "fontWeight": "700", "letterSpacing": "-0.03em", "lineHeight": "1.08", "margin": "0", "textWrap": "balance"}}>Stop translating questions into SQL.</h2>
    <p style={{"fontSize": "17px", "lineHeight": "1.6", "color": "var(--muted)", "margin": "18px 0 0"}}>Connect a database and ask your first question in under a minute.</p>
    <div style={{"display": "flex", "gap": "14px", "marginTop": "32px", "flexWrap": "wrap", "justifyContent": "center"}}>
      <a href="/sign-up" style={{"background": "var(--accent)", "color": "var(--accent-ink)", "textDecoration": "none", "fontSize": "16px", "fontWeight": "600", "padding": "14px 30px", "borderRadius": "12px", "transition": "transform 0.15s ease,box-shadow 0.15s ease"}} className="hover-style-23">Start free →</a>
      <a href="#top" style={{"border": "1px solid var(--border2)", "color": "var(--text)", "textDecoration": "none", "fontSize": "16px", "fontWeight": "500", "padding": "14px 30px", "borderRadius": "12px", "background": "var(--surface)"}} className="hover-style-24">Replay the demo ↑</a>
    </div>
  </div>
</section>


<footer data-screen-label="Footer" style={{"background": "var(--bg)", "borderTop": "1px solid var(--border)", "padding": "54px 28px 40px"}}>
  <div style={{"maxWidth": "1180px", "margin": "0 auto", "display": "flex", "flexWrap": "wrap", "gap": "44px", "justifyContent": "space-between"}}>
    <div style={{"maxWidth": "280px"}}>
      <div style={{"display": "flex", "alignItems": "center", "gap": "10px", "marginBottom": "14px"}}>
        <img src="assets/logo.png" alt="QueryWise" style={{"width": "26px", "height": "26px", "objectFit": "contain"}} />
        <span style={{"fontWeight": "700", "fontSize": "16px"}}>QueryWise</span>
      </div>
      <p style={{"fontSize": "13.5px", "lineHeight": "1.6", "color": "var(--faint)", "margin": "0"}}>Conversational BI for PostgreSQL. Ask in English, get SQL, charts, and dashboards you can share.</p>
    </div>
    <div style={{"display": "flex", "gap": "60px", "flexWrap": "wrap"}}>
      <div style={{"display": "flex", "flexDirection": "column", "gap": "10px"}}>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "letterSpacing": "0.14em", "color": "var(--faint)", "marginBottom": "4px"}}>PRODUCT</span>
        <a href="#features" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-25">Features</a>
        <a href="#how" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-26">How it works</a>
        <a href="#pricing" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-27">Pricing</a>
      </div>
      <div style={{"display": "flex", "flexDirection": "column", "gap": "10px"}}>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "letterSpacing": "0.14em", "color": "var(--faint)", "marginBottom": "4px"}}>RESOURCES</span>
        <a href="#faq" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-28">FAQ</a>
        <a href="/docs" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-29">Docs</a>
        <a href="/changelog" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-30">Changelog</a>
      </div>
      <div style={{"display": "flex", "flexDirection": "column", "gap": "10px"}}>
        <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "11px", "letterSpacing": "0.14em", "color": "var(--faint)", "marginBottom": "4px"}}>COMPANY</span>
        <a href="mailto:hello@querywise.app" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-31">Contact</a>
        <a href="/privacy" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-32">Privacy</a>
        <a href="/terms" style={{"color": "var(--muted)", "textDecoration": "none", "fontSize": "14px"}} className="hover-style-33">Terms</a>
      </div>
    </div>
  </div>
  <div style={{"maxWidth": "1180px", "margin": "40px auto 0", "paddingTop": "22px", "borderTop": "1px solid var(--border)", "display": "flex", "justifyContent": "space-between", "flexWrap": "wrap", "gap": "12px"}}>
    <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--faint)"}}>© 2026 QueryWise</span>
    <span style={{"fontFamily": "'JetBrains Mono',monospace", "fontSize": "12px", "color": "var(--faint)"}}>read-only by design 🔒</span>
  </div>
</footer>

    </div>
  );
}
