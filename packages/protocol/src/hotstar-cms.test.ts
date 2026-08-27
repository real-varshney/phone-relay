import { describe, expect, it } from "vitest";
import {
  extractHotstarCmsPath,
  remapHotstarCmsAssetUrl,
  rewriteHotstarCmsUrlsInText,
} from "./hotstar-cms.ts";

describe("hotstar CMS image remap", () => {
  it("remaps /in/w_256 CMS paths to img.hotstar.com", () => {
    const src =
      "https://www.hotstar.com/in/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3";
    expect(remapHotstarCmsAssetUrl(src)).toBe(
      "https://img.hotstar.com/image/upload/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3",
    );
  });

  it("remaps bare /w_256 CMS paths", () => {
    expect(
      remapHotstarCmsAssetUrl(
        "https://www.hotstar.com/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3",
      ),
    ).toBe(
      "https://img.hotstar.com/image/upload/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3",
    );
  });

  it("leaves non-CMS www URLs unchanged", () => {
    expect(remapHotstarCmsAssetUrl("https://www.hotstar.com/in/home")).toBe(
      "https://www.hotstar.com/in/home",
    );
  });

  it("rewrites CMS URLs embedded in JSON text", () => {
    const json =
      '{"poster":"https://www.hotstar.com/in/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3"}';
    expect(rewriteHotstarCmsUrlsInText(json, "http://127.0.0.1:3000")).toBe(
      '{"poster":"http://127.0.0.1:3000/proxy/https/img.hotstar.com/image/upload/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3"}',
    );
  });

  it("extracts cms path from pathname", () => {
    expect(
      extractHotstarCmsPath("/in/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3"),
    ).toBe("/w_256/sources/r1/cms/prod/2448/1462448-v-f21a9b6d25d3");
  });
});
