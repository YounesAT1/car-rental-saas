import {
  ArrowRight,
  CalendarDays,
  CarFront,
  CornerDownRight,
  KeyRound,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import {
  MotionHero,
  MotionJourney,
  MotionLink,
  MotionPlatformCard,
  MotionSection,
} from "@/components/home-motion";
import { getI18n } from "@/i18n/server";

const platformAreas = [
  {
    icon: CarFront,
    key: "fleet",
  },
  {
    icon: CalendarDays,
    key: "rentals",
  },
  {
    icon: UsersRound,
    key: "team",
  },
] as const;

export default async function HomePage() {
  const {
    messages: { common, home },
  } = await getI18n();
  return (
    <>
      <MotionHero>
        <div className="hero-copy">
          <h1 id="hero-title" className="hero-title">
            <span className="hero-title-phrase">{home.hero.fleet}</span>{" "}
            <span className="hero-title-phrase">{home.hero.team}</span>
            <br />
            {home.hero.together}
          </h1>
          <p className="hero-description">
            {home.hero.description}
            <br className="hidden sm:block" /> {home.hero.supporting}
          </p>
          <div className="hero-actions">
            <MotionLink
              href="#platform"
              className="hero-action hero-action-primary"
            >
              {common.explore}
            </MotionLink>
            <MotionLink
              href="#approach"
              className="hero-action hero-action-secondary"
            >
              {common.ourApproach}
              <ArrowRight
                className="directional-icon size-4"
                aria-hidden="true"
              />
            </MotionLink>
          </div>
        </div>
      </MotionHero>

      <div className="studio-container">
        <MotionJourney ariaLabel={home.journey.label}>
          <p>
            {home.journey.title}
            <br />
            <span>{home.journey.description}</span>
          </p>
          <ol className="journey-steps">
            <li>
              <CalendarDays aria-hidden="true" />
              <span>{home.journey.reserve}</span>
              <ArrowRight
                className="journey-arrow directional-icon"
                aria-hidden="true"
              />
            </li>
            <li>
              <KeyRound aria-hidden="true" />
              <span>{home.journey.handover}</span>
              <ArrowRight
                className="journey-arrow directional-icon"
                aria-hidden="true"
              />
            </li>
            <li>
              <RotateCcw aria-hidden="true" />
              <span>{home.journey.return}</span>
            </li>
          </ol>
        </MotionJourney>
      </div>

      <MotionSection
        id="platform"
        labelledBy="platform-title"
        className="platform-section section-anchor"
      >
        <div className="studio-container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{home.platform.label}</p>
              <h2 id="platform-title">
                {home.platform.title}
                <br />
                <span>{home.platform.subtitle}</span>
              </h2>
            </div>
            <p className="section-description">
              {home.platform.description}
              <br />
              {home.platform.supporting}
            </p>
          </div>
          <div className="platform-grid">
            {platformAreas.map(({ icon: Icon, key }, index) => (
              <MotionPlatformCard key={key} index={index}>
                <span className="platform-icon">
                  <Icon size={24} strokeWidth={1.6} aria-hidden="true" />
                </span>
                <h3>{home.platform[key].title}</h3>
                <p>{home.platform[key].description}</p>
                <p className="platform-details">{home.platform[key].details}</p>
              </MotionPlatformCard>
            ))}
          </div>
        </div>
      </MotionSection>

      <MotionSection
        id="approach"
        labelledBy="approach-title"
        className="studio-container approach-section section-anchor"
      >
        <div className="approach-heading">
          <p className="eyebrow">{common.ourApproach}</p>
          <h2 id="approach-title">
            {home.approach.title}
            <br />
            {home.approach.subtitle}
          </h2>
        </div>
        <div className="approach-copy">
          <p>{home.approach.description}</p>
          <div className="availability-note">
            <CornerDownRight className="directional-icon" aria-hidden="true" />
            <p>
              <strong>{home.approach.previewTitle}</strong>
              <br />
              {home.approach.previewDescription}
            </p>
          </div>
        </div>
      </MotionSection>
    </>
  );
}
