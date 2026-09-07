"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const easing = [0.22, 1, 0.36, 1] as const;

function useRevealMotion() {
  const prefersReducedMotion = useReducedMotion();
  const reduced = prefersReducedMotion === true;

  return {
    reduced,
    initial: reduced ? false : { opacity: 0, y: 18 },
    transition: reduced ? { duration: 0 } : { duration: 0.55, ease: easing },
  };
}

export function MotionHero({ children }: { children: ReactNode }) {
  const { initial, transition } = useRevealMotion();

  return (
    <motion.section
      className="studio-hero"
      aria-labelledby="hero-title"
      initial={initial}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      {children}
    </motion.section>
  );
}

export function MotionLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  const reduced = useReducedMotion() === true;

  return (
    <motion.a
      href={href}
      className={className}
      whileHover={reduced ? undefined : { y: -2 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: easing }}
    >
      {children}
    </motion.a>
  );
}

export function MotionJourney({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  const { initial, transition } = useRevealMotion();

  return (
    <motion.div
      className="rental-journey"
      aria-label={ariaLabel}
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

export function MotionSection({
  children,
  className,
  id,
  labelledBy,
}: {
  children: ReactNode;
  className: string;
  id: string;
  labelledBy: string;
}) {
  const { initial, transition } = useRevealMotion();

  return (
    <motion.section
      id={id}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      className={className}
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={transition}
    >
      {children}
    </motion.section>
  );
}

export function MotionPlatformCard({
  children,
  index,
}: {
  children: ReactNode;
  index: number;
}) {
  const { reduced, initial, transition } = useRevealMotion();

  return (
    <motion.article
      className="platform-area"
      initial={initial}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={reduced ? undefined : { y: -4 }}
      viewport={{ once: true, amount: 0.24 }}
      transition={reduced ? transition : { ...transition, delay: index * 0.07 }}
    >
      {children}
    </motion.article>
  );
}
