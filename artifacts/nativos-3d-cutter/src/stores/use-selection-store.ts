import { create } from 'zustand';

interface SelectionState {
  selectedFaces: number[];
  selectFace: (faceIndex: number) => void;
  deselectFace: (faceIndex: number) => void;
  clearSelection: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedFaces: [],
  selectFace: (idx) => set((state) => ({ selectedFaces: [...state.selectedFaces, idx] })),
  deselectFace: (idx) => set((state) => ({ selectedFaces: state.selectedFaces.filter((i) => i !== idx) })),
  clearSelection: () => set({ selectedFaces: [] }),
}));
