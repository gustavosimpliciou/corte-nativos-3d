import { create } from 'zustand';

interface UIState {
  selectedTool: 'select' | 'expand' | 'contract' | 'subtract' | 'invert';
  setSelectedTool: (tool: 'select' | 'expand' | 'contract' | 'subtract' | 'invert') => void;
  rightPanelMode: 'smart' | 'region';
  setRightPanelMode: (mode: 'smart' | 'region') => void;
  sensitivity: number;
  setSensitivity: (val: number) => void;
  closeMesh: boolean;
  setCloseMesh: (val: boolean) => void;
  repairMesh: boolean;
  setRepairMesh: (val: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTool: 'select',
  setSelectedTool: (tool) => set({ selectedTool: tool }),
  rightPanelMode: 'smart',
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  sensitivity: 50,
  setSensitivity: (val) => set({ sensitivity: val }),
  closeMesh: true,
  setCloseMesh: (val) => set({ closeMesh: val }),
  repairMesh: false,
  setRepairMesh: (val) => set({ repairMesh: val }),
}));
