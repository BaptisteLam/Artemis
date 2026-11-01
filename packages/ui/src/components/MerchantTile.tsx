export function MerchantTile({ name }: { name: string }) {
  const initials = name
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span className="ar-merchant" aria-hidden="true">
      {initials || '•'}
    </span>
  );
}
