import { Link } from "react-router-dom";
import { ContentMenu } from "@/components/content-menu";
import { CONTENT_HUB_PATH } from "@content";

const LANDING_LINKS = [
  { href: "/#produto", label: "Produto" },
  { href: "/#para-quem", label: "Soluções" },
  { href: "/#precos", label: "Preços" },
  { href: "/#faq", label: "Sobre" },
] as const;

export function SiteHeader({ onStart }: { onStart?: () => void }) {
  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <Link to="/" className="landing-logo">
          Atende
          <span className="landing-logo-dot" aria-hidden="true" />
        </Link>
        <nav className="landing-nav" aria-label="Secções">
          {LANDING_LINKS.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <ContentMenu />
        </nav>
        <Link to={CONTENT_HUB_PATH} className="landing-contents-compact">
          Conteúdos
        </Link>
        {onStart ? (
          <button type="button" className="landing-btn landing-btn-primary" onClick={onStart}>
            Começar
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          <Link to="/?criar=1" className="landing-btn landing-btn-primary">
            Começar
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </header>
  );
}
