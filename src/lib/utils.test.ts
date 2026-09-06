import { expect, test } from "vitest";
import { cn } from "./utils";

test("combines conditional classes and resolves Tailwind conflicts", () => {
  expect(cn("px-2", { hidden: false, "font-bold": true }, "px-4")).toBe("font-bold px-4");
});
