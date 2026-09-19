import { Link } from "@tanstack/react-router";

export function PublicFooter() {
  return (
    <footer className="public-footer" aria-label="Solaris Studio footer">
      <div className="public-footer-inner">
        <p className="text-xs text-muted-foreground">
          Solaris Studio
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Footer navigation">
          <Link to="/site-directory" className="public-footer-link">
            All Solaris pages
          </Link>
          <Link to="/guide" className="public-footer-link">
            Help
          </Link>
          <Link to="/rules" className="public-footer-link">
            Rules
          </Link>
          <Link to="/integrity" className="public-footer-link">
            Trust & Integrity
          </Link>
        </nav>
      </div>
    </footer>
  );
}
