import { Composition } from 'remotion';
import { BrandCard } from './BrandCard';

// 4K at 30fps. Duration in frames, so 150 = 5.0s.
export const RemotionRoot: React.FC = () => (
  <Composition
    id="BrandCard"
    component={BrandCard}
    durationInFrames={150}
    fps={30}
    width={3840}
    height={2160}
    defaultProps={{
      line1: 'ALL IN 1',
      line2: 'EVENTS',
      tagline: 'Luxury event production',
    }}
  />
);
