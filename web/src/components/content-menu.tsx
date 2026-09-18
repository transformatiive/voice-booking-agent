import { Link } from "react-router-dom";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  CONTENT_HUB,
  CONTENT_HUB_PATH,
  articlePath,
  articlesByGroup,
  contentGroupLabel,
} from "@content";

export function ContentMenu() {
  const setores = articlesByGroup("setor");
  const pratico = articlesByGroup("pratico");

  return (
    <NavigationMenu data-content-menu="desktop" align="end" className="landing-content-menu">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="landing-content-trigger">Conteúdos</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="landing-content-panel">
              <div className="landing-content-col">
                <p className="landing-content-kicker">{contentGroupLabel("setor")}</p>
                {setores.map((article) => (
                  <NavigationMenuLink
                    key={article.slug}
                    href={articlePath(article.slug)}
                    render={<Link to={articlePath(article.slug)} />}
                    className="landing-content-item"
                  >
                    <span>{article.menuLabel}</span>
                    <span>{article.description}</span>
                  </NavigationMenuLink>
                ))}
              </div>
              <div className="landing-content-col">
                <p className="landing-content-kicker">{contentGroupLabel("pratico")}</p>
                {pratico.map((article) => (
                  <NavigationMenuLink
                    key={article.slug}
                    href={articlePath(article.slug)}
                    render={<Link to={articlePath(article.slug)} />}
                    className="landing-content-item"
                  >
                    <span>{article.menuLabel}</span>
                    <span>{article.description}</span>
                  </NavigationMenuLink>
                ))}
                <NavigationMenuLink
                  href={CONTENT_HUB_PATH}
                  render={<Link to={CONTENT_HUB_PATH} />}
                  className="landing-content-item"
                >
                  <span>Índice</span>
                  <span>{CONTENT_HUB.description}</span>
                </NavigationMenuLink>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
