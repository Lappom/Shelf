/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const recoMocks = vi.hoisted(() => ({
  dismissRecommendationAction: vi.fn(async () => ({ ok: true as const })),
  logRecommendationAnalyticsBatchAction: vi.fn(async () => ({ ok: true as const })),
  markRecommendationsSeenAction: vi.fn(async () => undefined),
  refreshRecommendationsAction: vi.fn(async () => ({ ok: true as const })),
  setRecommendationFeedbackAction: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock("@/app/(app)/recommendations/actions", () => recoMocks);

vi.mock("next/link", () => ({
  default({ children, href, ...rest }: { children: ReactNode; href: string; className?: string }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock("next/image", () => ({
  default({ alt, src, className }: { alt?: string; src?: string; className?: string }) {
    // Test mock: using <img> is sufficient here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt ?? ""} src={src} className={className} />;
  },
}));

import { RecommendationsCarousel } from "./RecommendationsCarousel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const { dismissRecommendationAction } = recoMocks;

describe("RecommendationsCarousel", () => {
  it("renders book title and dismiss removes the card", async () => {
    render(
      <RecommendationsCarousel
        initialItems={[
          {
            bookId: "550e8400-e29b-41d4-a716-446655440000",
            title: "Test Book Alpha",
            authors: ["Ada"],
            coverUrl: null,
            coverToken: null,
            reasons: [],
          },
        ]}
      />,
    );
    const user = userEvent.setup();

    expect(await screen.findByText("Test Book Alpha")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /pas intéressé/i }));
    expect(dismissRecommendationAction).toHaveBeenCalledWith({
      bookId: "550e8400-e29b-41d4-a716-446655440000",
      source: "carousel",
    });
    await waitFor(() => {
      expect(screen.queryByText("Test Book Alpha")).not.toBeInTheDocument();
    });
  });

  it("empty state shows generate button", () => {
    render(<RecommendationsCarousel initialItems={[]} />);
    expect(screen.getByRole("button", { name: /générer mes suggestions/i })).toBeInTheDocument();
  });
});
