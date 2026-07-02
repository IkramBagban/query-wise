'use client';
import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'motion/react';

const FEATS = [
  { id: 'chat', icon: '💬', title: 'Chat, not query', tag: 'natural language', crumb: 'querywise.app/chats', headline: 'Ask in plain English.', line: 'Follow-ups keep their context.' },
  { id: 'sql', icon: '⚡', title: 'See the SQL', tag: 'never a black box', crumb: 'generated query · explained', headline: 'Generated, explained, read-only.', line: 'Nothing runs you can’t inspect.' },
  { id: 'charts', icon: '📊', title: 'Charts, automatic', tag: 'zero config', crumb: 'visualization · auto-selected', headline: 'The right chart, picked for you.', line: 'From the shape of your data.' },
  { id: 'dashboards', icon: '📈', title: 'Live dashboards', tag: 'pin & refresh', crumb: 'dashboards/company-kpis', headline: 'Pin answers as widgets.', line: 'They refresh themselves.' },
  { id: 'sharing', icon: '🔗', title: 'Public sharing', tag: 'secure links', crumb: 'shared/x7f2 · public', headline: 'Share a link, live data.', line: 'Password optional. SQL never exposed.' },
  { id: 'security', icon: '🔒', title: 'Safe by default', tag: 'passes review', crumb: 'security', headline: 'Encrypted, read-only, audited.', line: 'Credentials never touch the browser.' },
  { id: 'connections', icon: '🗂', title: 'Every database', tag: 'one workspace', crumb: 'connections', headline: 'Dev, staging, prod.', line: 'All in one place, always synced.' }
];

export default function FeaturesJourney() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollableSegments = FEATS.length;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end']
  });

  useEffect(() => {
    return scrollYProgress.on('change', (v) => {
      let nextIndex = Math.round(v * scrollableSegments);
      if (nextIndex >= FEATS.length) nextIndex = FEATS.length - 1;
      if (nextIndex < 0) nextIndex = 0;
      setActiveIndex(nextIndex);
    });
  }, [scrollYProgress]);

  const fillEnd = (FEATS.length - 1) / scrollableSegments;
  const lineScaleY = useTransform(scrollYProgress, [0, fillEnd], ['0%', '100%']);

  const scrollToFeature = (index: number) => {
    if (!containerRef.current) return;
    const totalScrollHeight = containerRef.current.scrollHeight - window.innerHeight;
    const scrollTarget = containerRef.current.offsetTop + (totalScrollHeight * (index / scrollableSegments));
    window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
  };

  const cur = FEATS[activeIndex];

  return (
    <section id="features" data-screen-label="Features" style={{ background: 'var(--bg)' }}>
      <div ref={containerRef} style={{ height: '800vh', position: 'relative' }}>
        
        <div style={{ position: 'sticky', top: 0, height: '100vh', display: 'flex', flexDirection: 'column', padding: 'clamp(20px, 4vh, 60px) 28px', overflow: 'hidden' }}>
          <div style={{ maxWidth: '1180px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <div data-reveal style={{ maxWidth: '640px', flexShrink: 0 }}>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '0.18em', color: 'var(--accent)', margin: '0 0 clamp(6px, 1vh, 10px)' }}>FEATURES</p>
              <h2 style={{ fontSize: 'clamp(28px,3.2vw,40px)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, margin: 0 }}>
                From plain English to business insight.
              </h2>
            </div>
            
            <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'clamp(260px, 25vw, 290px) 1fr', gap: 'clamp(16px, 3vw, 32px)', marginTop: 'clamp(16px, 3vh, 30px)', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
              
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingBottom: '0' }}>
                <div style={{ position: 'absolute', left: 'clamp(22px, 3vh, 26px)', top: '26px', bottom: '26px', width: '2px', background: 'var(--border)' }} />
                
                <motion.div 
                  style={{ 
                    position: 'absolute', left: 'clamp(22px, 3vh, 26px)', top: '26px', bottom: '26px', width: '2px', 
                    background: 'var(--accent)', transformOrigin: 'top', height: lineScaleY 
                  }} 
                />

                {FEATS.map((f, i) => {
                  const on = i === activeIndex;
                  return (
                    <button 
                      key={i}
                      onClick={() => scrollToFeature(i)}
                      style={{ 
                        textAlign: 'left', display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1.5vh, 12px)', 
                        padding: 'clamp(6px, 1.2vh, 10px)', borderRadius: '12px', cursor: 'pointer',
                        background: on ? 'var(--surface2)' : 'rgba(0,0,0,0)',
                        position: 'relative',
                        zIndex: 1,
                        border: '1px solid',
                        borderColor: on ? 'var(--border)' : 'rgba(0,0,0,0)',
                        transition: 'background 0.2s ease, border-color 0.2s ease'
                      }}
                      className="hover-style-10"
                    >
                      <motion.div 
                        animate={{ 
                          backgroundColor: on ? 'var(--accent)' : 'var(--surface)',
                          borderColor: on ? 'var(--accent)' : 'var(--border)',
                          color: on ? 'var(--accent-ink)' : 'var(--text)'
                        }}
                        style={{ 
                          width: 'clamp(28px, 4vh, 32px)', height: 'clamp(28px, 4vh, 32px)', flexShrink: 0, borderRadius: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
                          border: '1px solid',
                          zIndex: 2,
                        }}
                      >
                        {f.icon}
                      </motion.div>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                        <motion.span animate={{ color: on ? 'var(--text)' : 'var(--muted)' }} style={{ fontSize: 'clamp(13px, 1.5vh, 14px)', fontWeight: 600 }}>{f.title}</motion.span>
                        <span style={{ fontSize: 'clamp(11px, 1.2vh, 11.5px)', color: 'var(--faint)', lineHeight: 1.3 }}>{f.tag}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              
              <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '18px', boxShadow: 'var(--shadow)', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F26D6D' }}></span>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F2C36D' }}></span>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#5FCB7E' }}></span>
                  <motion.span 
                    key={cur.crumb}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--faint)', marginLeft: '10px' }}
                  >
                    {cur.crumb}
                  </motion.span>
                </div>
                
                <div style={{ flex: 1, padding: 'clamp(16px, 3vh, 30px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                  
                  <motion.div
                    key={activeIndex + '-text'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    style={{ marginBottom: 'clamp(12px, 2vh, 20px)' }}
                  >
                    <p style={{ fontSize: '15px', lineHeight: 1.5, color: 'var(--muted)', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
                      <b style={{ color: 'var(--text)', fontWeight: 600 }}>{cur.headline}</b> {cur.line}
                    </p>
                  </motion.div>

                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeIndex}
                        initial={{ opacity: 0, x: 24, scale: 0.98 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -24, scale: 0.98 }}
                        transition={{ duration: 0.4, type: 'spring', bounce: 0 }}
                        style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                      >
                        {activeIndex === 0 && <ChatVisual />}
                        {activeIndex === 1 && <SqlVisual />}
                        {activeIndex === 2 && <ChartVisual />}
                        {activeIndex === 3 && <DashboardVisual />}
                        {activeIndex === 4 && <ShareVisual />}
                        {activeIndex === 5 && <SecurityVisual />}
                        {activeIndex === 6 && <ConnectionsVisual />}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ChatVisual() {
  const text = "last month's revenue";
  const [typed, setTyped] = useState("");
  
  useEffect(() => {
    let t = 0;
    const interval = setInterval(() => {
      setTyped(text.substring(0, t));
      t++;
      if (t > text.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '430px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ alignSelf: 'flex-start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '13px 13px 13px 4px', padding: '11px 16px', fontSize: '14px', color: 'var(--muted)', maxWidth: '85%' }}>
        Top seller: <b style={{ color: 'var(--text)', fontWeight: 600 }}>Trail Pack</b> — 4,210 units ↓
      </motion.div>
      <div style={{ alignSelf: 'flex-end', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: '13px 13px 4px 13px', padding: '11px 16px', fontSize: '14px', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: 'var(--text)' }}>Show me {typed}</span>
        <motion.span 
          animate={{ opacity: [1, 0] }}
          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
          style={{ display: 'inline-block', width: '2px', height: '16px', background: 'var(--accent)', marginLeft: '4px' }}
        />
      </div>
    </div>
  );
}

function SqlVisual() {
  const codeLines = [
    { t: "SELECT", c: "#5EE08A" }, { t: " p.name, ", c: "#C9D6CC" }, { t: "SUM", c: "#63B3ED" }, { t: "(oi.quantity)\n", c: "#C9D6CC" },
    { t: "FROM", c: "#5EE08A" }, { t: " order_items oi\n", c: "#C9D6CC" },
    { t: "JOIN", c: "#5EE08A" }, { t: " products p ", c: "#C9D6CC" }, { t: "ON", c: "#5EE08A" }, { t: " p.id = oi.product_id\n", c: "#C9D6CC" },
    { t: "GROUP BY", c: "#5EE08A" }, { t: " 1 ", c: "#C9D6CC" }, { t: "ORDER BY", c: "#5EE08A" }, { t: " 2 ", c: "#C9D6CC" }, { t: "DESC", c: "#5EE08A" }, { t: ";", c: "#C9D6CC" }
  ];
  
  return (
    <div style={{ width: '100%', maxWidth: '460px', background: 'var(--code-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: 'clamp(12px, 2vh, 20px) clamp(16px, 2vh, 22px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.14em', color: '#5F6F63' }}>GENERATED SQL</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', color: '#5EE08A', border: '1px solid rgba(94,224,138,0.3)', borderRadius: '999px', padding: '3px 10px' }}>✓ read-only</span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(11px, 1.5vh, 13px)', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
        {codeLines.map((tok, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1, duration: 0.2 }}
            style={{ color: tok.c }}
          >
            {tok.t}
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function ChartVisual() {
  const [chartType, setChartType] = useState(0); 
  
  useEffect(() => {
    const int = setInterval(() => {
      setChartType(p => (p + 1) % 4);
    }, 2000);
    return () => clearInterval(int);
  }, []);

  const types = ['Bar', 'Line', 'Area', 'Pie'];

  return (
    <div style={{ width: '100%', maxWidth: '430px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '6px', marginBottom: 'clamp(16px, 3vh, 30px)' }}>
        {types.map((t, i) => (
          <motion.span
            key={t}
            animate={{ 
              backgroundColor: chartType === i ? 'var(--accent)' : 'rgba(0,0,0,0)',
              color: chartType === i ? 'var(--accent-ink)' : 'var(--muted)',
              borderColor: chartType === i ? 'rgba(0,0,0,0)' : 'var(--border)'
            }}
            style={{ fontSize: '12px', fontWeight: 600, border: '1px solid', borderRadius: '8px', padding: '5px 13px', transition: 'all 0.3s ease' }}
          >
            {t}
          </motion.span>
        ))}
      </div>
      
      <div style={{ height: 'clamp(120px, 18vh, 180px)', width: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={chartType}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.5 }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px' }}
          >
            {chartType === 0 && (
              <>
                {[38, 52, 44, 66, 58, 80, 72, 96].map((h, i) => (
                  <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i*0.05, type: 'spring' }} style={{ flex: 1, background: 'linear-gradient(180deg,var(--accent-strong),var(--accent))', borderRadius: '5px 5px 2px 2px' }} />
                ))}
              </>
            )}
            {chartType === 1 && (
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <motion.path 
                  d="M0,70 L15,50 L30,60 L45,30 L60,40 L75,10 L90,20 L100,5" 
                  fill="none" stroke="var(--accent)" strokeWidth="3" 
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }}
                />
              </svg>
            )}
            {chartType === 2 && (
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <motion.path 
                  d="M0,70 L15,50 L30,60 L45,30 L60,40 L75,10 L90,20 L100,5 L100,100 L0,100 Z" 
                  fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2"
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                />
              </svg>
            )}
            {chartType === 3 && (
              <svg width="clamp(100px, 14vh, 140px)" height="clamp(100px, 14vh, 140px)" viewBox="0 0 32 32">
                <motion.circle r="16" cx="16" cy="16" fill="var(--accent-soft)" />
                <motion.circle r="16" cx="16" cy="16" fill="transparent" stroke="var(--accent)" strokeWidth="32" strokeDasharray="60 100" initial={{ strokeDasharray: "0 100" }} animate={{ strokeDasharray: "60 100" }} transition={{ duration: 1 }} />
              </svg>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function DashboardVisual() {
  const [arranged, setArranged] = useState(false);
  
  useEffect(() => {
    const t = setTimeout(() => setArranged(true), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '440px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      
      <motion.div layout transition={{ type: 'spring', damping: 20 }} style={{ gridColumn: arranged ? 'span 2' : 'span 3', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '15px', height: '130px', display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, marginBottom: 'auto' }}>Monthly revenue</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '58%' }}>
          {[42,54,48,64,78].map((h,i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: 'var(--accent)', opacity: 0.5 + (i*0.1), borderRadius: '3px' }} />)}
        </div>
      </motion.div>
      
      <AnimatePresence>
        {arranged && (
          <motion.div initial={{ opacity: 0, scale: 0.5, y: -50 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', damping: 15 }} style={{ background: 'var(--surface2)', border: '1px solid var(--accent-line)', borderRadius: '12px', padding: '15px', height: '130px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 0 0 2px var(--accent)' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>New Widget</span>
            <span style={{ fontSize: '26px', fontWeight: 700 }}>24k</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout transition={{ type: 'spring', damping: 20 }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '15px', height: '96px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600 }}>Active users</span>
        <span style={{ fontSize: '26px', fontWeight: 700 }}>8,412</span>
      </motion.div>
      
      <motion.div layout transition={{ type: 'spring', damping: 20 }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '15px', height: '96px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600 }}>Churn</span>
        <span style={{ fontSize: '22px', fontWeight: 700 }}>1.8%</span>
      </motion.div>

      {!arranged && (
        <motion.div layout style={{ background: 'var(--surface2)', border: '1px dashed var(--border2)', borderRadius: '12px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: '12.5px' }}>
          ＋ drop here
        </motion.div>
      )}

    </div>
  );
}

function ShareVisual() {
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    const t1 = setTimeout(() => setCopied(true), 800);
    const t2 = setTimeout(() => setCopied(false), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); }
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <div style={{ position: 'relative' }}>
        <button style={{ background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: '999px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          🔗 Share Dashboard
        </button>
        <AnimatePresence>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.9 }}
              style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '12px', background: 'var(--surface2)', border: '1px solid var(--accent-line)', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', color: 'var(--text)', whiteSpace: 'nowrap', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 50 }}
            >
              <span style={{ color: 'var(--accent)' }}>✓</span> querywise.app/share/x7f2
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div style={{ width: '100%', height: '180px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', opacity: 0.5, marginTop: '20px' }} />
    </div>
  );
}

function SecurityVisual() {
  const steps = [
    { label: "Credentials enter", id: "cred" },
    { label: "Encrypting...", id: "enc" },
    { label: "Read-Only Validated ✓", id: "val" },
    { label: "Audit Logged ✓", id: "aud" }
  ];
  const [active, setActive] = useState(0);

  useEffect(() => {
    let curr = 0;
    const int = setInterval(() => {
      curr++;
      if (curr >= steps.length) clearInterval(int);
      else setActive(curr);
    }, 1200);
    return () => clearInterval(int);
  }, []);

  return (
    <div style={{ width: '100%', maxWidth: '380px', border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--surface2)', padding: '30px 24px' }}>
      {steps.map((step, i) => {
        const isDone = i <= active;
        const isCurr = i === active;
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: i === steps.length - 1 ? 0 : '24px' }}>
            <motion.div 
              animate={{ 
                background: isDone ? 'var(--accent)' : 'var(--surface)',
                borderColor: isDone ? 'var(--accent)' : 'var(--border)',
                scale: isCurr ? 1.1 : 1
              }}
              style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isDone && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ color: 'var(--accent-ink)', fontSize: '12px' }}>✓</motion.span>}
            </motion.div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <motion.span animate={{ color: isDone ? 'var(--text)' : 'var(--muted)' }} style={{ fontSize: '14px', fontWeight: 600 }}>
                {step.label}
              </motion.span>
              {isCurr && i === 1 && (
                <motion.div style={{ height: '4px', background: 'var(--surface)', borderRadius: '2px', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.1, ease: 'linear' }} style={{ height: '100%', background: 'var(--accent)' }} />
                </motion.div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectionsVisual() {
  return (
    <div style={{ width: '100%', maxWidth: '430px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '13px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
        <span style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>🐘</span>
        <span style={{ fontSize: '13.5px', fontWeight: 600 }}>production_db</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--accent)' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }}></span>connected</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '13px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
        <span style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>🐘</span>
        <span style={{ fontSize: '13.5px', fontWeight: 600 }}>staging_db</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--accent)' }}><span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }}></span>connected</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '13px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
        <span style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>🐘</span>
        <span style={{ fontSize: '13.5px', fontWeight: 600 }}>dev_local</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#F2C36D' }}><motion.span animate={{ opacity: [1, 0.4] }} transition={{ repeat: Infinity, duration: 0.8 }} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F2C36D' }}></motion.span>syncing</span>
      </div>
    </div>
  );
}
