import { describe, it, expect } from "vitest";
import { renderMarkdown } from "@/components/Chatbot";

describe("renderMarkdown", () => {
  it("escapes raw HTML so model output cannot inject markup", () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("turns **bold** into a safe <strong> tag", () => {
    expect(renderMarkdown("**critical** event")).toContain("<strong>critical</strong>");
  });

  it("renders bullet lists", () => {
    const html = renderMarkdown("- one\n- two");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("escapes attributes inside bold content", () => {
    const html = renderMarkdown('**" onmouseover="x**');
    expect(html).not.toContain('onmouseover="');
    expect(html).toContain("&quot; onmouseover=&quot;x");
  });
});