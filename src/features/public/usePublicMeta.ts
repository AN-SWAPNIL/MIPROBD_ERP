import { useEffect } from "react";

type PublicMeta = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  publishedOn?: string;
};

function setMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function usePublicMeta({ title, description, path = "/", image = "/medical-products.png", type = "website", publishedOn }: PublicMeta) {
  useEffect(() => {
    const url = `https://www.miprobd.com${path}`;
    const imageUrl = image.startsWith("http") ? image : `https://www.miprobd.com${image}`;
    document.title = title;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:type"]', "property", "og:type", type);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[property="og:image"]', "property", "og:image", imageUrl);
    setMeta('meta[name="robots"]', "name", "robots", "index,follow,max-image-preview:large");
    if (publishedOn) setMeta('meta[property="article:published_time"]', "property", "article:published_time", publishedOn);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [description, image, path, publishedOn, title, type]);
}
