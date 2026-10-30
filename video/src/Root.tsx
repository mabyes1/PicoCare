import { Composition } from 'remotion';
import React from 'react';
import { Main } from './Main';
import { Vertical } from './Vertical';
import { MAIN_DURATION_FRAMES, VERTICAL_DURATION_FRAMES } from './captions';

export const Root: React.FC = () => {
  return (
    <>
      <Composition id="Main" component={Main} durationInFrames={MAIN_DURATION_FRAMES} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="Vertical" component={Vertical} durationInFrames={VERTICAL_DURATION_FRAMES} fps={30} width={1080} height={1920} defaultProps={{}} />
    </>
  );
};
