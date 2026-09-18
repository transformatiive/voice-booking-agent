import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Wordmark } from "@/components/wordmark";

export function AppChrome({
  trailing,
  children,
}: {
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Atende, página inicial">
            <Wordmark />
          </Link>
          {trailing}
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6">{children}</div>
      <footer className="mt-auto border-t bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted-foreground sm:px-6">
          <Wordmark size={19} />
          <nav className="flex flex-wrap gap-4">
            <a className="hover:text-teal" href="/privacidade">
              Privacidade
            </a>
            <a className="hover:text-teal" href="/termos">
              Termos
            </a>
            <a className="hover:text-teal" href="/dpa">
              DPA
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
