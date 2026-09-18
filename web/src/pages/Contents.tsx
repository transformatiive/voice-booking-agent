import { Link } from "react-router-dom";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  ARTICLES,
  CONTENT_HUB,
  articlePath,
  articlesByGroup,
  contentGroupLabel,
} from "@content";

export function Contents() {
  usePageMeta(`${CONTENT_HUB.title} — Atende`, CONTENT_HUB.description);
  const setores = articlesByGroup("setor");
  const pratico = articlesByGroup("pratico");

  return (
    <div className="landing min-h-svh">
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-12 px-6 py-16">
        <div className="flex flex-col gap-4">
          <Badge variant="secondary">Conteúdos</Badge>
          <h1 className="font-heading text-4xl leading-tight tracking-tight">{CONTENT_HUB.title}</h1>
          <p className="text-lg text-muted-foreground">{CONTENT_HUB.description}</p>
          <p className="text-muted-foreground">
            Não é um catálogo de 50 páginas por ofício. São dez notas: uma por família de negócio, e quatro
            sobre o telefone, o número +351 e a agenda.
          </p>
        </div>
        <section className="flex flex-col gap-4" aria-labelledby="setores-heading">
          <h2 id="setores-heading" className="font-heading text-2xl tracking-tight">
            {contentGroupLabel("setor")}
          </h2>
          <ul className="flex flex-col gap-3">
            {setores.map((article) => (
              <li key={article.slug}>
                <Link to={articlePath(article.slug)}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{article.title}</CardTitle>
                      <CardDescription>
                        {article.family} · {article.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-4" aria-labelledby="pratico-heading">
          <h2 id="pratico-heading" className="font-heading text-2xl tracking-tight">
            {contentGroupLabel("pratico")}
          </h2>
          <ul className="flex flex-col gap-3">
            {pratico.map((article) => (
              <li key={article.slug}>
                <Link to={articlePath(article.slug)}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{article.title}</CardTitle>
                      <CardDescription>{article.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-sm text-muted-foreground">
          {ARTICLES.length} guias. A homepage continua a ser a demo e os preços — estes textos vivem neste menu.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
