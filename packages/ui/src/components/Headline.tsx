export function Headline({
  claim,
  explain,
  level = 'h1',
}: {
  claim: string;
  explain?: string;
  level?: 'h1' | 'h2';
}) {
  const Tag = level;
  return (
    <Tag className={`ar-headline ar-${level}`}>
      {claim}
      {explain ? <span className="ar-headline-explain"> {explain}</span> : null}
    </Tag>
  );
}
