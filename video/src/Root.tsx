import { Composition } from 'remotion';
import React from 'react';
import { Main } from './Main';
import { Vertical } from './Vertical';

export const Root: React.FC = () => {
  return (
    <>
      <Composition id="Main" component={Main} durationInFrames={5400} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="Vertical" component={Vertical} durationInFrames={1200} fps={30} width={1080} height={1920} defaultProps={{}} />
    </>
  );
};
