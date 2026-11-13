import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

export function Grain() {
  return <div className="grain" aria-hidden />;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return <motion.div className="scroll-progress" style={{ scaleX }} />;
}

const links = [
  ['Agent', '#agent'],
  ['Brief', '#planner'],
  ['Scan', '#scan'],
  ['Weights', '#weightlab'],
  ['Campaign', '#campaign'],
  ['Travel', '#travel'],
  ['Model', '#model'],
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-inner">
        <a href="#top" className="logo" aria-label="Odyssey home">
          <span className="logo-mark" />
          <span className="logo-word">ODYSSEY</span>
        </a>
        <nav className="nav-links">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="nav-link">{label}</a>
          ))}
        </nav>
        <a href="#planner" className="btn nav-cta" style={{ zIndex: 1 }}>
          Open planner <span className="arrow">↗</span>
        </a>
        <button
          className="btn nav-cta nav-mobile"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open ? (
        <div
          style={{
            position: 'absolute', top: 74, left: 0, right: 0,
            background: '#030507', borderBottom: '1px solid var(--line)',
            padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18,
          }}
        >
          {links.map(([label, href]) => (
            <a key={href} href={href} className="nav-link" onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </div>
      ) : null}
    </header>
  );
}
