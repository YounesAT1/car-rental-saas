"use client";

import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Pinned remote SVGs from Simple Icons; no logo asset installation is required.
const brands = [
  { name: "Mercedes-Benz", slug: "amg" },
  { name: "Renault", slug: "renault" },
  { name: "Volkswagen", slug: "volkswagen" },
  { name: "Toyota", slug: "toyota" },
  { name: "BMW", slug: "bmw" },
  { name: "Audi", slug: "audi" },
  { name: "Peugeot", slug: "peugeot" },
  { name: "Ford", slug: "ford" },
  { name: "Honda", slug: "honda" },
  { name: "Nissan", slug: "nissan" },
  { name: "Hyundai", slug: "hyundai" },
  { name: "Kia", slug: "kia" },
  { name: "Mazda", slug: "mazda" },
] as const;

function BrandLogo({ brand }: { brand: (typeof brands)[number] }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <span className="hero-brand-fallback">{brand.name}</span>;

  return (
    <Image
      src={`https://cdn.jsdelivr.net/npm/simple-icons@16.30.0/icons/${brand.slug}.svg`}
      alt=""
      width={56}
      height={56}
      unoptimized
      loading="eager"
      draggable={false}
      className="hero-brand-logo"
      onError={() => setFailed(true)}
    />
  );
}

export function HeroBrandStack({
  pauseLabel,
  playLabel,
}: {
  pauseLabel: string;
  playLabel: string;
}) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!inView || paused || reducedMotion !== false) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    const syncTimer = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") {
        timer = setInterval(() => setStep((value) => value + 1), 2400);
      }
    };

    syncTimer();
    document.addEventListener("visibilitychange", syncTimer);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", syncTimer);
    };
  }, [inView, paused, reducedMotion]);

  const tiles = (
    <span className="hero-brand-tiles" aria-hidden="true">
      <AnimatePresence initial={false}>
        {[2, 1, 0].map((depth) => {
          const sequence = step + depth;
          const brand = brands[sequence % brands.length] ?? brands[0];
          return (
            <motion.span
              key={sequence}
              className="hero-brand-tile"
              style={{ zIndex: 3 - depth }}
              initial={{ y: -30, scale: 0.72, opacity: 0 }}
              animate={{
                y: -depth * 12,
                scale: 1 - depth * 0.1,
                opacity: 1 - depth * 0.3,
              }}
              exit={{ y: 24, scale: 1.16, opacity: 0, zIndex: 4 }}
              transition={{
                duration: reducedMotion ? 0 : 0.85,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <BrandLogo brand={brand} />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );

  return (
    <div
      ref={ref}
      className="hero-brand-stack"
      data-paused={paused || reducedMotion === true}
    >
      {reducedMotion ? (
        tiles
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="hero-brand-button relative size-full rounded-[28px] p-0 hover:bg-transparent"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? playLabel : pauseLabel}
          title={paused ? playLabel : pauseLabel}
        >
          {tiles}
          <span className="hero-brand-playback" aria-hidden="true">
            {paused ? (
              <Play className="size-3" />
            ) : (
              <Pause className="size-3" />
            )}
          </span>
        </Button>
      )}
    </div>
  );
}
