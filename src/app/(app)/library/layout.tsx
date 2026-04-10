import { Fraunces } from "next/font/google";

const libraryDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-library-display",
  display: "swap",
});

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`library-shell ${libraryDisplay.variable}`}>
      <div className="library-shell-content mx-auto w-full max-w-7xl space-y-6 px-6 py-10">
        {children}
      </div>
    </div>
  );
}
