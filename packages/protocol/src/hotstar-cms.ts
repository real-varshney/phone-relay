/** Hotstar CMS poster/thumbnail paths served from img.hotstar.com, not www (which returns SPA HTML). */
const CMS_PATH =
  /^(?:\/in)?(\/w_\d+\/sources\/r1\/cms\/prod\/[^?#]+)$/;

const CMS_PATH_IN_TEXT =
  /https?:\/\/www\.hotstar\.com(?:\/in)?(\/w_\d+\/sources\/r1\/cms\/prod\/[^"'\\\s]+)/g;

const RELATIVE_CMS_PATH =
  /^(?:in\/)?(w_\d+\/sources\/r1\/cms\/prod\/[^"'#\s?]+)/;

export function extractHotstarCmsPath(pathname: string): string | null {
  const m = pathname.match(CMS_PATH);
  return m ? m[1] : null;
}

export function hotstarCmsCdnUrl(cmsPath: string, search = "", hash = ""): string {
  const path = cmsPath.startsWith("/") ? cmsPath : `/${cmsPath}`;
  return `https://img.hotstar.com/image/upload${path}${search}${hash}`;
}

/** Map www.hotstar.com CMS image URLs to img.hotstar.com CDN. */
export function remapHotstarCmsAssetUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "www.hotstar.com") return url;
    const cms = extractHotstarCmsPath(u.pathname);
    if (!cms) return url;
    return hotstarCmsCdnUrl(cms, u.search, u.hash);
  } catch {
    return url;
  }
}

export function extractHotstarCmsFromRelativePath(path: string): string | null {
  const m = path.match(RELATIVE_CMS_PATH);
  return m ? m[1] : null;
}

export function rewriteHotstarCmsUrlsInText(text: string, proxyOrigin: string): string {
  return text.replace(CMS_PATH_IN_TEXT, (_m, cmsPath: string) => {
    return `${proxyOrigin}/proxy/https/img.hotstar.com/image/upload${cmsPath}`;
  });
}
