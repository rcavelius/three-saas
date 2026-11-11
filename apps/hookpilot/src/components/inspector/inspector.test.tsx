// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestDetailDTO, RequestSummaryDTO } from "@/lib/types";
import { RequestDetail } from "./RequestDetail";
import { RequestList } from "./RequestList";

afterEach(cleanup);

const summary = (i: number): RequestSummaryDTO => ({
  id: `00000000-0000-0000-0000-00000000000${i}`,
  cursor: String(i),
  method: i % 2 ? "POST" : "GET",
  path: `/p${i}`,
  query: "",
  contentType: "application/json",
  bodySize: 10,
  truncated: false,
  sourceIp: "1.2.3.4",
  receivedAt: new Date().toISOString(),
});

describe("RequestList keyboard navigation", () => {
  it("moves the selection with arrow keys, j/k, Home and End", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const reqs = [1, 2, 3].map(summary);
    const onSelect = vi.fn();
    const props = { requests: reqs, freshIds: new Set<string>(), onOpen: vi.fn(), now: Date.now(), hasMore: false, loadingMore: false, onLoadMore: vi.fn() };
    const { rerender } = render(<RequestList {...props} selectedId={reqs[0]!.id} onSelect={onSelect} />);
    const list = screen.getByRole("listbox");
    expect(list.getAttribute("aria-activedescendant")).toBe(`req-${reqs[0]!.id}`);
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenLastCalledWith(reqs[1]!.id);
    rerender(<RequestList {...props} selectedId={reqs[1]!.id} onSelect={onSelect} />);
    fireEvent.keyDown(list, { key: "k" });
    expect(onSelect).toHaveBeenLastCalledWith(reqs[0]!.id);
    fireEvent.keyDown(list, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(reqs[2]!.id);
    fireEvent.keyDown(list, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(reqs[0]!.id);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });
});

describe("RequestDetail secret masking", () => {
  it("masks sensitive headers until revealed", () => {
    const detail: RequestDetailDTO = {
      ...summary(1),
      query: "token=qsecret&page=2",
      headers: [
        ["authorization", "Bearer topsecretvalue"],
        ["content-type", "application/json"],
      ],
      bodyBase64: btoa('{"a":1}'),
      storedBodySize: 7,
      bodySize: 7,
    };
    const { container } = render(<RequestDetail request={detail} captureUrl="http://x/h/abc" onDelete={vi.fn()} now={Date.now()} />);
    expect(container.textContent).not.toContain("topsecretvalue");
    expect(container.textContent).not.toContain("qsecret");
    expect(container.textContent).toContain("application/json");
    fireEvent.click(screen.getByRole("button", { name: "Reveal authorization" }));
    expect(container.textContent).toContain("topsecretvalue");
    expect(container.textContent).not.toContain("qsecret");
    fireEvent.click(screen.getByRole("button", { name: /Reveal 2 secrets/ }));
    expect(container.textContent).toContain("qsecret");
  });
});
