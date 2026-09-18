import { useEffect } from "react";

export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    const existing = document.querySelector('meta[name="description"]');
    const meta = existing ?? document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", description);
    if (!existing) document.head.appendChild(meta);
  }, [title, description]);
}
