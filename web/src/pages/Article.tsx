import { Link, Navigate, useParams } from "react-router-dom";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { usePageMeta } from "@/hooks/use-page-meta";
import { CONTENT_HUB_PATH, articlePath, getArticle } from "@content";

export function ArticlePage() {
  const { slug = "" } = useParams();
  const article = getArticle(slug);
  usePageMeta(
    article ? `${article.title} — Atende` : "Guia — Atende",
    article?.description ?? "Guia para PME que atendem o telefone em Portugal.",
  );

  if (!article) {
    return <Navigate to={CONTENT_HUB_PATH} replace />;
  }

  return (
    <div className="landing min-h-svh">
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-4">
          <Link to={CONTENT_HUB_PATH} className="text-sm text-muted-foreground">
            Conteúdos
          </Link>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{article.family ?? article.menuLabel}</Badge>
          </div>
          <h1 className="font-heading text-4xl leading-tight tracking-tight">{article.title}</h1>
          <p className="text-lg text-muted-foreground">{article.description}</p>
        </div>
        {article.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="font-heading text-2xl tracking-tight">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
        <Separator />
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-xl tracking-tight">Continuar a ler</h2>
          <ul className="flex flex-col gap-2">
            {article.related.map((relatedSlug) => {
              const related = getArticle(relatedSlug);
              if (!related) return null;
              return (
                <li key={relatedSlug}>
                  <Link to={articlePath(related.slug)} className="underline underline-offset-4">
                    {related.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button render={<Link to="/#demo" />}>Ouvir a demo</Button>
          <Button variant="outline" render={<Link to={CONTENT_HUB_PATH} />}>
            Todos os guias
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
