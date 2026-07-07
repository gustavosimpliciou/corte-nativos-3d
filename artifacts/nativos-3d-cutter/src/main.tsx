import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// Force dark mode at the document level for the Nativos 3D dark theme
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
