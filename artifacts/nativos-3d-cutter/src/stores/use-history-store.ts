import { create } from 'zustand';

interface HistoryState {
  undoStack: any[];
  redoStack: any[];
  pushAction: (action: any) => void;
  undo: () => void;
  redo: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  undoStack: [],
  redoStack: [],
  pushAction: (action) => set((state) => ({ 
    undoStack: [...state.undoStack, action],
    redoStack: []
  })),
  undo: () => set((state) => {
    if (state.undoStack.length === 0) return state;
    const action = state.undoStack[state.undoStack.length - 1];
    return {
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, action]
    };
  }),
  redo: () => set((state) => {
    if (state.redoStack.length === 0) return state;
    const action = state.redoStack[state.redoStack.length - 1];
    return {
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, action]
    };
  })
}));
