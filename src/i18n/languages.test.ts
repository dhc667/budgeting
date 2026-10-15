import { describe, expect, it } from "vitest";
import { deviceLanguage } from "./languages";

describe("the device's language", () => {
  it("is the first one the device prefers that the app speaks", () => {
    expect(deviceLanguage(["de-DE", "pt-BR", "es-AR"])).toBe("pt-BR");
  });

  it("stands in for other regions of the same language", () => {
    expect(deviceLanguage(["es-ES"])).toBe("es-419");
    expect(deviceLanguage(["pt-PT"])).toBe("pt-BR");
    expect(deviceLanguage(["en-GB"])).toBe("en");
  });

  it("falls back to English when the app speaks none of the device's languages", () => {
    expect(deviceLanguage(["de-DE", "fr"])).toBe("en");
  });
});
