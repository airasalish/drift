import { useState } from "react";

/** Best-effort company mark from a stored domain. Never invents a logo —
 *  if the domain is missing or the favicon request fails, render nothing
 *  and let the ticker stand alone (same fallback as company_name). */
export function CompanyFavicon({
  domain,
  symbol,
}: {
  domain: string | null | undefined;
  symbol: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return null;

  return (
    <img
      className="company-favicon"
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
      alt=""
      width={16}
      height={16}
      onError={() => setFailed(true)}
      title={symbol}
    />
  );
}
