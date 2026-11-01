import { PageStage } from '../components';

export function Placeholder({ title }: { title: string }) {
  return <PageStage title={title} lead="Bientôt disponible." />;
}
