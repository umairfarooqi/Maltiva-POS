import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { PosStorage } from './services/storage';
import { initializeTheme } from './services/theme';

PosStorage.sanitizeBrowserData();
initializeTheme();
createRoot(document.getElementById('root')!).render(<App />);
