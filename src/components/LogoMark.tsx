import * as React from "react";

type LogoMarkProps = {
  className?: string;
  title?: string;
  withBackground?: boolean;
};

export function LogoMark({ className, title = "Shelf", withBackground = false }: LogoMarkProps) {
  const titleId = React.useId();

  return (
    <svg
      aria-labelledby={title ? titleId : undefined}
      className={className}
      fill="none"
      role="img"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={titleId}>{title}</title> : null}

      {withBackground ? (
        <rect x="2" y="2" width="28" height="28" rx="8" stroke="currentColor" strokeWidth="2" />
      ) : null}

      <rect x="9" y="9" width="6" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11.5v8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />

      <rect x="17" y="10" width="6" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M20 12.5v7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />

      <path d="M8 23.5h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
