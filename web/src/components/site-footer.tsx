import { Link } from "react-router-dom";
import { CONTENT_HUB_PATH } from "@content";

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <span className="landing-footer-brand">Atende</span>
        <div className="landing-footer-links">
          <Link to={CONTENT_HUB_PATH}>Conteúdos</Link>
          <a href="/privacidade">Privacidade</a>
          <a href="/termos">Termos</a>
          <a href="/dpa">DPA</a>
        </div>
      </div>
    </footer>
  );
}
