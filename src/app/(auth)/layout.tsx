export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-[calc(100vh-0px)] items-center justify-center p-6">
      <div className="bg-card w-full max-w-md rounded-2xl border p-6 shadow-sm">{children}</div>
    </div>
  );
}
