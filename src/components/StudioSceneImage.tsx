import React from 'react';

/** A separate visual insert: portrait and landscape images retain their full composition. */
export const StudioSceneImage = React.memo(function StudioSceneImage({ src, effect = 'pop', title }: {
  src: string;
  effect?: 'pop' | 'slam' | 'float';
  title: string;
}) {
  return (
    <figure data-testid="studio-user-attached-image" aria-label={title} className={`studio-scene-image studio-scene-image--${effect}`}>
      <img src={src} alt="本段吐槽配图" className="studio-scene-image-art" />
    </figure>
  );
});
