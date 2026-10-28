import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { SocialBrandIcon } from "../../../src/components/assets/SocialBrandIcon";
test("renders real catalog brand geometry with both ID forms and quietly skips unknown brands", () => {
  const view = render(<SocialBrandIcon id="instagram" size={24} className="social" />);
  expect(view.container.querySelector(".social")).toHaveStyle({ width: "24px", height: "24px" });
  expect(view.container.querySelector("svg path")).not.toBeNull();
  view.rerender(<SocialBrandIcon id="brand-youtube" />);
  expect(view.container.querySelector("span")).toHaveStyle({ width: "16px" });
  view.rerender(<SocialBrandIcon id="generic" />);
  expect(view.container).toBeEmptyDOMElement();
});
