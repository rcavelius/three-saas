// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
vi.mock("@/lib/authClient", () => ({
  authClient: () => ({ signUp: { email: signUp } }),
  authErrorMessage: () => "That email is already registered.",
}));

const { SignupForm } = await import("./AuthForms");

const sent: { name: string; props: Record<string, unknown> }[] = [];
beforeEach(() => {
  sent.length = 0;
  signUp.mockReset();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (url === "/api/events") sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(null, { status: 204 }));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new.user@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-long-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("sign-up funnel events", () => {
  it("signup_started fires on view; signup_submitted fires on submit with the outcome, never the email", async () => {
    signUp.mockResolvedValue({ error: null });
    render(<SignupForm plan="pro" />);
    await waitFor(() => expect(sent.map((e) => e.name)).toEqual(["signup_started"]));
    fill();
    await screen.findByText("Check your email");
    expect(sent.map((e) => e.name)).toEqual(["signup_started", "signup_submitted"]);
    expect(sent[1]!.props).toEqual({ plan: "pro", outcome: "sent" });
    expect(JSON.stringify(sent)).not.toMatch(/new\.user|example\.com|password/);
  });

  it("a refused sign-up is logged as an error outcome", async () => {
    signUp.mockResolvedValue({ error: { status: 422, message: "exists" } });
    render(<SignupForm />);
    fill();
    await screen.findByRole("alert");
    expect(sent.find((e) => e.name === "signup_submitted")!.props).toEqual({ plan: "free", outcome: "error" });
  });
});
