/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useRef, useEffect, useState } from 'react';
import { type MotionValue, animate } from 'framer-motion';
import { useTheme } from '../../Theme.tsx';

interface RangeSliderProps {
  label: string;
  motionValue: MotionValue<number>;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ label, motionValue, onCommit, min = 0, max = 100 }) => {
  const { theme } = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(motionValue.get());
  const [isDragging, setIsDragging] = useState(false);

  // Sync internal state with external motion value updates (e.g. undo/redo)
  useEffect(() => {
    const unsubscribe = motionValue.onChange((v) => {
      if (!isDragging) {
        setInternalValue(v);
      }
    });
    return unsubscribe;
  }, [motionValue, isDragging]);

  const updateValueFromPointer = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const newValue = Math.round(min + percent * (max - min));
    
    setInternalValue(newValue);
    motionValue.set(newValue); // Real-time update
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    trackRef.current?.setPointerCapture(e.pointerId);
    updateValueFromPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      updateValueFromPointer(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      trackRef.current?.releasePointerCapture(e.pointerId);
      onCommit(internalValue); // Commit only on release
    }
  };

  const percentage = ((internalValue - min) / (max - min)) * 100;

  const numberInputStyle: React.CSSProperties = {
    width: '60px',
    padding: theme.spacing['Space.XS'],
    borderRadius: theme.radius['Radius.S'],
    border: `1px solid ${theme.Color.Base.Surface[3]}`,
    backgroundColor: theme.Color.Base.Surface[2],
    color: theme.Color.Base.Content[1],
    fontFamily: theme.Type.Readable.Body.M.fontFamily,
    fontSize: '14px',
    textAlign: 'center',
    outline: 'none',
  };

  return (
    <div onPointerDown={(e) => e.stopPropagation()}>
      <label style={{ ...theme.Type.Readable.Label.S, display: 'block', marginBottom: theme.spacing['Space.S'], color: theme.Color.Base.Content[2] }}>
        {label}
      </label>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing['Space.S'] }}>
        
        {/* Custom Track */}
        <div 
            ref={trackRef}
            style={{ 
                flex: 1, 
                height: '24px', 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                touchAction: 'none' // Prevent scrolling while dragging
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            <div style={{ 
                position: 'relative', 
                width: '100%', 
                height: '6px', 
                backgroundColor: theme.Color.Base.Surface[3], 
                borderRadius: '3px',
                overflow: 'visible' 
            }}>
                {/* Fill Bar */}
                <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    height: '100%', 
                    width: `${percentage}%`, 
                    backgroundColor: theme.Color.Accent.Surface[1], 
                    borderRadius: '3px' 
                }} />
                
                {/* Thumb */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${percentage}%`,
                    width: '18px',
                    height: '18px',
                    backgroundColor: theme.Color.Base.Surface[1],
                    border: `2px solid ${theme.Color.Accent.Surface[1]}`,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    boxShadow: theme.effects['Effect.Shadow.Drop.1'],
                    transition: 'transform 0.1s ease',
                    transformOrigin: 'center'
                }} />
            </div>
        </div>

        {/* Number Input */}
        <input
          type="number"
          min={min}
          max={max}
          value={internalValue}
          onChange={(e) => {
             const v = parseInt(e.target.value, 10) || 0;
             const clamped = Math.min(Math.max(v, min), max);
             setInternalValue(clamped);
             motionValue.set(clamped);
          }}
          onBlur={() => onCommit(internalValue)}
          onKeyDown={(e) => {
              if (e.key === 'Enter') {
                  onCommit(internalValue);
                  (e.target as HTMLInputElement).blur();
              }
          }}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
};

export default RangeSlider;