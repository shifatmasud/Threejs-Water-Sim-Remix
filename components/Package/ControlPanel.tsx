/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { useTheme } from '../../Theme.tsx';
import Toggle from '../Core/Toggle.tsx';

interface ControlPanelProps {
  isPaused: boolean;
  onTogglePause: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ isPaused, onTogglePause }) => {
  const { theme } = useTheme();

  return (
    <>
      <p style={{ ...theme.Type.Readable.Body.M, color: theme.Color.Base.Content[2] }}>
        WebGL Water Controls
      </p>
      <div style={{ borderTop: `1px solid ${theme.Color.Base.Surface[3]}`, margin: `${theme.spacing['Space.L']} 0` }} />
      <Toggle
        label="Pause Simulation"
        isOn={isPaused}
        onToggle={onTogglePause}
      />
    </>
  );
};

export default ControlPanel;
