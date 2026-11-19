import { Link } from "@tanstack/react-router";

export function PublicFooter() {
  return (
    <footer className="public-footer" aria-label="Solaris Studio footer">
      <div className="public-footer-inner">
        <p className="text-xs text-muted-foreground">
          Solaris Studio
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Footer navigation">
          <Link to="/" className="public-footer-link">Home</Link>
          <Link to="/participate" className="public-footer-link">Participate</Link>
          <Link to="/auth" className="public-footer-link">Sign in</Link>
          <Link to="/rules" className="public-footer-link">
            Rules
          </Link>

        </nav>
      </div>
    </footer>
  );
}
