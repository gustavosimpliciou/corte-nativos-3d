import { create } from 'zustand';

interface ProjectState {
  activeModelId: number | null;
  setActiveModelId: (id: number | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  activeModelId: null,
  setActiveModelId: (id) => set({ activeModelId: id }),
}));
