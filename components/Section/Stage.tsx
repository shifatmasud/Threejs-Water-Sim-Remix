/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import WebGLWater from '../Package/WebGLWater.tsx';

const Stage = () => {
  return (
    <div style={{ 
        position: 'relative', 
        width: '100%',
        height: '100%',
    }}>
        <WebGLWater />
    </div>
  );
};

export default Stage;
